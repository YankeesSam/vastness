import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Matrix4,
  PerspectiveCamera,
  Points,
  PointsMaterial,
} from "three";
import { viewStore } from "../../app/store/view";
import {
  bodyPriority,
  declutter,
  LABEL_OFFSET_PX,
  markerShown,
  pixelRadius,
  project,
} from "../../core/labels/declutter";
import type { BodyFrame } from "../bodies/Bodies";
import { CATALOG_BY_ID } from "../../app/catalog";
import { SCENE_OBJECTS, objectIndex } from "../bodies/positions";
import { satelliteShown } from "../satellites/satellites";
import { drawnRadiusKm } from "../spacecraft/model";
import { colourOf } from "../colours";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import type { ScreenFrame } from "./screen";

// VN-SCN-003: constant-size markers (one Points draw call, round sprites) for every body whose disc is too small to
// see, and the label layout: project each body, declutter by priority, move the DOM labels. Runs after the camera.

/** Marker diameter, px. */
export const MARKER_SIZE_PX = 7;

function discTexture(size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const a = Math.max(0, Math.min(1, r - d)); // one pixel of antialiasing at the rim
      const o = 4 * (y * size + x);
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(a * 255);
    }
  const t = new DataTexture(data, size, size);
  t.needsUpdate = true;
  return t;
}

export function Markers({ frame, screen }: { frame: BodyFrame; screen: ScreenFrame }) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const n = SCENE_OBJECTS.length;

  const points = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * n), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(3 * n), 3));
    geometry.setDrawRange(0, 0);
    const material = new PointsMaterial({
      size: MARKER_SIZE_PX,
      sizeAttenuation: false,
      vertexColors: true,
      map: discTexture(),
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
    });
    const p = new Points(geometry, material);
    p.frustumCulled = false;
    p.renderOrder = 1;
    return p;
  }, [n]);
  useEffect(
    () => () => {
      points.geometry.dispose();
      const m = points.material as PointsMaterial;
      m.map?.dispose();
      m.dispose();
    },
    [points],
  );

  const scratch = useMemo(
    () => ({
      rel: new Float64Array(3 * n),
      viewProj: new Matrix4(),
      pt: { x: 0, y: 0, ok: false },
      colours: SCENE_OBJECTS.map((b) => new Color(CATALOG_BY_ID.get(b.id)?.colour ?? colourOf(b.id))),
      lastShown: new Uint8Array(n),
      earth: objectIndex(399),
      labels: "",
    }),
    [n],
  );

  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const st = viewStore.getState();
    const s = screen.set;
    screen.width = size.width;
    screen.height = size.height;
    camera.updateMatrixWorld();
    scratch.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const fov = (camera.fov * Math.PI) / 180;
    const pos = points.geometry.getAttribute("position") as BufferAttribute;
    const col = points.geometry.getAttribute("color") as BufferAttribute;
    const rel = scratch.rel;
    let k = 0;
    // VN-CAT-007: Earth satellites only while the camera is near Earth (or the satellite is selected).
    const e = scratch.earth;
    const toEarth = frame.ok[e]
      ? Math.hypot(
          frame.world[3 * e]! - rig.cam[0]!,
          frame.world[3 * e + 1]! - rig.cam[1]!,
          frame.world[3 * e + 2]! - rig.cam[2]!,
        )
      : Infinity;
    for (let i = 0; i < n; i++) {
      screen.marker[i] = 0;
      s.ok[i] = 0;
      // Measured once, while every label is still shown (names do not change; a layout read each frame reflows).
      const span = screen.spans[i];
      if (span && s.w[i] === 0) {
        s.w[i] = span.offsetWidth;
        s.h[i] = span.offsetHeight;
      }
      if (!frame.ok[i]) continue;
      const b = SCENE_OBJECTS[i]!;
      if (b.kind === "satellite" && !satelliteShown(toEarth, st.selection === b.id)) continue;
      toCamera(frame.world, rig.cam, rel, 3 * i, 3 * i);
      const x = rel[3 * i]!;
      const y = rel[3 * i + 1]!;
      const z = rel[3 * i + 2]!;
      const p = project(scratch.viewProj.elements, x, y, z, size.width, size.height, scratch.pt);
      if (!p.ok) continue;
      s.x[i] = p.x;
      s.y[i] = p.y;
      s.ok[i] = 1;
      s.priority[i] =
        b.kind === "body"
          ? bodyPriority(b.id, st.selection === b.id)
          : (CATALOG_BY_ID.get(b.id)?.priority ?? 0) + (st.selection === b.id ? 1000 : 0);
      const dist = Math.hypot(x, y, z);
      // VN-CAT-006: within model range a spacecraft is drawn at least icon-sized, and its marker gives way to it.
      const drawn = b.kind === "spacecraft" ? drawnRadiusKm(dist, fov, size.height) : frame.radius[i]!; // VN-SCL-002: drawn radius
      screen.radiusPx[i] = pixelRadius(drawn, dist, fov, size.height);
      if (st.layers.markers && markerShown(screen.radiusPx[i]!)) {
        screen.marker[i] = 1;
        pos.setXYZ(k, x, y, z);
        const c = scratch.colours[i]!;
        col.setXYZ(k, c.r, c.g, c.b);
        k++;
      }
    }
    points.geometry.setDrawRange(0, k);
    pos.needsUpdate = true;
    col.needsUpdate = true;

    declutter(s, n, size.width, size.height);
    let changed = false;
    for (let i = 0; i < n; i++) {
      const on = st.layers.labels && s.shown[i] === 1;
      const span = screen.spans[i];
      // VN-EPH-011: the "(illustrative orbit)" tag follows the frame; the label is measured again when it changes.
      const tag = SCENE_OBJECTS[i]!.kind !== "body" ? (span?.lastElementChild as HTMLElement | null) : null;
      if (tag && tag.hidden !== (frame.illustrative[i] === 0)) {
        tag.hidden = frame.illustrative[i] === 0;
        s.w[i] = 0;
        changed = true;
      }
      if (span) {
        if (on) span.style.transform = `translate(${s.x[i]! + LABEL_OFFSET_PX}px, ${s.y[i]! - s.h[i]! / 2}px)`;
        if (span.hidden === on) span.hidden = !on;
      }
      if ((on ? 1 : 0) !== scratch.lastShown[i]) {
        scratch.lastShown[i] = on ? 1 : 0;
        changed = true;
      }
    }
    // For e2e specs: the names of the labels shown, in body order (rebuilt only when the set changes).
    if (changed) {
      scratch.labels = SCENE_OBJECTS.filter((_, i) => scratch.lastShown[i])
        .map((b) => b.name)
        .join(",");
      canvas.dataset.labels = scratch.labels;
      // For e2e specs: the spacecraft drawn on an illustrative orbit (VN-EPH-011).
      canvas.dataset.illustrative = SCENE_OBJECTS.filter((_, i) => frame.illustrative[i])
        .map((b) => b.name)
        .join(",");
    }
  }, PRIORITY.objects);

  return <primitive object={points} />;
}
