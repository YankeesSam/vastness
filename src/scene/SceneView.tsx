import { Canvas, useFrame, useThree } from "@react-three/fiber";

/** Sets data-scene-ready="1" on the canvas once the first frame has rendered (e2e specs wait for it). */
function ReadyMarker() {
  const canvas = useThree((s) => s.gl.domElement);
  useFrame(() => {
    if (canvas.dataset.sceneReady !== "1") canvas.dataset.sceneReady = "1";
  });
  return null;
}

// The full-window 3D view (VN-UI-001). A placeholder Sun until the bodies land (T-027); the floating origin and
// logarithmic depth arrive with T-026.
export function SceneView() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 50, near: 0.1, far: 1000 }} gl={{ antialias: true }}>
      <mesh name="sun">
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
      <ReadyMarker />
    </Canvas>
  );
}
