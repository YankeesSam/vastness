import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { viewStore } from "../app/store/view";
import { MIN_NEAR_KM, FAR_KM } from "./origin";
import { createRig, RigContext } from "./rig";
import { OriginCamera, PRIORITY } from "./Scene";

/** VN-TIM-004: the frame clock advances simulation time by the frame's real seconds. */
function FrameClock() {
  useFrame((_, dt) => viewStore.getState().tick(dt), PRIORITY.clock);
  return null;
}

/** Sets data-scene-ready="1" on the canvas once the first frame has rendered (e2e specs wait for it). */
function ReadyMarker() {
  const canvas = useThree((s) => s.gl.domElement);
  useFrame(() => {
    if (canvas.dataset.sceneReady !== "1") canvas.dataset.sceneReady = "1";
  });
  return null;
}

// VN-UI-001, VN-SCN-004: the full-window 3D view. Render units are km; the camera sits at the origin (floating
// origin) and the depth buffer is logarithmic (ADR-0004).
export function SceneView() {
  const rig = useMemo(() => createRig(), []);
  return (
    <Canvas
      camera={{ position: [0, 0, 0], fov: 50, near: MIN_NEAR_KM, far: FAR_KM }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
    >
      <RigContext.Provider value={rig}>
        <FrameClock />
        <OriginCamera />
        <mesh name="sun" position={[0, 0, 0]}>
          <sphereGeometry args={[695_700, 48, 24]} />
          <meshBasicMaterial color="#ffd27a" />
        </mesh>
        <ReadyMarker />
      </RigContext.Provider>
    </Canvas>
  );
}
