// ADR-0003, VN-SCN-001: physical constants and the body table, each with its source. Units are km, s and km^3/s^2.

/** Astronomical unit, km: IAU 2012 Resolution B2 (exact). */
export const AU_KM = 149_597_870.7;
/** Speed of light, km/s: SI definition (exact). */
export const C_KM_S = 299_792.458;
/**
 * Obliquity of the ecliptic of J2000 used by JPL Horizons for REF_PLANE=ECLIPTIC, arcseconds (the IAU 1976 value
 * Horizons states in its output header).
 */
export const OBLIQUITY_J2000_ARCSEC = 84381.448;

export type BodyId = 10 | 199 | 299 | 399 | 301 | 499 | 599 | 699 | 799 | 899;

export interface Body {
  readonly horizonsId: BodyId;
  readonly name: string;
  /** Mean radius, km. */
  readonly radiusKm: number;
  readonly radiusSource: string;
  /** GM, km^3/s^2: the body alone for the Sun, Mercury, Venus, Earth and Moon; the planet system for the others. */
  readonly gmKm3S2: number;
  readonly gmSource: string;
}

const WGCCRE = "IAU WGCCRE 2015 (Archinal et al. 2018), mean radius";
const DE440 = "JPL DE440 (Park et al. 2021)";
const DE440_SYSTEM = "JPL DE440 (Park et al. 2021), planet system";

const body = (
  horizonsId: BodyId,
  name: string,
  radiusKm: number,
  gmKm3S2: number,
  radiusSource = WGCCRE,
  gmSource = DE440,
): Body => ({ horizonsId, name, radiusKm, radiusSource, gmKm3S2, gmSource });

export const BODIES: Readonly<Record<BodyId, Body>> = {
  10: body(10, "Sun", 695_700, 132_712_440_041.279419, "IAU 2015 Resolution B3, nominal solar radius"),
  199: body(199, "Mercury", 2439.4, 22_031.868551),
  299: body(299, "Venus", 6051.8, 324_858.592),
  399: body(399, "Earth", 6371.0084, 398_600.435507),
  301: body(301, "Moon", 1737.4, 4902.800118),
  499: body(499, "Mars", 3389.5, 42_828.375816, WGCCRE, DE440_SYSTEM),
  599: body(599, "Jupiter", 69_911, 126_712_764.1, WGCCRE, DE440_SYSTEM),
  699: body(699, "Saturn", 58_232, 37_940_584.8418, WGCCRE, DE440_SYSTEM),
  799: body(799, "Uranus", 25_362, 5_794_556.4, WGCCRE, DE440_SYSTEM),
  899: body(899, "Neptune", 24_622, 6_836_527.10058, WGCCRE, DE440_SYSTEM),
};
