// VN-CAM-002: fly-to on a logarithmic distance curve. The path is van Wijk and Nuij's optimal zoom-and-pan
// ("Smooth and efficient zooming and panning", InfoVis 2003): with w the view width (here the camera distance)
// and u the progress along the straight line from start to end focus, it climbs just high enough to see both ends,
// then descends, at a constant perceived speed. Its length S is in log-distance units, so the duration grows with
// the log of the distance travelled; it is capped under 4 s. Pure maths; the scene supplies the end points.

/** Zoom-versus-pan trade-off (van Wijk and Nuij recommend about 1.4). */
export const RHO = Math.SQRT2;
/** Duration = FLIGHT_BASE_S + FLIGHT_PER_UNIT_S x S, capped at MAX_FLIGHT_S. */
export const FLIGHT_BASE_S = 0.6;
export const FLIGHT_PER_UNIT_S = 0.16;
export const MAX_FLIGHT_S = 3.6;

export interface Flight {
  /** Straight-line distance between the start and end focus, km. */
  readonly D: number;
  readonly w0: number;
  readonly w1: number;
  /** Path length in log-distance units. */
  readonly S: number;
  /** Seconds. */
  readonly duration: number;
  readonly r0: number;
  /** True when D is negligible: a pure zoom. */
  readonly zoomOnly: boolean;
}

export interface FlightPoint {
  /** Progress from the start focus (0) to the end focus (1). */
  u: number;
  /** Camera distance, km. */
  w: number;
}

/** A flight from distance w0 to w1 across a focus move of D km. */
export function planFlight(D: number, w0: number, w1: number): Flight {
  const rho2 = RHO * RHO;
  const zoomOnly = !(D > 1e-9 * Math.max(w0, w1));
  let S: number;
  let r0 = 0;
  if (zoomOnly) {
    S = Math.abs(Math.log(w1 / w0)) / RHO;
  } else {
    // r_i = ln(-b_i + sqrt(b_i^2 + 1)) = -asinh(b_i), the stable form for the large b of interplanetary moves.
    const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * D * D) / (2 * w0 * rho2 * D);
    const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * D * D) / (2 * w1 * rho2 * D);
    r0 = -Math.asinh(b0);
    const r1 = -Math.asinh(b1);
    S = (r1 - r0) / RHO;
  }
  const duration = S > 0 ? Math.min(MAX_FLIGHT_S, FLIGHT_BASE_S + FLIGHT_PER_UNIT_S * S) : 0;
  return { D, w0, w1, S, duration, r0, zoomOnly };
}

/** Eases time in and out (smootherstep), so the camera starts and stops gently. */
function ease(x: number): number {
  return x * x * x * (x * (6 * x - 15) + 10);
}

/** The flight at time fraction tau in [0, 1] into out. The ends are exact. */
export function flightAt(f: Flight, tau: number, out: FlightPoint): FlightPoint {
  if (!(tau > 0)) {
    out.u = 0;
    out.w = f.w0;
    return out;
  }
  if (tau >= 1 || f.S === 0) {
    out.u = 1;
    out.w = f.w1;
    return out;
  }
  const e = ease(tau);
  const s = f.S * e;
  if (f.zoomOnly) {
    out.u = e;
    out.w = f.w0 * Math.exp((f.w1 > f.w0 ? 1 : -1) * RHO * s);
    return out;
  }
  const rho2 = RHO * RHO;
  const c0 = Math.cosh(f.r0);
  const a = RHO * s + f.r0;
  const u = (f.w0 / rho2) * (c0 * Math.tanh(a) - Math.sinh(f.r0));
  const frac = u / f.D;
  out.u = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  out.w = (f.w0 * c0) / Math.cosh(a);
  return out;
}

/** Distance that frames a body of this radius after a fly-to: four radii (it fills about half a 50 degree view). */
export function frameDistance(radiusKm: number): number {
  return Math.max(radiusKm * 4, 1e-2);
}
