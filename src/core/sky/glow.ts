// VN-SCN-005: the Sun's glow. A camera-facing disc around the Sun, additive, whose radius is `size` x GLOW_RADII
// drawn solar radii, but never less than `size` x GLOW_MIN_PX pixels on screen, so the Sun still shows as a bright
// point from the heliopause; `brightness` scales its intensity (0 hides it). Pure: no three.js or DOM.

/** Glow radius in drawn solar radii at size 1. */
export const GLOW_RADII = 8;
/** Smallest glow radius on screen at size 1, pixels. */
export const GLOW_MIN_PX = 14;

/**
 * Glow radius, km, for a Sun of drawn radius `sunRadiusKm` seen from `distanceKm`, with a vertical field of view
 * `fovRad` over `viewportHeightPx` pixels.
 */
export function glowRadiusKm(
  sunRadiusKm: number,
  distanceKm: number,
  fovRad: number,
  viewportHeightPx: number,
  size = 1,
): number {
  const kmPerPx = (2 * distanceKm * Math.tan(fovRad / 2)) / Math.max(1, viewportHeightPx);
  return size * Math.max(GLOW_RADII * sunRadiusKm, GLOW_MIN_PX * kmPerPx);
}

/**
 * Glow intensity at `r` (0 at the Sun's centre, 1 at the glow's edge): a bright core falling off smoothly to 0 at the
 * edge, times `brightness`. The shader in src/scene/sun evaluates the same expression.
 */
export function glowProfile(r: number, brightness = 1): number {
  if (r >= 1) return 0;
  const x = Math.max(0, r);
  const edge = (1 - x) * (1 - x);
  return brightness * edge * (0.35 * Math.exp(-6 * x) + 0.65 * (1 - x));
}
