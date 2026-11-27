import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { loadEphemeris } from "../app/assets/loader";
import { viewStore } from "../app/store/view";
import type { Ephemeris } from "../core/ephem/ephemeris";
import { Bodies, createBodyFrame, type BodyFrame } from "./bodies/Bodies";
import { DRAWN_BODIES, worldPositions } from "./bodies/positions";
import { FAR_KM, MIN_NEAR_KM } from "./origin";
import { createRig, RigContext, useRig } from "./rig";
import { OriginCamera, PRIORITY } from "./Scene";

/** VN-TIM-004: the frame clock advances simulation time by the frame's real seconds. */
function FrameClock() {
  useFrame((_, dt) => viewStore.getState().tick(dt), PRIORITY.clock);
  return null;
}

/** Fills the frame's body positions from the ephemeris at the store's time (missing chunks load lazily). */
function BodyStates({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  useFrame(() => {
    if (eph) worldPositions(eph, viewStore.getState().t, frame.world, frame.ok);
  }, PRIORITY.states);
  return null;
}

const ELEVATION = (20 * Math.PI) / 180;

/** Until the camera controller (T-030): the focus is the target body and the camera sits above and behind it. */
function TargetRig({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  useFrame(() => {
    const i = DRAWN_BODIES.findIndex((b) => b.horizonsId === viewStore.getState().target);
    if (i >= 0 && frame.ok[i]) {
      rig.focus[0] = frame.world[3 * i]!;
      rig.focus[1] = frame.world[3 * i + 1]!;
      rig.focus[2] = frame.world[3 * i + 2]!;
    }
    rig.cam[0] = rig.focus[0]!;
    rig.cam[1] = rig.focus[1]! + rig.distance * Math.sin(ELEVATION);
    rig.cam[2] = rig.focus[2]! + rig.distance * Math.cos(ELEVATION);
  }, PRIORITY.rig);
  return null;
}

/**
 * Sets data-scene-ready="1" on the canvas once a frame has rendered with every body placed (or the ephemeris
 * failed to load), and data-bodies to the count placed. e2e specs wait for the first.
 */
function ReadyMarker({ frame, failed }: { frame: BodyFrame; failed: boolean }) {
  const canvas = useThree((s) => s.gl.domElement);
  useFrame(() => {
    let n = 0;
    for (let i = 0; i < frame.ok.length; i++) n += frame.ok[i]!;
    const bodies = String(n);
    if (canvas.dataset.bodies !== bodies) canvas.dataset.bodies = bodies;
    if (canvas.dataset.sceneReady !== "1" && (n === frame.ok.length || failed)) canvas.dataset.sceneReady = "1";
  });
  return null;
}

// VN-UI-001, VN-SCN-004: the full-window 3D view. Render units are km; the camera sits at the origin (floating
// origin) and the depth buffer is logarithmic (ADR-0004).
export function SceneView() {
  const rig = useMemo(() => createRig(), []);
  const frame = useMemo(() => createBodyFrame(), []);
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadEphemeris()
      .then(async (e) => {
        await e.load(viewStore.getState().t);
        if (live) setEph(e);
      })
      .catch((err: unknown) => {
        console.error("ephemeris:", err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 0], fov: 50, near: MIN_NEAR_KM, far: FAR_KM }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
    >
      <RigContext.Provider value={rig}>
        <FrameClock />
        <BodyStates eph={eph} frame={frame} />
        <TargetRig frame={frame} />
        <OriginCamera />
        <Bodies frame={frame} />
        <ReadyMarker frame={frame} failed={failed} />
      </RigContext.Provider>
    </Canvas>
  );
}
