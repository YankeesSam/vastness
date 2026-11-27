import { createContext, useContext } from "react";
import { createOrbit, type OrbitState } from "../core/camera/orbit";

// The camera rig: mutable per-frame camera state in float64 world km (scene frame, y-up). Not in the view store:
// it changes every frame and nothing in the DOM renders from it.

export interface Rig {
  /** Camera position, world km. */
  readonly cam: Float64Array;
  /** The point the camera looks at, world km. */
  readonly focus: Float64Array;
  /** Distance, azimuth and elevation of the camera about the focus (VN-CAM-001). */
  readonly orbit: OrbitState;
  /** Horizons ID whose position the focus follows (VN-CAM-003), or null for a fixed point. */
  follow: number | null;
}

export function createRig(distance = 2e4, follow: number | null = 399): Rig {
  return {
    cam: new Float64Array([0, 0, distance]),
    focus: new Float64Array(3),
    orbit: createOrbit(distance, 0, (20 * Math.PI) / 180),
    follow,
  };
}

export const RigContext = createContext<Rig | null>(null);

export function useRig(): Rig {
  const rig = useContext(RigContext);
  if (!rig) throw new Error("useRig outside a RigContext");
  return rig;
}
