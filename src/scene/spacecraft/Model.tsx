import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { viewStore } from "../../app/store/view";
import { CATALOG_BY_ID } from "../../app/catalog";
import type { BodyFrame } from "../bodies/Bodies";
import { SCENE_OBJECTS } from "../bodies/positions";
import { colourOf } from "../colours";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { drawnRadiusKm, modelShown } from "./model";

// VN-CAT-006: a simple generic spacecraft (a bus in the catalog colour, two solar panels, a dish) drawn within
// 10,000 km of the camera, sized by drawnRadiusKm and turned so its panels face the Sun. One mesh per spacecraft,
// hidden beyond range (no draw call); data-models on the canvas lists the names drawn, for e2e specs.

const CRAFT = SCENE_OBJECTS.map((o, i) => ({ ...o, i })).filter((o) => o.kind === "spacecraft");

/** Unit model: bounding radius 1, panels in the x-y plane (facing +z), dish on -z. Group 0 bus and dish, 1 panels. */
function unitGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const bus = new BoxGeometry(0.5, 0.5, 0.6);
  const dish = new CylinderGeometry(0.4, 0.05, 0.15, 24).rotateX(Math.PI / 2).translate(0, 0, -0.38);
  const left = new BoxGeometry(0.75, 0.32, 0.02).translate(-0.65, 0, 0);
  const right = new BoxGeometry(0.75, 0.32, 0.02).translate(0.65, 0, 0);
  parts.push(mergeGeometries([bus, dish])!, mergeGeometries([left, right])!);
  const g = mergeGeometries(parts, true)!;
  for (const p of [bus, dish, left, right, ...parts]) p.dispose();
  g.computeBoundingSphere();
  return g;
}

export function SpacecraftModels({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);

  const { group, meshes, geometry, materials } = useMemo(() => {
    const geometry = unitGeometry();
    const panels = new MeshLambertMaterial({ color: "#2a3f6b" });
    const buses = CRAFT.map(
      (c) => new MeshLambertMaterial({ color: CATALOG_BY_ID.get(c.id)?.colour ?? colourOf(c.id) }),
    );
    const group = new Group();
    const meshes = CRAFT.map((c, k) => {
      const m = new Mesh(geometry, [buses[k]!, panels]);
      m.name = c.name;
      m.visible = false;
      m.frustumCulled = false;
      group.add(m);
      return m;
    });
    return { group, meshes, geometry, materials: [...buses, panels] };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
    [geometry, materials],
  );

  const scratch = useMemo(
    () => ({ rel: new Float64Array(3), sun: new Float64Array(3), look: new Vector3(), shown: "" }),
    [],
  );

  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const on = viewStore.getState().layers.markers;
    const fov = (camera.fov * Math.PI) / 180;
    const sunOk = frame.ok[0] === 1;
    if (sunOk) toCamera(frame.world, rig.cam, scratch.sun, 0);
    let names = "";
    for (let k = 0; k < CRAFT.length; k++) {
      const c = CRAFT[k]!;
      const m = meshes[k]!;
      m.visible = false;
      // VN-EPH-011: no model on an illustrative orbit; the marker and its label say what it is.
      if (!on || !frame.ok[c.i] || frame.illustrative[c.i]) continue;
      toCamera(frame.world, rig.cam, scratch.rel, 3 * c.i);
      const x = scratch.rel[0]!;
      const y = scratch.rel[1]!;
      const z = scratch.rel[2]!;
      const d = Math.hypot(x, y, z);
      if (!modelShown(d)) continue;
      m.visible = true;
      m.position.set(x, y, z);
      m.scale.setScalar(drawnRadiusKm(d, fov, size.height));
      if (sunOk) m.lookAt(scratch.look.set(scratch.sun[0]!, scratch.sun[1]!, scratch.sun[2]!));
      names += names ? `,${c.name}` : c.name;
    }
    if (names !== scratch.shown || canvas.dataset.models === undefined) {
      scratch.shown = names;
      canvas.dataset.models = names;
    }
  }, PRIORITY.objects);

  return <primitive object={group} />;
}
