import { Canvas } from "@react-three/fiber";

// The full-window 3D view (VN-UI-001). A placeholder Sun until the bodies land (T-027); the floating origin and
// logarithmic depth arrive with T-026.
export function SceneView() {
  return (
    <Canvas
      data-testid="scene-canvas"
      camera={{ position: [0, 0, 6], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true }}
      aria-label="3D view of the solar system"
    >
      <mesh name="sun">
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
    </Canvas>
  );
}
