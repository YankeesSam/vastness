import { formatKm, formatLightTime } from "../../core/scale/indicator";

// VN-SCL-005: distance callouts. From the selected object a line runs to the Sun and one to Earth, each labelled with
// the true distance and the time light takes to cross it. Lines join the drawn positions (exaggerated scale moves the
// Moon and small objects); distances always come from the true positions. Labels sit on screen just outside the
// selection, each in the direction its line leaves.

/** The Sun and Earth (Horizons IDs), with the names shown on the labels. */
export const CALLOUT_TARGETS: readonly { id: number; name: string }[] = [
  { id: 10, name: "Sun" },
  { id: 399, name: "Earth" },
];

/** True distance between objects i and j of a position buffer (3 numbers per object), km. */
export function distanceKm(pos: Float64Array, i: number, j: number): number {
  return Math.hypot(pos[3 * i]! - pos[3 * j]!, pos[3 * i + 1]! - pos[3 * j + 1]!, pos[3 * i + 2]! - pos[3 * j + 2]!);
}

export function calloutText(name: string, km: number): string {
  return `${name}: ${formatKm(km)} · ${formatLightTime(km)}`;
}

/**
 * A point on the line from `from` toward `to`, one camera distance out (or the target, if nearer): projected, it gives
 * the line's direction on screen. Writes 3 numbers into out. Allocates nothing.
 */
export function towardPoint(
  pos: Float64Array,
  from: number,
  to: number,
  cameraDistanceKm: number,
  out: Float64Array,
): Float64Array {
  const len = distanceKm(pos, from, to);
  const f = len > 0 ? Math.min(1, cameraDistanceKm / len) : 0;
  for (let k = 0; k < 3; k++) out[k] = pos[3 * from + k]! + f * (pos[3 * to + k]! - pos[3 * from + k]!);
  return out;
}

/** Gap between the selection's disc (or marker) and a label, px; a label's line height, px. */
export const LABEL_GAP_PX = 14;
export const LABEL_LINE_PX = 14;

export interface LabelPlace {
  x: number;
  y: number;
  /** The label ends at x (it runs left of the line) instead of starting there. */
  right: boolean;
}

/**
 * Where a callout's label goes on screen: just outside the selection's disc at (sx, sy) with radius radiusPx, in the
 * direction its line leaves on screen (toward (qx, qy); to the right when the line runs at the camera). A label
 * placed within a line height of `above` (the label before it, on the same side) moves down a line.
 */
export function placeLabel(
  sx: number,
  sy: number,
  qx: number,
  qy: number,
  radiusPx: number,
  above: LabelPlace | null,
  out: LabelPlace,
): LabelPlace {
  let dx = qx - sx;
  let dy = qy - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  const r = (Number.isFinite(radiusPx) ? Math.max(0, radiusPx) : 0) + LABEL_GAP_PX;
  out.x = sx + dx * r;
  out.y = sy + dy * r;
  out.right = dx < 0;
  if (above && above.right === out.right && Math.abs(above.y - out.y) < LABEL_LINE_PX) out.y = above.y + LABEL_LINE_PX;
  return out;
}

/** Which of CALLOUT_TARGETS get a line for a selection: none for no selection, and never one to itself. */
export function calloutTargets(selection: number | null): boolean[] {
  return CALLOUT_TARGETS.map((t) => selection !== null && t.id !== selection);
}
