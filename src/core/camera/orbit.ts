// VN-CAM-001: the orbit camera's maths. The camera looks at a focus from `distance` km in the direction given by
// azimuth (about the scene's y axis, from +z towards +x) and elevation (above the ecliptic plane). Zoom is
// exponential: each wheel step multiplies the distance by a fixed ratio. Pure functions; the state is mutated in
// place so the scene allocates nothing per event.

/** Distance ratio per wheel step (one notch out). */
export const ZOOM_RATIO = 1.15;
/** Farthest camera distance, km. */
export const MAX_DISTANCE_KM = 1e11;
/** Closest approach to a point with no radius, km (1 m). */
export const MIN_DISTANCE_KM = 1e-3;
/** Elevation limit, rad (89 degrees; the view never flips over a pole). */
export const MAX_ELEVATION = (89 * Math.PI) / 180;
/** Keyboard orbit step, rad (5 degrees). */
export const KEY_ORBIT = Math.PI / 36;

export interface OrbitState {
  distance: number;
  azimuth: number;
  elevation: number;
}

export function createOrbit(distance: number, azimuth = 0, elevation = 0): OrbitState {
  return { distance, azimuth, elevation };
}

/** The closest the camera may come to a body of this radius: 1.05 radii, at least 1 m. */
export function minDistanceFor(radiusKm: number): number {
  return Math.max(MIN_DISTANCE_KM, radiusKm * 1.05);
}

function clampDistance(d: number, min: number): number {
  return d < min ? min : d > MAX_DISTANCE_KM ? MAX_DISTANCE_KM : d;
}

/** Multiplies the distance by ZOOM_RATIO^steps (positive steps move out), clamped to [min, MAX_DISTANCE_KM]. */
export function zoom(s: OrbitState, steps: number, minDistance: number): void {
  s.distance = clampDistance(s.distance * ZOOM_RATIO ** steps, minDistance);
}

/** Pinch: the distance divided by the ratio of the new finger spread to the old. */
export function pinch(s: OrbitState, spreadRatio: number, minDistance: number): void {
  if (!(spreadRatio > 0) || !Number.isFinite(spreadRatio)) return;
  s.distance = clampDistance(s.distance / spreadRatio, minDistance);
}

/** Wheel steps from a WheelEvent's deltaY and deltaMode (0 pixels, 100 per notch; 1 lines, 3 per notch; 2 pages). */
export function wheelSteps(deltaY: number, deltaMode: number): number {
  return deltaMode === 1 ? deltaY / 3 : deltaMode === 2 ? deltaY * 3 : deltaY / 100;
}

/** Rotates by dAz and dEl, rad; azimuth wraps to (-pi, pi], elevation clamps to +-MAX_ELEVATION. */
export function orbit(s: OrbitState, dAz: number, dEl: number): void {
  let az = (s.azimuth + dAz) % (2 * Math.PI);
  if (az > Math.PI) az -= 2 * Math.PI;
  else if (az <= -Math.PI) az += 2 * Math.PI;
  s.azimuth = az;
  const el = s.elevation + dEl;
  s.elevation = el > MAX_ELEVATION ? MAX_ELEVATION : el < -MAX_ELEVATION ? -MAX_ELEVATION : el;
}

/** Eye position relative to the focus, km (scene frame, y up), into out. */
export function eyeOffset(s: OrbitState, out: Float64Array): Float64Array {
  const ce = Math.cos(s.elevation);
  out[0] = s.distance * ce * Math.sin(s.azimuth);
  out[1] = s.distance * Math.sin(s.elevation);
  out[2] = s.distance * ce * Math.cos(s.azimuth);
  return out;
}

/**
 * The focus shift for a drag of (dxPx, dyPx) screen pixels (y down) in a viewport `heightPx` tall with vertical
 * field of view `fovRad`: the point at the focus stays under the cursor. Into out, km.
 */
export function panDelta(
  s: OrbitState,
  dxPx: number,
  dyPx: number,
  heightPx: number,
  fovRad: number,
  out: Float64Array,
): Float64Array {
  const perPx = (2 * s.distance * Math.tan(fovRad / 2)) / heightPx;
  const sa = Math.sin(s.azimuth);
  const ca = Math.cos(s.azimuth);
  const se = Math.sin(s.elevation);
  const ce = Math.cos(s.elevation);
  // right = (cos az, 0, -sin az); up = (-sin el sin az, cos el, -sin el cos az)
  const r = -dxPx * perPx;
  const u = dyPx * perPx;
  out[0] = r * ca - u * se * sa;
  out[1] = u * ce;
  out[2] = -r * sa - u * se * ca;
  return out;
}

export type KeyAction = { kind: "orbit"; dAz: number; dEl: number } | { kind: "zoom"; steps: number };

/** Basic keys: arrows orbit by 5 degrees, + and - zoom one step, Page Up and Page Down five. */
export function keyAction(key: string): KeyAction | null {
  switch (key) {
    case "ArrowLeft":
      return { kind: "orbit", dAz: -KEY_ORBIT, dEl: 0 };
    case "ArrowRight":
      return { kind: "orbit", dAz: KEY_ORBIT, dEl: 0 };
    case "ArrowUp":
      return { kind: "orbit", dAz: 0, dEl: KEY_ORBIT };
    case "ArrowDown":
      return { kind: "orbit", dAz: 0, dEl: -KEY_ORBIT };
    case "+":
    case "=":
      return { kind: "zoom", steps: -1 };
    case "-":
    case "_":
      return { kind: "zoom", steps: 1 };
    case "PageUp":
      return { kind: "zoom", steps: -5 };
    case "PageDown":
      return { kind: "zoom", steps: 5 };
    default:
      return null;
  }
}
