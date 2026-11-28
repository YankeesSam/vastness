// T-107, VN-EXT-015: comet tails from the comet's heliocentric state (km, km/s, ecliptic J2000). Pure; no allocation
// per call.
//
// - Activity: the gas production rate of an active comet scales roughly as 1/r^2 inside about 3 au, where water ice
//   sublimates; it is normalised to 1 at 1 au and faded to zero between TAIL_FADE_AU and TAIL_OFF_AU. Tails are an
//   illustration scaled by this, not a measured brightness.
// - Ion tail: the plasma is carried by the solar wind, so it points along the wind's velocity relative to the comet,
//   radial at SOLAR_WIND_KM_S minus the comet's velocity: away from the Sun, swung back a few degrees against the
//   motion (the aberration of the ion tail).
// - Dust tail: a syndyne. Grains of one radiation-pressure ratio beta, released tau ago, feel the Sun's gravity
//   reduced by beta, so relative to the nucleus they drift outwards by 1/2 beta GM / r^2 tau^2 along the Sun direction
//   at release; the release point lies back along the orbit (r - v tau to first order), so older dust lies further
//   out and behind, and the tail curves.

/** Radial solar wind speed for the ion tail's aberration, km/s (slow wind). */
export const SOLAR_WIND_KM_S = 400;
/** Radiation-pressure to gravity ratio of the drawn dust (typical of micron-sized grains). */
export const DUST_BETA = 0.5;
/** Activity fades from 1/r^2 to zero between these heliocentric distances, au. */
export const TAIL_FADE_AU = 3;
export const TAIL_OFF_AU = 5;
const AU_KM = 149_597_870.7;

/** Relative activity at `rAu` from the Sun: 1/r^2 (1 at 1 au), faded to 0 at TAIL_OFF_AU. */
export function activity(rAu: number): number {
  if (!(rAu > 0) || rAu >= TAIL_OFF_AU) return 0;
  const a = 1 / (rAu * rAu);
  if (rAu <= TAIL_FADE_AU) return a;
  const x = (rAu - TAIL_FADE_AU) / (TAIL_OFF_AU - TAIL_FADE_AU);
  return a * (1 - x * x * (3 - 2 * x));
}

/** Unit vector of the ion tail into `out`: the solar wind velocity relative to the comet. */
export function ionTailDirection(r: ArrayLike<number>, v: ArrayLike<number>, out: Float64Array, o = 0): void {
  const rn = Math.hypot(r[0]!, r[1]!, r[2]!);
  const x = (r[0]! / rn) * SOLAR_WIND_KM_S - v[0]!;
  const y = (r[1]! / rn) * SOLAR_WIND_KM_S - v[1]!;
  const z = (r[2]! / rn) * SOLAR_WIND_KM_S - v[2]!;
  const n = Math.hypot(x, y, z);
  out[o] = x / n;
  out[o + 1] = y / n;
  out[o + 2] = z / n;
}

/**
 * The dust tail as `count` points relative to the nucleus (km) into `out`, from fresh dust (the nucleus, point 0) to
 * dust released `maxAgeS` ago, ages spaced evenly. `mu` is the Sun's GM (km^3/s^2).
 */
export function dustTail(
  r: ArrayLike<number>,
  v: ArrayLike<number>,
  mu: number,
  beta: number,
  maxAgeS: number,
  out: Float64Array,
  count: number,
): void {
  for (let k = 0; k < count; k++) {
    const tau = count > 1 ? (maxAgeS * k) / (count - 1) : 0;
    const x = r[0]! - v[0]! * tau;
    const y = r[1]! - v[1]! * tau;
    const z = r[2]! - v[2]! * tau;
    const d2 = x * x + y * y + z * z;
    const d = Math.sqrt(d2);
    const s = (0.5 * beta * mu * tau * tau) / (d2 * d);
    out[3 * k] = x * s;
    out[3 * k + 1] = y * s;
    out[3 * k + 2] = z * s;
  }
}

/** Heliocentric distance of `r` (km) in au. */
export const distanceAu = (r: ArrayLike<number>): number => Math.hypot(r[0]!, r[1]!, r[2]!) / AU_KM;
