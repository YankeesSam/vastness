import { createLabelSet, type LabelSet } from "../../core/labels/declutter";
import { SCENE_OBJECTS } from "../bodies/positions";

// VN-SCN-003, VN-CAT-005: where each drawn object lands on screen this frame. Filled once per frame by the marker
// layout (after the camera is placed) and read by the label DOM and by picking.

export interface ScreenFrame {
  /** Marker positions (px), label sizes, priorities, which are in front of the camera, which labels are shown. */
  readonly set: LabelSet;
  /** Apparent radius of each body's disc, px. */
  readonly radiusPx: Float64Array;
  /** 1 where the marker is drawn. */
  readonly marker: Uint8Array;
  /** Label elements by body index (the DOM layer registers them). */
  readonly spans: (HTMLElement | null)[];
  width: number;
  height: number;
}

export function createScreenFrame(n = SCENE_OBJECTS.length): ScreenFrame {
  return {
    set: createLabelSet(n),
    radiusPx: new Float64Array(n),
    marker: new Uint8Array(n),
    spans: new Array<HTMLElement | null>(n).fill(null),
    width: 0,
    height: 0,
  };
}
