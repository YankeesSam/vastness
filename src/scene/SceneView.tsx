import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { preloadEphemeris, streamSpacecraft } from "../app/assets/loader";
import { viewStore } from "../app/store/view";
import { testParams } from "../app/testparams";
import type { Ephemeris } from "../core/ephem/ephemeris";
import { Bodies, createBodyFrame, type BodyFrame } from "./bodies/Bodies";
import { DRAWN_BODIES, worldPositions } from "./bodies/positions";
import { FAR_KM, MIN_NEAR_KM } from "./origin";
import { Controls } from "./camera/Controls";
import { Labels } from "./labels/Labels";
import { Markers } from "./labels/Markers";
import { createScreenFrame } from "./labels/screen";
import { Orbits } from "./orbits/Orbits";
import { SpacecraftModels } from "./spacecraft/Model";
import { Trails } from "./trails/Trails";
import { Picker } from "./Picker";
import { createRig, RigContext } from "./rig";
import { OriginCamera, PRIORITY } from "./Scene";

/** VN-TIM-004: the frame clock advances simulation time by the frame's real seconds. */
function FrameClock() {
  useFrame((_, dt) => viewStore.getState().tick(dt), PRIORITY.clock);
  return null;
}

/** Fills the frame's body positions from the ephemeris at the store's time (missing chunks load lazily). */
function BodyStates({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  useFrame(() => {
    if (eph) worldPositions(eph, viewStore.getState().t, frame.world, frame.ok, frame.outside);
  }, PRIORITY.states);
  return null;
}

/**
 * Sets data-scene-ready="1" on the canvas once a frame has rendered with every object placed or known to be outside
 * its coverage (or the ephemeris failed to load), data-bodies to the count placed and data-spacecraft to the
 * spacecraft placed. e2e specs wait for the first.
 * VN-UI-005, VN-PRF-004: data-first-frame="1" once a frame has rendered with the Sun, planets and Moon settled;
 * onFirstFrame then starts the spacecraft downloads, which stream in without holding the view back.
 */
function ReadyMarker({ frame, failed, onFirstFrame }: { frame: BodyFrame; failed: boolean; onFirstFrame(): void }) {
  const canvas = useThree((s) => s.gl.domElement);
  useFrame(() => {
    if (canvas.dataset.firstFrame !== "1") {
      let natural = 0;
      for (let i = 0; i < DRAWN_BODIES.length; i++) natural += frame.ok[i]! | frame.outside[i]!;
      if (natural === DRAWN_BODIES.length || failed) {
        canvas.dataset.firstFrame = "1";
        onFirstFrame();
      }
    }
    let n = 0;
    let settled = 0;
    for (let i = 0; i < frame.ok.length; i++) {
      n += frame.ok[i]!;
      settled += frame.ok[i]! | frame.outside[i]!;
    }
    let b = 0;
    for (let i = 0; i < DRAWN_BODIES.length; i++) b += frame.ok[i]!;
    const bodies = String(b);
    const craft = String(n - b);
    if (canvas.dataset.bodies !== bodies) canvas.dataset.bodies = bodies;
    if (canvas.dataset.spacecraft !== craft) canvas.dataset.spacecraft = craft;
    if (canvas.dataset.sceneReady !== "1" && (settled === frame.ok.length || failed)) canvas.dataset.sceneReady = "1";
  });
  return null;
}

// VN-UI-001, VN-SCN-004: the full-window 3D view. Render units are km; the camera sits at the origin (floating
// origin) and the depth buffer is logarithmic (ADR-0004).
export function SceneView() {
  const rig = useMemo(() => {
    const cam = testParams.cam;
    if (!cam) return createRig();
    const r = createRig(cam.distanceKm, cam.target); // F5: a reference view starts at its camera
    r.orbit.azimuth = cam.azimuth;
    r.orbit.elevation = cam.elevation;
    return r;
  }, []);
  const frame = useMemo(() => createBodyFrame(), []);
  const screen = useMemo(() => createScreenFrame(), []);
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    preloadEphemeris(viewStore.getState().t)
      .then((e) => {
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
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 0], fov: 50, near: MIN_NEAR_KM, far: FAR_KM }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <RigContext.Provider value={rig}>
          <FrameClock />
          <BodyStates eph={eph} frame={frame} />
          <Controls frame={frame} />
          <OriginCamera />
          <Bodies frame={frame} />
          <Orbits eph={eph} frame={frame} />
          <Trails eph={eph} frame={frame} />
          <SpacecraftModels frame={frame} />
          <Markers frame={frame} screen={screen} />
          <Picker screen={screen} />
          <ReadyMarker
            frame={frame}
            failed={failed}
            onFirstFrame={() => {
              if (eph)
                streamSpacecraft(eph, viewStore.getState().t).catch(() => {
                  // per-chunk failures show as "error" states (VN-EPH-007 reasons), not here
                });
            }}
          />
        </RigContext.Provider>
      </Canvas>
      <Labels screen={screen} />
    </div>
  );
}
