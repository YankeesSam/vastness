import { PICK_RADIUS_PX, type LabelSet } from "../core/labels/declutter";

// VN-CAT-005: picking by screen-space distance to the markers (the layout the marker pass fills each frame), not by
// raycasting meshes, so a sub-pixel object can be picked. A body drawn as a disc larger than the pick radius is
// picked anywhere on the disc.

/** Largest pointer movement between press and release that still counts as a click, px. */
export const CLICK_SLOP_PX = 4;

export function isClick(x0: number, y0: number, x1: number, y1: number): boolean {
  return Math.hypot(x1 - x0, y1 - y0) <= CLICK_SLOP_PX;
}

/**
 * Index of the object whose marker is nearest (px, py) within max(PICK_RADIUS_PX, its disc radius), ties (within
 * half a pixel) to the higher priority; -1 when none.
 */
export function pick(s: LabelSet, radiusPx: Float64Array, n: number, px: number, py: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (!s.ok[i]) continue;
    const d = Math.hypot(s.x[i]! - px, s.y[i]! - py);
    const r = radiusPx[i]! > PICK_RADIUS_PX ? radiusPx[i]! : PICK_RADIUS_PX;
    if (d > r) continue;
    if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && s.priority[i]! > s.priority[best]!)) {
      best = i;
      bestD = d;
    }
  }
  return best;
}
