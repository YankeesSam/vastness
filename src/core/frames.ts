import { AU_KM, C_KM_S, OBLIQUITY_J2000_ARCSEC } from "./constants";

// ADR-0003: positions are heliocentric ecliptic J2000 (Horizons REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF) in km, as
// float64. The scene's y-up mapping exists here and nowhere else.

/** A 3-vector in float64. Index 0, 1, 2 are x, y, z. */
export type Vec3 = Float64Array;
type Vec3In = ArrayLike<number>;

export function vec3(x: number, y: number, z: number): Vec3 {
  const v = new Float64Array(3);
  v[0] = x;
  v[1] = y;
  v[2] = z;
  return v;
}

export function norm(v: Vec3In): number {
  return Math.hypot(v[0]!, v[1]!, v[2]!);
}

export function distance(a: Vec3In, b: Vec3In): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export function cross(a: Vec3In, b: Vec3In, out: Vec3 = new Float64Array(3)): Vec3 {
  const x = a[1]! * b[2]! - a[2]! * b[1]!;
  const y = a[2]! * b[0]! - a[0]! * b[2]!;
  const z = a[0]! * b[1]! - a[1]! * b[0]!;
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export const auFromKm = (km: number): number => km / AU_KM;
export const kmFromAu = (au: number): number => au * AU_KM;
/** One-way light-time for a distance in km (geometric distance / c). */
export const lightTimeSeconds = (km: number): number => km / C_KM_S;

/**
 * The one ecliptic-to-scene conversion: ecliptic (x, y, z), z towards the ecliptic north pole, to the three.js
 * y-up frame (x, z, -y). Both are right-handed. Writes into `out` (float64; the scene subtracts the camera first).
 */
export function sceneFromEcliptic(v: Vec3In, out: Float64Array): Float64Array {
  const x = v[0]!;
  const y = v[1]!;
  const z = v[2]!;
  out[0] = x;
  out[1] = z;
  out[2] = -y;
  return out;
}

const EPS = (OBLIQUITY_J2000_ARCSEC / 3600) * (Math.PI / 180);
const COS_EPS = Math.cos(EPS);
const SIN_EPS = Math.sin(EPS);

/** Equatorial J2000 (ICRF axes) to ecliptic J2000: a rotation about x by the obliquity. */
export function eclipticFromEquatorial(v: Vec3In, out: Vec3 = new Float64Array(3)): Vec3 {
  const y = v[1]!;
  const z = v[2]!;
  out[0] = v[0]!;
  out[1] = COS_EPS * y + SIN_EPS * z;
  out[2] = -SIN_EPS * y + COS_EPS * z;
  return out;
}

export function equatorialFromEcliptic(v: Vec3In, out: Vec3 = new Float64Array(3)): Vec3 {
  const y = v[1]!;
  const z = v[2]!;
  out[0] = v[0]!;
  out[1] = COS_EPS * y - SIN_EPS * z;
  out[2] = SIN_EPS * y + COS_EPS * z;
  return out;
}
