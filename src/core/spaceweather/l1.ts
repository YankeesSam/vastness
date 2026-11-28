// T-102 (VN-EXT-007): the Sun-Earth L1 point, where the solar wind monitors SWPC uses fly (ACE, DSCOVR, SWFO-L1), on
// the Sun-Earth line at the Hill-sphere distance r = a (m / 3M)^(1/3) sunward of Earth (m Earth plus Moon); about
// 1.5 million km, within 1 % of the exact collinear root, which is far below a pixel at the scales it is seen at.

import { BODIES } from "../constants";

const M_RATIO = (BODIES[399]!.gmKm3S2 + BODIES[301]!.gmKm3S2) / BODIES[10]!.gmKm3S2;

/** L1 position (same frame and units as the inputs) into out[0..2], from the Sun's and Earth's positions. */
export function l1Position(
  sun: ArrayLike<number>,
  earth: ArrayLike<number>,
  out: Float64Array,
  so = 0,
  eo = 0,
): Float64Array {
  const dx = earth[eo]! - sun[so]!;
  const dy = earth[eo + 1]! - sun[so + 1]!;
  const dz = earth[eo + 2]! - sun[so + 2]!;
  const f = 1 - Math.cbrt(M_RATIO / 3);
  out[0] = sun[so]! + f * dx;
  out[1] = sun[so + 1]! + f * dy;
  out[2] = sun[so + 2]! + f * dz;
  return out;
}
