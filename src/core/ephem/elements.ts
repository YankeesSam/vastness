import { fitChebyshev } from "./chebyshev.ts";
import { KIND_ELEMENTS, type EphemerisFile } from "./format.ts";

// VN-EPH-011: element segments. An orbiter's osculating elements relative to its parent, fitted per segment with
// Chebyshev polynomials: a (km), e, i, node, argument of periapsis (rad, unwrapped), and L = M - n t (rad), where n
// is the file's reference mean motion and t TDB seconds since J2000. Position and velocity come from Kepler's
// equation and the two-body relations with the parent's GM, which for osculating elements is the true velocity.
// Elliptic orbits only (0 <= e < 1, a > 0).

/** Component order in an element segment. */
export const ELEMENT_A = 0;
export const ELEMENT_E = 1;
export const ELEMENT_I = 2;
export const ELEMENT_NODE = 3;
export const ELEMENT_PERI = 4;
export const ELEMENT_L = 5;

const TWO_PI = 2 * Math.PI;
const KEPLER_ITERATIONS = 30;

/**
 * Osculating elements [a, e, i, node, argument of periapsis, mean anomaly] (km, rad; angles in [0, 2 pi) except i)
 * from a state x, y, z, vx, vy, vz (km, km/s) about a centre of GM `mu` (km^3/s^2). Throws on a non-elliptic state.
 * Node and periapsis are taken as 0 where undefined (i = 0, e = 0) so the angles that remain stay continuous.
 */
export function stateToElements(state: ArrayLike<number>, mu: number): Float64Array {
  const [x, y, z, vx, vy, vz] = [state[0]!, state[1]!, state[2]!, state[3]!, state[4]!, state[5]!];
  const r = Math.hypot(x, y, z);
  const v2 = vx * vx + vy * vy + vz * vz;
  const a = 1 / (2 / r - v2 / mu);
  if (!(a > 0)) throw new RangeError("state is not elliptic");
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const hz = x * vy - y * vx;
  const h = Math.hypot(hx, hy, hz);
  const rv = x * vx + y * vy + z * vz;
  const ex = ((v2 - mu / r) * x - rv * vx) / mu;
  const ey = ((v2 - mu / r) * y - rv * vy) / mu;
  const ez = ((v2 - mu / r) * z - rv * vz) / mu;
  const e = Math.hypot(ex, ey, ez);
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));
  const nodeLen = Math.hypot(hx, hy);
  const node = nodeLen > 1e-12 * h ? Math.atan2(hx, -hy) : 0;
  // Node line n^ and the in-plane axis m^ = h^ x n^.
  const nx = Math.cos(node);
  const ny = Math.sin(node);
  const mx = (-hz * ny) / h;
  const my = (hz * nx) / h;
  const mz = (hx * ny - hy * nx) / h;
  const peri = e > 1e-12 ? Math.atan2(ex * mx + ey * my + ez * mz, ex * nx + ey * ny) : 0;
  // Argument of latitude u from the node; true anomaly = u - peri.
  const u = Math.atan2(x * mx + y * my + z * mz, x * nx + y * ny);
  const nu = u - peri;
  const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu));
  const M = E - e * Math.sin(E);
  const wrap = (w: number) => ((w % TWO_PI) + TWO_PI) % TWO_PI;
  return Float64Array.from([a, e, i, wrap(node), wrap(peri), wrap(M)]);
}

const packed = new Float64Array(7);

/**
 * State (km, km/s) into out[o..o+5] from elements a, e, i, node, periapsis, M. Newton on Kepler's equation with a
 * fixed iteration cap. No allocation.
 */
export function elementsToState(
  a: number,
  e: number,
  i: number,
  node: number,
  peri: number,
  M: number,
  mu: number,
  out: Float64Array,
  o: number,
): void {
  packed[0] = a;
  packed[1] = e;
  packed[2] = i;
  packed[3] = node;
  packed[4] = peri;
  packed[5] = M;
  packed[6] = mu;
  stateFromElements(packed, out, o);
}

/**
 * The same from el = [a, e, i, node, periapsis, M, mu]: the elements travel in a Float64Array so that no float64
 * crosses a call boundary on the hot path (V8 boxes those it does not inline).
 */
