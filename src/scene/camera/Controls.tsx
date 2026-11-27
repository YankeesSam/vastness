import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { PerspectiveCamera } from "three";
import { viewStore } from "../../app/store/view";
import {
  eyeOffset,
  keyAction,
  MIN_DISTANCE_KM,
  minDistanceFor,
  orbit,
  panDelta,
  pinch,
  wheelSteps,
  zoom,
} from "../../core/camera/orbit";
import type { BodyFrame } from "../bodies/Bodies";
import { DRAWN_BODIES } from "../bodies/positions";
import { useRig, type Rig } from "../rig";
import { PRIORITY } from "../Scene";

// VN-CAM-001: orbit (drag), pan (right or shift drag, two-finger drag), exponential zoom (wheel, pinch, + and -),
// arrow keys. The maths is in src/core/camera/orbit; this turns DOM events into calls on the rig.

function bodyIndex(id: number | null): number {
  return id === null ? -1 : DRAWN_BODIES.findIndex((b) => b.horizonsId === id);
}

/** The closest the camera may come to the rig's focus. */
export function minDistance(rig: Rig): number {
  const i = bodyIndex(rig.follow);
  return i >= 0 ? minDistanceFor(DRAWN_BODIES[i]!.radiusKm) : MIN_DISTANCE_KM;
}

/** Releases follow: the focus stays where it is and no longer moves with the body (VN-CAM-003). */
export function release(rig: Rig): void {
  rig.follow = null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function Controls({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const el = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(() => ({ eye: new Float64Array(3), pan: new Float64Array(3) }), []);

  useEffect(() => {
    const fov = () => ((camera instanceof PerspectiveCamera ? camera.fov : 50) * Math.PI) / 180;
    const pointers = new Map<number, { x: number; y: number }>();
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const centroid = () => {
      let x = 0;
      let y = 0;
      for (const p of pointers.values()) {
        x += p.x;
        y += p.y;
      }
      return { x: x / pointers.size, y: y / pointers.size };
    };
    const pan = (dx: number, dy: number) => {
      release(rig);
      panDelta(rig.orbit, dx, dy, el.clientHeight || 1, fov(), scratch.pan);
      rig.focus[0] = rig.focus[0]! + scratch.pan[0]!;
      rig.focus[1] = rig.focus[1]! + scratch.pan[1]!;
      rig.focus[2] = rig.focus[2]! + scratch.pan[2]!;
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size >= 2) {
        const s0 = spread();
        const c0 = centroid();
        p.x = e.clientX;
        p.y = e.clientY;
        const c1 = centroid();
        if (s0 > 0) pinch(rig.orbit, spread() / s0, minDistance(rig));
        if (c1.x !== c0.x || c1.y !== c0.y) pan(c1.x - c0.x, c1.y - c0.y);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (e.shiftKey || (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0) pan(dx, dy);
      else {
        const perPx = Math.PI / (el.clientHeight || 1);
        orbit(rig.orbit, -dx * perPx, dy * perPx);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(rig.orbit, wheelSteps(e.deltaY, e.deltaMode), minDistance(rig));
    };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const a = keyAction(e.key);
      if (!a) return;
      e.preventDefault();
      if (a.kind === "orbit") orbit(rig.orbit, a.dAz, a.dEl);
      else zoom(rig.orbit, a.steps, minDistance(rig));
    };
    const menu = (e: Event) => e.preventDefault();
    // A new camera target is followed at once (the fly-to arrives with T-031).
    const unsubscribe = viewStore.subscribe((s, prev) => {
      if (s.target !== prev.target) rig.follow = s.target;
    });

    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    window.addEventListener("keydown", key);
    return () => {
      unsubscribe();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
      window.removeEventListener("keydown", key);
    };
  }, [el, camera, rig, scratch]);

  // Each frame: the focus follows its body, the distance respects its radius, the eye sits on the orbit.
  useFrame(() => {
    const i = bodyIndex(rig.follow);
    if (i >= 0 && frame.ok[i]) {
      rig.focus[0] = frame.world[3 * i]!;
      rig.focus[1] = frame.world[3 * i + 1]!;
      rig.focus[2] = frame.world[3 * i + 2]!;
    }
    const min = minDistance(rig);
    if (rig.orbit.distance < min) rig.orbit.distance = min;
    eyeOffset(rig.orbit, scratch.eye);
    rig.cam[0] = rig.focus[0]! + scratch.eye[0]!;
    rig.cam[1] = rig.focus[1]! + scratch.eye[1]!;
    rig.cam[2] = rig.focus[2]! + scratch.eye[2]!;
    // For e2e specs: the camera distance (4 significant digits) and the followed ID.
    const d = rig.orbit.distance.toPrecision(4);
    if (el.dataset.cameraDistance !== d) el.dataset.cameraDistance = d;
    const f = String(rig.follow ?? "");
    if (el.dataset.follow !== f) el.dataset.follow = f;
  }, PRIORITY.rig);

  return null;
}
