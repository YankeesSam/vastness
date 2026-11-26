import { AU_KM } from "../constants";

// VN-EPH-006: the planet fallback outside the ephemeris coverage. E. M. Standish and J. G. Williams (1992),
// "Keplerian Elements for Approximate Positions of the Major Planets", Tables 2a and 2b (3000 BC to 3000 AD), as
// published at https://ssd.jpl.nasa.gov/planets/approx_pos.html (retrieved 2026-11-26). Mean ecliptic and equinox of
// J2000, heliocentric. Errors are arcseconds to arcminutes (thousands of km for the inner planets, up to millions for
// the outer); every position from here is shown as approximate. Earth's row is the Earth-Moon barycentre.

export const PLANET_IDS = [199, 299, 399, 499, 599, 699, 799, 899] as const;
export type PlanetId = (typeof PLANET_IDS)[number];

const SECONDS_PER_CENTURY = 36525 * 86400;
/** Validity of Tables 2a/2b, TDB seconds since J2000 (T = -50 to +10 Julian centuries). */
export const KEPLER_APPROX_START = -50 * SECONDS_PER_CENTURY;
export const KEPLER_APPROX_END = 10 * SECONDS_PER_CENTURY;

// a [au, au/Cy], e [-, /Cy], I, L, long. perihelion, long. node [deg, deg/Cy]; then b, c, s, f for M (Table 2b).
// prettier-ignore
const TABLE: Record<PlanetId, readonly number[]> = {
  199: [0.38709843, 0.0, 0.20563661, 0.00002123, 7.00559432, -0.00590158, 252.25166724, 149472.67486623, 77.45771895, 0.15940013, 48.33961819, -0.12214182, 0, 0, 0, 0],
  299: [0.72332102, -0.00000026, 0.00676399, -0.00005107, 3.39777545, 0.00043494, 181.9797085, 58517.8156026, 131.76755713, 0.05679648, 76.67261496, -0.27274174, 0, 0, 0, 0],
  399: [1.00000018, -0.00000003, 0.01673163, -0.00003661, -0.00054346, -0.01337178, 100.46691572, 35999.37306329, 102.93005885, 0.3179526, -5.11260389, -0.24123856, 0, 0, 0, 0],
  499: [1.52371243, 0.00000097, 0.09336511, 0.00009149, 1.85181869, -0.00724757, -4.56813164, 19140.29934243, -23.91744784, 0.45223625, 49.71320984, -0.26852431, 0, 0, 0, 0],
  599: [5.20248019, -0.00002864, 0.0485359, 0.00018026, 1.29861416, -0.00322699, 34.33479152, 3034.90371757, 14.27495244, 0.18199196, 100.29282654, 0.13024619, -0.00012452, 0.0606406, -0.35635438, 38.35125],
  699: [9.54149883, -0.00003065, 0.05550825, -0.00032044, 2.49424102, 0.00451969, 50.07571329, 1222.11494724, 92.86136063, 0.54179478, 113.63998702, -0.25015002, 0.00025899, -0.13434469, 0.87320147, 38.35125],
  799: [19.18797948, -0.00020455, 0.0468574, -0.0000155, 0.77298127, -0.00180155, 314.20276625, 428.49512595, 172.43404441, 0.09266985, 73.96250215, 0.05739699, 0.00058331, -0.97731848, 0.17689245, 7.67025],
  899: [30.06952752, 0.00006447, 0.00895439, 0.00000818, 1.7700552, 0.000224, 304.22289287, 218.46515314, 46.68158724, 0.01009938, 131.78635853, -0.00606302, -0.00041348, 0.68346318, -0.10162547, 7.67025],
};

const DEG = Math.PI / 180;

/** Eccentric anomaly E (rad) from mean anomaly M (rad) and eccentricity e < 1, Newton with a fixed cap. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M + e * Math.sin(M) : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 50; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

function position(row: readonly number[], tdb: number, out: Float64Array, o: number): void {
  const T = tdb / SECONDS_PER_CENTURY;
  const a = (row[0]! + row[1]! * T) * AU_KM;
  const e = row[2]! + row[3]! * T;
  const I = (row[4]! + row[5]! * T) * DEG;
  const L = row[6]! + row[7]! * T;
  const peri = row[8]! + row[9]! * T;
  const node = row[10]! + row[11]! * T;
  const f = row[15]! * T * DEG;
  let M = L - peri + row[12]! * T * T + row[13]! * Math.cos(f) + row[14]! * Math.sin(f);
  M = ((((M + 180) % 360) + 360) % 360) - 180;
  const w = (peri - node) * DEG;
  const W = node * DEG;
  const E = solveKepler(M * DEG, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cW = Math.cos(W);
  const sW = Math.sin(W);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  out[o] = (cw * cW - sw * sW * cI) * xp + (-sw * cW - cw * sW * cI) * yp;
  out[o + 1] = (cw * sW + sw * cW * cI) * xp + (-sw * sW + cw * cW * cI) * yp;
  out[o + 2] = sw * sI * xp + cw * sI * yp;
}

const H = 600; // s, central difference step for the velocity
const scratch = new Float64Array(6);

/**
 * Approximate heliocentric ecliptic J2000 state (km, km/s) of a planet at TDB seconds since J2000 into out[0..5].
 * Returns false (out untouched) outside 3000 BC to 3000 AD. Always approximate: callers flag it (VN-EPH-006).
 */
export function approxPlanetState(id: PlanetId, tdb: number, out: Float64Array): boolean {
  if (!(tdb >= KEPLER_APPROX_START && tdb <= KEPLER_APPROX_END)) return false;
  const row = TABLE[id];
  position(row, tdb - H, scratch, 0);
  position(row, tdb + H, scratch, 3);
  for (let i = 0; i < 3; i++) out[3 + i] = (scratch[3 + i]! - scratch[i]!) / (2 * H);
  position(row, tdb, out, 0);
  return true;
}
