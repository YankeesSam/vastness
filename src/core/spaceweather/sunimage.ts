// T-104 (VN-EXT-009): choosing and placing the Helioviewer Sun image. Pure maths for src/scene/sun/SunImage.tsx.

/** Index of the time in `times` (sorted ascending) nearest t, or -1 when empty. */
export function nearestIndex(times: ArrayLike<number>, t: number): number {
  const n = times.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  if (lo === n) return n - 1;
  return t - times[lo - 1]! <= times[lo]! - t ? lo - 1 : lo;
}

/**
 * The radius (km) of a camera-facing disc placed `r` km in front of a sphere's centre (toward a camera `d` km from
 * it) that covers exactly the sphere's outline: (d - r) tan(asin(r / d)).
 */
export function outlineRadius(r: number, d: number): number {
  if (d <= r) return r;
  return (r * (d - r)) / Math.sqrt(d * d - r * r);
}
