import { createContext, useContext } from "react";

// The camera rig: mutable per-frame camera state in float64 world km (scene frame, y-up). Not in the view store:
// it changes every frame and nothing in the DOM renders from it.

export interface Rig {
  /** Camera position, world km. */
  readonly cam: Float64Array;
  /** The point the camera looks at, world km. */
  readonly focus: Float64Array;
  /** Distance from the camera to the focus, km. */
  distance: number;
}

export function createRig(distance = 2e4): Rig {
  return { cam: new Float64Array([0, 0, distance]), focus: new Float64Array(3), distance };
}

export const RigContext = createContext<Rig | null>(null);

export function useRig(): Rig {
  const rig = useContext(RigContext);
  if (!rig) throw new Error("useRig outside a RigContext");
  return rig;
}
