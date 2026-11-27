// VN-SCN-006: Saturn's rings, drawn from published ring structure rather than an image. Radii, normal optical
// depths and albedos are the NASA NSSDCA Saturnian Rings Fact Sheet (D. R. Williams, updated 2022-04-19,
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html); where it gives a range we take its midpoint.
// The rings lie in Saturn's equator plane, whose pole is the IAU WGCCRE 2015 model (Archinal et al. 2018).
// Rings narrower than 1,000 km (the F ring, ringlets and gaps the fact sheet lists by one radius) are left out; the
// D ring (optical depth 1e-5) is invisible and left out too. Pure: no three.js or DOM.

import { eclipticFromEquatorial } from "./frames.ts";

export interface Ring {
  name: string;
  innerKm: number;
  outerKm: number;
  /** Normal optical depth (fact sheet range midpoint). */
  tau: number;
  /** Albedo (fact sheet range midpoint). */
  albedo: number;
}

export const SATURN_RINGS: readonly Ring[] = [
  { name: "C", innerKm: 74_658, outerKm: 91_975, tau: 0.2, albedo: 0.21 },
  { name: "B", innerKm: 91_975, outerKm: 117_507, tau: 1.45, albedo: 0.5 },
  { name: "Cassini division", innerKm: 117_507, outerKm: 122_340, tau: 0.05, albedo: 0.3 },
  { name: "A", innerKm: 122_340, outerKm: 136_780, tau: 0.7, albedo: 0.5 },
];

export const RINGS_INNER_KM = SATURN_RINGS[0]!.innerKm;
export const RINGS_OUTER_KM = SATURN_RINGS[SATURN_RINGS.length - 1]!.outerKm;

/** The ring at radius `rKm`, or null in a gap or outside the rings. */
export function ringAt(rKm: number): Ring | null {
  for (const r of SATURN_RINGS) if (rKm >= r.innerKm && rKm < r.outerKm) return r;
  return null;
}

/**
 * Opacity of the rings at radius `rKm` seen at `mu` (the cosine of the angle between the line of sight and the ring
 * normal; 1 face-on): 1 - exp(-tau / mu), so rings thicken towards edge-on.
 */
export function ringOpacity(rKm: number, mu = 1): number {
  const r = ringAt(rKm);
  if (!r) return 0;
  return 1 - Math.exp(-r.tau / Math.max(1e-3, Math.abs(mu)));
}

const DEG = Math.PI / 180;
const SECONDS_PER_CENTURY = 36525 * 86400;

/**
 * Saturn's north pole as a unit vector in ecliptic J2000 at TDB seconds since J2000: IAU WGCCRE 2015,
 * right ascension 40.589 - 0.036 T, declination 83.537 - 0.004 T degrees (T in Julian centuries).
 */
export function saturnPole(tdb: number, out: Float64Array = new Float64Array(3)): Float64Array {
  const T = tdb / SECONDS_PER_CENTURY;
  const ra = (40.589 - 0.036 * T) * DEG;
  const dec = (83.537 - 0.004 * T) * DEG;
  const eq = new Float64Array([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]);
  return eclipticFromEquatorial(eq, out);
}
