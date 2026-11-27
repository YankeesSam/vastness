import { OBLIQUITY_J2000_ARCSEC } from "../constants.ts";

// ADR-0007, ADR-0003: SGP4's TEME frame (true equator, mean equinox of date) to the app's J2000 ecliptic. TEME to
// true of date by the equation of the equinoxes, true to mean of date by IAU 1980 nutation (its largest terms:
// truncation under about 0.1 arcsecond, 20 m at GEO, far below SGP4's own error), mean of date to J2000 equator by
// IAU 1976 precession, then the fixed J2000 obliquity Horizons uses. Velocities are rotated the same way (the
// frame's own rotation rate, about 1e-11 rad/s, is negligible). Pure; a call builds its matrix from a few small
// arrays, so callers convert once per satellite per frame, not per vertex.

const AS = Math.PI / (180 * 3600);
const DEG = Math.PI / 180;

/** IAU 1980 nutation, largest terms: multipliers of l, l', F, D, Omega; dpsi (A + B T) and deps (C + D T) in 0.1 mas. */
const NUT: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
  [0, 0, 2, -2, 2, -13187, -1.6, 5736, -3.1],
  [0, 0, 2, 0, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
  [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
  [1, 0, 0, 0, 0, 712, 0.1, -7, 0],
  [0, 1, 2, -2, 2, -517, 1.2, 224, -0.6],
  [0, 0, 2, 0, 1, -386, -0.4, 200, 0],
  [1, 0, 2, 0, 2, -301, 0, 129, -0.1],
  [0, -1, 2, -2, 2, 217, -0.5, -95, 0.3],
  [1, 0, 0, -2, 0, -158, 0, -1, 0],
  [0, 0, 2, -2, 1, 129, 0.1, -70, 0],
  [-1, 0, 2, 0, 2, 123, 0, -53, 0],
  [0, 0, 0, 2, 0, 63, 0, -2, 0],
  [1, 0, 0, 0, 1, 63, 0.1, -33, 0],
  [-1, 0, 2, 2, 2, -59, 0, 26, 0],
  [-1, 0, 0, 0, 1, -58, -0.1, 32, 0],
  [1, 0, 2, 0, 1, -51, 0, 27, 0],
];

const m = new Float64Array(9);
const tmp = new Float64Array(3);

/** Rotation matrix TEME -> J2000 ecliptic at TT Julian centuries `ttt` from J2000, into m (row-major). */
function matrix(ttt: number): void {
  const t2 = ttt * ttt;
  const t3 = t2 * ttt;
  // Delaunay arguments (IAU 1980), rad.
  const l = (134.96340251 + (1717915923.2178 * ttt + 31.8792 * t2 + 0.051635 * t3) / 3600) * DEG;
  const lp = (357.52910918 + (129596581.0481 * ttt - 0.5532 * t2 + 0.000136 * t3) / 3600) * DEG;
  const f = (93.27209062 + (1739527262.8478 * ttt - 12.7512 * t2 - 0.001037 * t3) / 3600) * DEG;
  const d = (297.85019547 + (1602961601.209 * ttt - 6.3706 * t2 + 0.006593 * t3) / 3600) * DEG;
  const om = (125.04455501 + (-6962890.2665 * ttt + 7.4722 * t2 + 0.007702 * t3) / 3600) * DEG;
  let dpsi = 0;
  let deps = 0;
  for (const r of NUT) {
    const arg = r[0]! * l + r[1]! * lp + r[2]! * f + r[3]! * d + r[4]! * om;
    dpsi += (r[5]! + r[6]! * ttt) * Math.sin(arg);
    deps += (r[7]! + r[8]! * ttt) * Math.cos(arg);
  }
  dpsi *= 1e-4 * AS;
  deps *= 1e-4 * AS;
  const epsMean = (84381.448 - 46.815 * ttt - 0.00059 * t2 + 0.001813 * t3) * AS;
  const eps = epsMean + deps;
  // Precession angles (IAU 1976), rad.
  const zeta = (2306.2181 * ttt + 0.30188 * t2 + 0.017998 * t3) * AS;
  const theta = (2004.3109 * ttt - 0.42665 * t2 - 0.041833 * t3) * AS;
  const z = (2306.2181 * ttt + 1.09468 * t2 + 0.018203 * t3) * AS;
  const eqe = dpsi * Math.cos(epsMean);

  // Build M = E * P^T * N^T * R3(-eqe), applied to TEME column vectors (E: J2000 equator -> ecliptic).
  // Each step as a 3x3 product; small and run once per call.
  const r3 = (a: number): number[] => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  const r1 = (a: number): number[] => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
  const r2 = (a: number): number[] => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
  const mul = (a: number[], b: number[]): number[] => {
    const o = new Array<number>(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        o[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
    return o;
  };
  const tr = (a: number[]): number[] => [a[0]!, a[3]!, a[6]!, a[1]!, a[4]!, a[7]!, a[2]!, a[5]!, a[8]!];
  // Passive rotations: P (J2000 -> mean of date) = R3(-z) R2(theta) R3(-zeta); N (mean -> true) = R1(-eps) R3(-dpsi) R1(epsMean).
  const P = mul(r3(-z), mul(r2(theta), r3(-zeta)));
  const N = mul(r1(-eps), mul(r3(-dpsi), r1(epsMean)));
  // TEME -> true of date: the true equinox is eqe east of the mean one along the equator.
  const Q = r3(-eqe);
  const E = r1(OBLIQUITY_J2000_ARCSEC * AS);
  const M = mul(E, mul(tr(P), mul(tr(N), Q)));
  for (let k = 0; k < 9; k++) m[k] = M[k]!;
}

/** Rotates a TEME state (km, km/s) in st[o..o+5] to J2000 equatorial when `ecliptic` is false, else J2000 ecliptic. */
export function temeToJ2000(st: Float64Array, ttt: number, ecliptic = true, o = 0): void {
  matrix(ttt);
  if (!ecliptic) {
    // Undo the ecliptic step: M_eq = E^T M.
    const e = OBLIQUITY_J2000_ARCSEC * AS;
    const c = Math.cos(e);
    const s = Math.sin(e);
    for (let j = 0; j < 3; j++) {
      const y = m[3 + j]!;
      const zz = m[6 + j]!;
      m[3 + j] = c * y - s * zz;
      m[6 + j] = s * y + c * zz;
    }
  }
  for (let v = 0; v < 2; v++) {
    const b = o + 3 * v;
    for (let i = 0; i < 3; i++) tmp[i] = m[3 * i]! * st[b]! + m[3 * i + 1]! * st[b + 1]! + m[3 * i + 2]! * st[b + 2]!;
    st[b] = tmp[0]!;
    st[b + 1] = tmp[1]!;
    st[b + 2] = tmp[2]!;
  }
}
