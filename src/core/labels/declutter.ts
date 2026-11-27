// VN-SCN-003: screen-space markers and labels. Pure layout: the scene projects each object to pixels, fills a
// LabelSet (struct of arrays, preallocated), and declutter picks which labels to show by priority and overlap.
// Allocates nothing per call.

/** Most labels shown at once. */
export const MAX_LABELS = 60;
/** A label starts this far right of its marker, px. */
export const LABEL_OFFSET_PX = 8;
/** Smallest clear gap between two shown labels, px. */
export const LABEL_GAP_PX = 4;
/** A marker hides once the body's own disc is at least this radius, px (the sphere is then visible itself). */
export const MARKER_HIDE_RADIUS_PX = 4;
/** Picking radius around a marker, px (VN-CAT-005). */
export const PICK_RADIUS_PX = 12;

export interface LabelSet {
  /** Marker position, px from the top left of the view. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Label size, px. */
  readonly w: Float64Array;
  readonly h: Float64Array;
  /** Higher shows first. */
  readonly priority: Float64Array;
  /** 1 where the object is in front of the camera and has a position this frame. */
  readonly ok: Uint8Array;
  /** Output: 1 where the label is shown. */
  readonly shown: Uint8Array;
  /** Scratch: indices by priority. */
  readonly order: Int32Array;
}

export function createLabelSet(capacity: number): LabelSet {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    w: new Float64Array(capacity),
    h: new Float64Array(capacity),
    priority: new Float64Array(capacity),
    ok: new Uint8Array(capacity),
    shown: new Uint8Array(capacity),
    order: new Int32Array(capacity),
  };
}

function overlaps(s: LabelSet, a: number, b: number): boolean {
  const ax = s.x[a]! + LABEL_OFFSET_PX;
  const bx = s.x[b]! + LABEL_OFFSET_PX;
  const ay = s.y[a]! - s.h[a]! / 2;
  const by = s.y[b]! - s.h[b]! / 2;
  return (
    ax < bx + s.w[b]! + LABEL_GAP_PX &&
    bx < ax + s.w[a]! + LABEL_GAP_PX &&
    ay < by + s.h[b]! + LABEL_GAP_PX &&
    by < ay + s.h[a]! + LABEL_GAP_PX
  );
}

/**
 * Chooses the labels to show among the first n entries of s, into s.shown: greedily by priority (ties by lower
 * index), skipping any whose rectangle comes within LABEL_GAP_PX of one already shown, objects not ok, markers
 * outside the width x height view, and everything after MAX_LABELS. Returns how many are shown.
 */
export function declutter(s: LabelSet, n: number, width: number, height: number, max = MAX_LABELS): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    s.shown[i] = 0;
    const x = s.x[i]!;
    const y = s.y[i]!;
    if (s.ok[i] && x >= 0 && x <= width && y >= 0 && y <= height) s.order[m++] = i;
  }
  // Insertion sort by priority descending, stable: m is small and the order changes little between frames.
  for (let i = 1; i < m; i++) {
    const v = s.order[i]!;
    const p = s.priority[v]!;
    let j = i - 1;
    while (j >= 0 && s.priority[s.order[j]!]! < p) {
      s.order[j + 1] = s.order[j]!;
      j--;
    }
    s.order[j + 1] = v;
  }
  let count = 0;
  for (let k = 0; k < m && count < max; k++) {
    const i = s.order[k]!;
    let clear = true;
    for (let q = 0; q < k && clear; q++) {
      const o = s.order[q]!;
      if (s.shown[o] && overlaps(s, i, o)) clear = false;
    }
    if (clear) {
      s.shown[i] = 1;
      count++;
    }
  }
  return count;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** False behind the camera (or on its plane). */
  ok: boolean;
}

/**
 * Projects a camera-relative point (x, y, z) with a column-major 4x4 view-projection matrix (three.js `elements`
 * order) to pixels in a width x height view, y down.
 */
export function project(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (!(cw > 0)) {
    out.ok = false;
    return out;
  }
  out.x = ((cx / cw + 1) / 2) * width;
  out.y = ((1 - cy / cw) / 2) * height;
  out.ok = Number.isFinite(out.x) && Number.isFinite(out.y);
  return out;
}

/** Apparent radius in px of a sphere of radius r at distance d, for a vertical fov (rad) over heightPx. */
export function pixelRadius(radiusKm: number, distanceKm: number, fovRad: number, heightPx: number): number {
  if (!(distanceKm > radiusKm)) return Infinity;
  return (Math.asin(radiusKm / distanceKm) / fovRad) * heightPx;
}

export function markerShown(radiusPx: number): boolean {
  return radiusPx < MARKER_HIDE_RADIUS_PX;
}

/** Label priority by object class (VN-SCN-003); the selected object always comes first. */
export function bodyPriority(horizonsId: number, selected: boolean): number {
  const base = horizonsId === 10 ? 100 : horizonsId > 100 && horizonsId % 100 === 99 ? 80 : 40;
  return selected ? base + 1000 : base;
}
