import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Matrix4, PerspectiveCamera } from "three";
import { viewStore } from "../../app/store/view";
import { project } from "../../core/labels/declutter";
import type { BodyFrame } from "../bodies/Bodies";
import { objectIndex } from "../bodies/positions";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import type { ScreenFrame } from "../labels/screen";
import {
  CALLOUT_TARGETS,
  calloutTargets,
  calloutText,
  distanceKm,
  placeLabel,
  towardPoint,
  type LabelPlace,
} from "./callouts";

// VN-SCL-005: the distance callouts in the scene: one segment per target from the selection's drawn position to the
// target's, written camera-relative each frame (the float64 difference first, so the end at the selection is exact),
// and a DOM label per target placed on its line near the selection.

/** The label elements, by CALLOUT_TARGETS index (the DOM layer registers them). */
export interface CalloutFrame {
  readonly spans: (HTMLElement | null)[];
}

export function createCalloutFrame(): CalloutFrame {
  return { spans: CALLOUT_TARGETS.map(() => null) };
}

const TARGET_INDEX = CALLOUT_TARGETS.map((t) => objectIndex(t.id));
/** Sun yellow, Earth blue. */
const COLOURS = [
  [1, 0.85, 0.4],
  [0.45, 0.7, 1],
] as const;

/** Mounted after Markers, which fills the screen frame (positions and disc sizes) earlier in the same frame. */
export function Callouts({
  frame,
  screen,
  callouts,
}: {
  frame: BodyFrame;
  screen: ScreenFrame;
  callouts: CalloutFrame;
}) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const canvas = useThree((s) => s.gl.domElement);
  const n = CALLOUT_TARGETS.length;
  const lines = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(6 * n), 3));
    const col = new Float32Array(6 * n);
    COLOURS.forEach((c, i) => col.set([...c, ...c], 6 * i));
    g.setAttribute("color", new BufferAttribute(col, 3));
    const m = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
    const l = new LineSegments(g, m);
    l.frustumCulled = false;
    l.name = "callouts";
    return l;
  }, [n]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      lines.material.dispose();
    },
    [lines],
  );
  const scratch = useMemo(
    () => ({
      at: new Float64Array(3),
      viewProj: new Matrix4(),
      pt: { x: 0, y: 0, ok: false },
      text: ["", ""],
      places: CALLOUT_TARGETS.map((): LabelPlace => ({ x: 0, y: 0, right: false })),
    }),
    [],
  );

  useFrame(() => {
    const st = viewStore.getState();
    const sel = objectIndex(st.selection);
    const want = calloutTargets(st.selection);
    const on = st.layers.callouts && sel >= 0 && frame.ok[sel] === 1;
    const pos = lines.geometry.getAttribute("position") as BufferAttribute;
    if (camera instanceof PerspectiveCamera) {
      camera.updateMatrixWorld();
      scratch.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
    let drawn = 0;
    let placedBefore = -1;
    for (let k = 0; k < n; k++) {
      const j = TARGET_INDEX[k]!;
      const span = callouts.spans[k];
      const show = on && want[k]! && j >= 0 && frame.ok[j] === 1;
      if (!show) {
        pos.setXYZ(2 * k, 0, 0, 0);
        pos.setXYZ(2 * k + 1, 0, 0, 0);
        if (span && !span.hidden) span.hidden = true;
        continue;
      }
      drawn++;
      const w = frame.world;
      const c = rig.cam;
      pos.setXYZ(2 * k, w[3 * sel]! - c[0]!, w[3 * sel + 1]! - c[1]!, w[3 * sel + 2]! - c[2]!);
      pos.setXYZ(2 * k + 1, w[3 * j]! - c[0]!, w[3 * j + 1]! - c[1]!, w[3 * j + 2]! - c[2]!);
      if (!span) continue;
      const text = calloutText(CALLOUT_TARGETS[k]!.name, distanceKm(frame.truth, sel, j));
      if (scratch.text[k] !== text) {
        scratch.text[k] = text;
        span.textContent = text;
      }
      // on screen: from the selection's marker, out past its disc in the direction the line leaves
      const set = screen.set;
      const ok = set.ok[sel] === 1;
      const place = scratch.places[k]!;
      if (ok) {
        const a = towardPoint(w, sel, j, rig.orbit.distance, scratch.at);
        const p = project(
          scratch.viewProj.elements,
          a[0]! - c[0]!,
          a[1]! - c[1]!,
          a[2]! - c[2]!,
          size.width,
          size.height,
          scratch.pt,
        );
        const qx = p.ok ? p.x : set.x[sel]!;
        const qy = p.ok ? p.y : set.y[sel]!;
        const prev = placedBefore >= 0 ? scratch.places[placedBefore]! : null;
        placeLabel(set.x[sel]!, set.y[sel]!, qx, qy, Math.min(screen.radiusPx[sel]!, size.height), prev, place);
        span.style.transform = `translate(${place.x}px, ${place.y}px) translate(${place.right ? "-100%" : "0"}, -50%)`;
        placedBefore = k;
      }
      if (span.hidden === ok) span.hidden = !ok;
    }
    pos.needsUpdate = true;
    lines.visible = drawn > 0;
    // For e2e specs: the callout texts shown.
    const shown = callouts.spans
      .filter((s) => s && !s.hidden)
      .map((s) => s!.textContent)
      .join("|");
    if (canvas.dataset.callouts !== shown) canvas.dataset.callouts = shown;
  }, PRIORITY.objects);

  return <primitive object={lines} />;
}

/** VN-SCL-005, VN-ACC-002: the callout labels as DOM text over the canvas. */
export function CalloutLabels({ callouts }: { callouts: CalloutFrame }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} data-testid="callouts">
      {CALLOUT_TARGETS.map((t, k) => (
        <span
          key={t.id}
          hidden
          ref={(el) => {
            callouts.spans[k] = el;
          }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            font: "11px/1.2 system-ui, sans-serif",
            color: `rgb(${COLOURS[k]!.map((v) => Math.round(v * 255)).join(",")})`,
            textShadow: "0 0 3px #000, 0 0 2px #000",
            whiteSpace: "nowrap",
            willChange: "transform",
          }}
        />
      ))}
    </div>
  );
}
