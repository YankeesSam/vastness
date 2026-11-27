import { reducedMotion } from "./motion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { preloadEphemeris, streamSpacecraft } from "../app/assets/loader";
import { useView, viewStore } from "../app/store/view";
import { QUALITY } from "../core/quality";
import { testParams } from "../app/testparams";
import { VERTICAL_FOV_DEG } from "../core/camera/presets";
import type { Ephemeris } from "../core/ephem/ephemeris";
import { Bodies, createBodyFrame, type BodyFrame } from "./bodies/Bodies";
import { amountFor, stepAmount } from "../core/scale/mapping";
import { viewWidthKm } from "../core/scale/indicator";
import { viewReadout } from "../app/scale/readout";
import { DRAWN_BODIES, drawnPositions, SCENE_OBJECTS, worldPositions } from "./bodies/positions";

/** Satellites come last in SCENE_OBJECTS. */
const FIRST_SATELLITE = (() => {
  const i = SCENE_OBJECTS.findIndex((o) => o.kind === "satellite");
  return i < 0 ? SCENE_OBJECTS.length : i;
})();
import { FAR_KM, MIN_NEAR_KM } from "./origin";
import { CalloutLabels, Callouts, createCalloutFrame } from "./callouts/Callouts";
import { Controls } from "./camera/Controls";
import { LightPulse } from "./pulse/Pulse";
import { Labels } from "./labels/Labels";
import { Markers } from "./labels/Markers";
import { createScreenFrame } from "./labels/screen";
import { Orbits } from "./orbits/Orbits";
import { SpacecraftModels } from "./spacecraft/Model";
import { SaturnRings } from "./bodies/Rings";
import { Stars } from "./stars/Stars";
import { SunGlow } from "./sun/SunGlow";
import { Trails } from "./trails/Trails";
import { Picker } from "./Picker";
import { RenderStatsProbe } from "./stats/RenderStatsProbe";
import { createRig, RigContext, useRig } from "./rig";
import { OriginCamera, PRIORITY } from "./Scene";

/** VN-TIM-004: the frame clock advances simulation time by the frame's real seconds. */
function FrameClock() {
  useFrame((_, dt) => viewStore.getState().tick(dt), PRIORITY.clock);
  return null;
}

/**
 * Fills the frame's true positions from the ephemeris at the store's time (missing chunks load lazily), moves the
 * scale amount toward the store's mode (VN-SCL-003), and maps true to drawn positions and radii (VN-SCL-002).
 */
function BodyStates({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  const canvas = useThree((s) => s.gl.domElement);
  const first = useMemo(() => ({ done: false }), []);
  useFrame((_, dt) => {
    const st = viewStore.getState();
    const target = amountFor(st.scale);
    // a view that starts in exaggerated scale (a link, F5) is placed at once
    frame.scale.amount = first.done ? stepAmount(frame.scale.amount, target, dt, reducedMotion()) : target;
    first.done = true;
    if (eph) worldPositions(eph, st.t, frame.truth, frame.ok, frame.outside, frame.illustrative);
    drawnPositions(frame.scale.amount, frame.truth, frame.ok, frame.world, frame.radius);
    // For e2e specs: the scale amount, 2 decimals.
    const a = frame.scale.amount.toFixed(2);
    if (canvas.dataset.scaleAmount !== a) canvas.dataset.scaleAmount = a;
  }, PRIORITY.states);
  return null;
}

const VOYAGER_1 = SCENE_OBJECTS.findIndex((o) => o.id === -31);

/** VN-SCL-004: measures the view for the scale bar: its width at the focus and Voyager 1's distance from the Sun. */
function ScaleProbe({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const size = useThree((s) => s.size);
  useFrame(() => {
    const aspect = size.height > 0 ? size.width / size.height : 1;
    viewReadout.widthKm = viewWidthKm(rig.orbit.distance, (VERTICAL_FOV_DEG * Math.PI) / 180, aspect);
    const v = VOYAGER_1;
    viewReadout.voyager1Km =
      v >= 0 && frame.ok[v] && frame.ok[0]
        ? Math.hypot(
            frame.truth[3 * v]! - frame.truth[0]!,
            frame.truth[3 * v + 1]! - frame.truth[1]!,
            frame.truth[3 * v + 2]! - frame.truth[2]!,
          )
        : null;
  }, PRIORITY.objects);
  return null;
}

/**
 * Sets data-scene-ready="1" on the canvas once a frame has rendered with every object placed or known to be outside
 * its coverage (or the ephemeris failed to load), data-bodies to the count placed, data-spacecraft to the
 * spacecraft placed and data-satellites to the Earth satellites placed (VN-CAT-007). e2e specs wait for the first.
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
    let sats = 0;
    for (let i = FIRST_SATELLITE; i < frame.ok.length; i++) sats += frame.ok[i]!;
    const bodies = String(b);
    const craft = String(n - b - sats);
    const satellites = String(sats);
    if (canvas.dataset.bodies !== bodies) canvas.dataset.bodies = bodies;
    if (canvas.dataset.spacecraft !== craft) canvas.dataset.spacecraft = craft;
    if (canvas.dataset.satellites !== satellites) canvas.dataset.satellites = satellites;
    if (canvas.dataset.sceneReady !== "1" && (settled === frame.ok.length || failed)) canvas.dataset.sceneReady = "1";
  });
  return null;
}

/** For e2e specs: data-quality on the canvas names the tier drawn (VN-PRF-003). */
function QualityMarker() {
  const canvas = useThree((s) => s.gl.domElement);
  const quality = useView((s) => s.quality);
  useEffect(() => {
    canvas.dataset.quality = quality;
  }, [canvas, quality]);
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
  const callouts = useMemo(() => createCalloutFrame(), []);
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const [failed, setFailed] = useState(false);
  // VN-PRF-003: the tier caps the pixel ratio
  const quality = useView((s) => s.quality);

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
        camera={{ position: [0, 0, 0], fov: VERTICAL_FOV_DEG, near: MIN_NEAR_KM, far: FAR_KM }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        dpr={[1, QUALITY[quality].maxPixelRatio]}
      >
        <RigContext.Provider value={rig}>
          <FrameClock />
          <QualityMarker />
          <RenderStatsProbe />
          <BodyStates eph={eph} frame={frame} />
          <Controls frame={frame} />
          <OriginCamera />
          <Stars />
          <Bodies frame={frame} />
          <SaturnRings frame={frame} />
          <SunGlow frame={frame} />
          <Orbits eph={eph} frame={frame} />
          <Trails eph={eph} frame={frame} />
          <SpacecraftModels frame={frame} />
          <Markers frame={frame} screen={screen} />
          <Picker screen={screen} />
          <ScaleProbe frame={frame} />
          <Callouts frame={frame} screen={screen} callouts={callouts} />
          <LightPulse frame={frame} />
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
      <CalloutLabels callouts={callouts} />
    </div>
  );
}
