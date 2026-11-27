import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { clipPlanes, toCamera } from "./origin";
import { useRig } from "./rig";

// VN-SCN-004, VN-CAM-004: frame order. Negative priorities run in order before R3F renders (a positive one would
// take over rendering): the clock, then the body states, then the camera rig, then the camera at the origin, then the objects.
export const PRIORITY = { clock: -5, states: -4, rig: -3, camera: -2, objects: -1 } as const;

/**
 * The three.js camera stays at the render origin, looks at the focus (camera-relative), and its near and far
 * planes follow the focus distance (VN-CAM-004). Writes into preallocated objects only.
 */
export function OriginCamera() {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(() => ({ look: new Vector3(), rel: new Float64Array(3), planes: { near: 0, far: 0 } }), []);
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.position.set(0, 0, 0);
    toCamera(rig.focus, rig.cam, scratch.rel);
    scratch.look.set(scratch.rel[0]!, scratch.rel[1]!, scratch.rel[2]!);
    camera.lookAt(scratch.look);
    const p = clipPlanes(rig.orbit.distance, scratch.planes);
    if (camera.near !== p.near || camera.far !== p.far) {
      camera.near = p.near;
      camera.far = p.far;
      camera.updateProjectionMatrix();
    }
  }, PRIORITY.camera);
  return null;
}
