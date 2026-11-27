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
import { flightAt, frameDistance, planFlight, type Flight } from "../../core/camera/flyto";
import type { BodyFrame } from "../bodies/Bodies";
import { DRAWN_BODIES } from "../bodies/positions";
import { useRig, type Rig } from "../rig";
import { PRIORITY } from "../Scene";

// VN-CAM-001: orbit (drag), pan (right or shift drag, two-finger drag), exponential zoom (wheel, pinch, + and -),
// arrow keys. VN-CAM-002: a new camera target starts a fly-to; VN-CAM-003: once there the camera follows it, and
// Escape or a pan releases it. The maths is in src/core/camera; this turns DOM events into calls on the rig.

function bodyIndex(id: number | null): number {
  return id === null ? -1 : DRAWN_BODIES.findIndex((b) => b.horizonsId === id);
}

/** The closest the camera may come to the rig's focus. */
export function minDistance(rig: Rig): number {
  const i = bodyIndex(rig.follow);
  return i >= 0 ? minDistanceFor(DRAWN_BODIES[i]!.radiusKm) : MIN_DISTANCE_KM;
}

/** A fly-to in progress: from a fixed start focus to a body, timed in real seconds. */
interface Flying {
  plan: Flight;
  to: number;
  start: Float64Array;
  elapsed: number;
}

/** Releases follow and cancels a flight: the focus stays where it is and no longer moves (VN-CAM-003). */
export function release(rig: Rig, flying: { current: Flying | null }): void {
  rig.follow = null;
  flying.current = null;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function Controls({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const el = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(() => ({ eye: new Float64Array(3), pan: new Float64Array(3), point: { u: 0, w: 0 } }), []);
  const flying = useMemo<{ current: Flying | null }>(() => ({ current: null }), []);

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
    // Any manual zoom or orbit ends a flight where it is (the focus stops; follow is not resumed half way).
    const interrupt = () => {
      if (flying.current) release(rig, flying);
    };
    const pan = (dx: number, dy: number) => {
      release(rig, flying);
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
        interrupt();
        if (s0 > 0) pinch(rig.orbit, spread() / s0, minDistance(rig));
        if (c1.x !== c0.x || c1.y !== c0.y) pan(c1.x - c0.x, c1.y - c0.y);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (e.shiftKey || (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0) pan(dx, dy);
      else if (dx !== 0 || dy !== 0) {
        interrupt();
        const perPx = Math.PI / (el.clientHeight || 1);
        orbit(rig.orbit, -dx * perPx, dy * perPx);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      interrupt();
      zoom(rig.orbit, wheelSteps(e.deltaY, e.deltaMode), minDistance(rig));
    };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "Escape") {
        if (!e.defaultPrevented) release(rig, flying);
        return;
      }
      const a = keyAction(e.key);
      if (!a) return;
      e.preventDefault();
      interrupt();
      if (a.kind === "orbit") orbit(rig.orbit, a.dAz, a.dEl);
      else zoom(rig.orbit, a.steps, minDistance(rig));
    };
    const menu = (e: Event) => e.preventDefault();
    // A camera target request starts a fly-to from the current focus (VN-CAM-002).
    const unsubscribe = viewStore.subscribe((s, prev) => {
      if (s.targetSeq === prev.targetSeq) return;
      const i = bodyIndex(s.target);
      if (i < 0) return;
      rig.follow = null;
      flying.current = {
        plan: planFlight(0, rig.orbit.distance, frameDistance(DRAWN_BODIES[i]!.radiusKm)),
        to: s.target,
        start: Float64Array.from(rig.focus),
        elapsed: 0,
      };
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
  }, [el, camera, rig, scratch, flying]);

  // Each frame: a flight moves focus and distance along its curve; otherwise the focus follows its body and the
  // distance respects its radius. Then the eye sits on the orbit.
  useFrame((_, dt) => {
    const f = flying.current;
    const j = f ? bodyIndex(f.to) : -1;
    if (f && j >= 0 && frame.ok[j]) {
      const ex = frame.world[3 * j]!;
      const ey = frame.world[3 * j + 1]!;
      const ez = frame.world[3 * j + 2]!;
      if (f.elapsed === 0) {
        // Planned on the first frame with the end position; the end keeps moving with its body after that.
        const D = Math.hypot(ex - f.start[0]!, ey - f.start[1]!, ez - f.start[2]!);
        f.plan = planFlight(D, f.plan.w0, f.plan.w1);
      }
      f.elapsed += dt; // wall-clock: a slow or hidden frame shortens the rest of the flight, never lengthens it
      const tau = f.plan.duration > 0 ? f.elapsed / f.plan.duration : 1;
      const p = flightAt(f.plan, tau, scratch.point);
      rig.focus[0] = f.start[0]! + (ex - f.start[0]!) * p.u;
      rig.focus[1] = f.start[1]! + (ey - f.start[1]!) * p.u;
      rig.focus[2] = f.start[2]! + (ez - f.start[2]!) * p.u;
      rig.orbit.distance = p.w;
      if (tau >= 1) {
        rig.follow = f.to;
        flying.current = null;
      }
    }
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
    const fo = String(rig.follow ?? "");
    if (el.dataset.follow !== fo) el.dataset.follow = fo;
    const fl = flying.current ? String(flying.current.to) : "";
    if (el.dataset.flying !== fl) el.dataset.flying = fl;
  }, PRIORITY.rig);

  return null;
}