function stateFromElements(el: Float64Array, out: Float64Array, o: number): void {
  const a = el[0]!;
  const e = el[1]!;
  const i = el[2]!;
  const node = el[3]!;
  const peri = el[4]!;
  const mu = el[6]!;
  let m = el[5]! % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  else if (m < -Math.PI) m += TWO_PI;
  let E = e < 0.8 ? m + e * Math.sin(m) : m >= 0 ? Math.PI : -Math.PI;
  for (let k = 0; k < KEPLER_ITERATIONS; k++) {
    const dE = (m - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-15) break;
  }
  const cE = Math.cos(E);
  const sE = Math.sin(E);
  const sq = Math.sqrt(1 - e * e);
  const xp = a * (cE - e);
  const yp = a * sq * sE;
  const Edot = Math.sqrt(mu / (a * a * a)) / (1 - e * cE);
  const vxp = -a * sE * Edot;
  const vyp = a * sq * cE * Edot;
  const cw = Math.cos(peri);
  const sw = Math.sin(peri);
  const cW = Math.cos(node);
  const sW = Math.sin(node);
  const cI = Math.cos(i);
  const sI = Math.sin(i);
  const px = cw * cW - sw * sW * cI;
  const py = cw * sW + sw * cW * cI;
  const pz = sw * sI;
  const qx = -sw * cW - cw * sW * cI;
  const qy = -sw * sW + cw * cW * cI;
  const qz = cw * sI;
  out[o] = px * xp + qx * yp;
  out[o + 1] = py * xp + qy * yp;
  out[o + 2] = pz * xp + qz * yp;
  out[o + 3] = px * vxp + qx * vyp;
  out[o + 4] = py * vxp + qy * vyp;
  out[o + 5] = pz * vxp + qz * vyp;
}

const el = new Float64Array(7);

/**
 * State relative to the file's centre at time clock[0] from segment `s` of an element file, into out[o..o+5]. The
 * time arrives in a Float64Array so no float64 crosses a call boundary (see ephemeris.ts): no allocation.
 */
export function evaluateElementSegment(
  f: EphemerisFile,
  s: number,
  clock: Float64Array,
  out: Float64Array,
  o: number,
): void {
  const t = clock[0]!;
  const a0 = f.t0[s]!;
  const span = f.t1[s]! - a0;
  const tau = (2 * (t - a0)) / span - 1;
  const tau2 = 2 * tau;
  const n = f.degree + 1;
  const coeffs = f.coeffs;
  for (let c = 0; c < 6; c++) {
    const base = (s * 6 + c) * n;
    let b1 = 0;
    let b2 = 0;
    for (let k = n - 1; k >= 1; k--) {
      const b0 = coeffs[base + k]! + tau2 * b1 - b2;
      b2 = b1;
      b1 = b0;
    }
    el[c] = coeffs[base]! + tau * b1 - b2;
  }
  el[ELEMENT_L] = el[ELEMENT_L]! + f.meanMotion * t; // now M
  el[6] = f.mu;
  stateFromElements(el, out, o);
}

/** Unwraps an angle series in place so consecutive values differ by less than pi. */
export function unwrapAngles(values: Float64Array): Float64Array {
  for (let k = 1; k < values.length; k++) {
    let d = values[k]! - values[k - 1]!;
    while (d > Math.PI) {
      values[k] = values[k]! - TWO_PI;
      d -= TWO_PI;
    }
    while (d < -Math.PI) {
      values[k] = values[k]! + TWO_PI;
      d += TWO_PI;
    }
  }
  return values;
}

/**
 * Element series for fitting from states sampled at ascending TDB `times`: per sample a, e, i, node, periapsis
 * and L = M - meanMotion t, with the angles unwrapped across the series. Returns six arrays.
 */
export function elementSeries(
  times: ArrayLike<number>,
  states: ArrayLike<ArrayLike<number>>,
  mu: number,
  meanMotion: number,
): Float64Array[] {
  const m = times.length;
  const cols = Array.from({ length: 6 }, () => new Float64Array(m));
  for (let k = 0; k < m; k++) {
    const e = stateToElements(states[k]!, mu);
    for (let c = 0; c < 6; c++) cols[c]![k] = e[c]!;
  }
  for (const c of [ELEMENT_NODE, ELEMENT_PERI, ELEMENT_L]) unwrapAngles(cols[c]!);
  for (let k = 0; k < m; k++) cols[ELEMENT_L]![k] = cols[ELEMENT_L]![k]! - meanMotion * times[k]!;
  return cols;
}

/**
 * Fits one element segment over [t0, t1] to element series (from `elementSeries`) at `times`, returning
 * 6 x (degree + 1) coefficients in file layout.
 */
export function fitElementSegment(
  t0: number,
  t1: number,
  times: ArrayLike<number>,
  series: readonly ArrayLike<number>[],
  degree: number,
): Float64Array {
  const span = t1 - t0;
  const tau = Float64Array.from(times, (t) => (2 * (t - t0)) / span - 1);
  const n = degree + 1;
  const out = new Float64Array(6 * n);
  for (let c = 0; c < 6; c++) out.set(fitChebyshev(tau, series[c]!, degree), c * n);
  return out;
}

/** True when the file holds element segments. */
export const isElementFile = (f: EphemerisFile): boolean => f.kind === KIND_ELEMENTS;
