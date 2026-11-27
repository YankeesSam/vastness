// VN-SCN-004, VN-CAM-004 (ADR-0004): the floating origin. The camera sits at the render origin; every object's
// render position is its float64 world position minus the float64 camera position, taken on the CPU before any
// value reaches a float32 buffer. Render units are km.

/** Smallest near plane, km (1 m). */
export const MIN_NEAR_KM = 1e-3;
/** Far plane, km (about 6700 AU; the log depth buffer keeps the ratio usable). */
export const FAR_KM = 1e12;
/** Near plane as a fraction of the distance to the focus. */
export const NEAR_RATIO = 1e-6;

/**
 * world[wo..wo+2] - cam[0..2] into out[oo..oo+2], in float64 (out may be a Float32Array: the cast comes after the
 * subtraction). Allocates nothing.
 */
export function toCamera(
  world: ArrayLike<number>,
  cam: ArrayLike<number>,
  out: { [i: number]: number },
  wo = 0,
  oo = 0,
): void {
  out[oo] = world[wo]! - cam[0]!;
  out[oo + 1] = world[wo + 1]! - cam[1]!;
  out[oo + 2] = world[wo + 2]! - cam[2]!;
}

export interface ClipPlanes {
  near: number;
  far: number;
}

/** VN-CAM-004: near = max(1 m, d x 1e-6), far = 1e12 km, from the distance d (km) to the focus. */
export function clipPlanes(focusDistanceKm: number, out: ClipPlanes = { near: 0, far: 0 }): ClipPlanes {
  const near = focusDistanceKm * NEAR_RATIO;
  out.near = near > MIN_NEAR_KM ? near : MIN_NEAR_KM;
  out.far = FAR_KM;
  return out;
}
