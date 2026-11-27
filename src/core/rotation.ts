import raw from "../../data/rotation.json";
import { eclipticFromEquatorial } from "./frames.ts";

// VN-SCN-009: body orientation and spin by the IAU WGCCRE 2015 rotation models (data/rotation.json): the north pole's
// right ascension and declination and the prime meridian angle W, each a polynomial in time plus periodic terms.
// The body-fixed frame has z along the pole, x through the prime meridian (longitude 0) and y at 90 degrees east.
// Pure; allocates nothing per call.

const DEG = Math.PI / 180;
const DAY = 86400;
const CENTURY = 36525 * DAY;

type Term = [number, number, number, string];
interface Quantity {
  c: number[];
  terms?: Term[];
}
interface Model {
  ra: Quantity;
  dec: Quantity;
  w: Quantity;
}

/** Flattened model: per quantity the polynomial and terms as [amplitude, phase, rate, inCenturies (1 or 0)]. */
interface Compiled {
  c: Float64Array;
  terms: Float64Array;
}

function compile(q: Quantity): Compiled {
  const terms = new Float64Array(4 * (q.terms?.length ?? 0));
  q.terms?.forEach((t, i) => {
    terms.set([t[0], t[1], t[2], t[3] === "T" ? 1 : 0], 4 * i);
  });
  return { c: Float64Array.from([q.c[0] ?? 0, q.c[1] ?? 0, q.c[2] ?? 0]), terms };
}

const MODELS = new Map<number, { ra: Compiled; dec: Compiled; w: Compiled }>(
  Object.entries((raw as unknown as { bodies: Record<string, Model> }).bodies).map(([id, m]) => [
    Number(id),
    { ra: compile(m.ra), dec: compile(m.dec), w: compile(m.w) },
  ]),
);

/** Horizons IDs that have a rotation model. */
export const ROTATING_BODIES: readonly number[] = [...MODELS.keys()];

export const ROTATION_SOURCE: string = (raw as { source: string }).source;

function periodic(q: Compiled, T: number, d: number, f: (x: number) => number): number {
  let s = 0;
  const t = q.terms;
  for (let i = 0; i < t.length; i += 4) s += t[i]! * f((t[i + 1]! + t[i + 2]! * (t[i + 3]! ? T : d)) * DEG);
  return s;
}

/**
 * The pole right ascension, declination and prime meridian angle (degrees, ICRF; W in [0, 360)) of body `id` at
 * TDB seconds since J2000, into out[o..o+2]. False when the body has no model.
 */
export function rotationAngles(id: number, t: number, out: Float64Array, o = 0): boolean {
  const m = MODELS.get(id);
  if (!m) return false;
  const T = t / CENTURY;
  const d = t / DAY;
  out[o] = m.ra.c[0]! + m.ra.c[1]! * T + periodic(m.ra, T, d, Math.sin);
  out[o + 1] = m.dec.c[0]! + m.dec.c[1]! * T + periodic(m.dec, T, d, Math.cos);
  // W grows by up to ~1e7 degrees over a century; reduce the polynomial part first to keep its precision.
  const w = ((m.w.c[0]! + ((m.w.c[1]! * d) % 360) + m.w.c[2]! * d * d) % 360) + periodic(m.w, T, d, Math.sin);
  out[o + 2] = ((w % 360) + 360) % 360;
  return true;
}

const ang = new Float64Array(3);
const col = new Float64Array(3);
const ax = new Float64Array(9);

/**
 * The rotation from the body-fixed frame of `id` to ecliptic J2000 at TDB time t, as a row-major 3x3 matrix in
 * out[o..o+8]: its columns are the body's x (prime meridian), y and z (north pole) axes in ecliptic coordinates.
 * False when the body has no model.
 */
export function bodyToEcliptic(id: number, t: number, out: Float64Array, o = 0): boolean {
  if (!rotationAngles(id, t, ang)) return false;
  const a = ang[0]! * DEG;
  const dec = ang[1]! * DEG;
  const w = ang[2]! * DEG;
  // Equatorial: the pole p, the node n = (z x p)/|z x p| (ascending node of the body's equator on the ICRF
  // equator, at RA a + 90 deg), and m = p x n; the prime meridian is at angle W from n along the body's equator.
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cd = Math.cos(dec);
  const sd = Math.sin(dec);
  const p0 = cd * ca;
  const p1 = cd * sa;
  const p2 = sd;
  const n0 = -sa;
  const n1 = ca;
  const n2 = 0;
  const m0 = p1 * n2 - p2 * n1;
  const m1 = p2 * n0 - p0 * n2;
  const m2 = p0 * n1 - p1 * n0;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  // x = cos W n + sin W m; y = -sin W n + cos W m; z = p
  ax[0] = cw * n0 + sw * m0;
  ax[1] = cw * n1 + sw * m1;
  ax[2] = cw * n2 + sw * m2;
  ax[3] = -sw * n0 + cw * m0;
  ax[4] = -sw * n1 + cw * m1;
  ax[5] = -sw * n2 + cw * m2;
  ax[6] = p0;
  ax[7] = p1;
  ax[8] = p2;
  for (let c = 0; c < 3; c++) {
    col[0] = ax[3 * c]!;
    col[1] = ax[3 * c + 1]!;
    col[2] = ax[3 * c + 2]!;
    eclipticFromEquatorial(col, col);
    out[o + c] = col[0]!;
    out[o + 3 + c] = col[1]!;
    out[o + 6 + c] = col[2]!;
  }
  return true;
}
