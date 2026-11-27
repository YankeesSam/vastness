// VN-SCN-007: the background stars. public/stars.bin holds the Yale Bright Star Catalogue (5th revised edition,
// Hoffleit and Warren 1991, via NASA HEASARC) to visual magnitude 6.5 as unit directions in the ecliptic J2000
// frame (the frame of every position, ADR-0003), built by tools/stars/build.ts. Stars sit at infinity: the scene
// draws them at a fixed direction from the camera. Pure: no three.js or DOM.

/** "VSTR" little-endian. */
export const STARS_MAGIC = 0x52545356;
export const STARS_VERSION = 1;
export const STARS_HEADER_BYTES = 12;
/** Floats per star: x, y, z (ecliptic unit vector), V magnitude, B-V colour index (NaN when unknown). */
export const STAR_STRIDE = 5;
/** VN-SCN-007: the faintest magnitude kept. */
export const STAR_MAG_LIMIT = 6.5;

export interface StarSet {
  count: number;
  /** STAR_STRIDE floats per star, brightest first. */
  data: Float32Array;
}

export function encodeStars(stars: Float32Array): ArrayBuffer {
  const count = stars.length / STAR_STRIDE;
  if (!Number.isInteger(count)) throw new Error("stars: data length is not a multiple of the stride");
  const buf = new ArrayBuffer(STARS_HEADER_BYTES + stars.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, STARS_MAGIC, true);
  dv.setUint32(4, STARS_VERSION, true);
  dv.setUint32(8, count, true);
  const out = new Float32Array(buf, STARS_HEADER_BYTES);
  out.set(stars);
  if (!littleEndian()) {
    for (let i = 0; i < stars.length; i++) dv.setFloat32(STARS_HEADER_BYTES + 4 * i, stars[i]!, true);
  }
  return buf;
}

export function decodeStars(buf: ArrayBuffer): StarSet {
  if (buf.byteLength < STARS_HEADER_BYTES) throw new Error("stars: file too short");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== STARS_MAGIC) throw new Error("stars: not a star file");
  const version = dv.getUint32(4, true);
  if (version !== STARS_VERSION) throw new Error(`stars: version ${version}, expected ${STARS_VERSION}`);
  const count = dv.getUint32(8, true);
  if (buf.byteLength !== STARS_HEADER_BYTES + 4 * STAR_STRIDE * count) throw new Error("stars: size does not match");
  const data = new Float32Array(STAR_STRIDE * count);
  for (let i = 0; i < data.length; i++) data[i] = dv.getFloat32(STARS_HEADER_BYTES + 4 * i, true);
  return { count, data };
}

function littleEndian(): boolean {
  return new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
}

/** Equatorial J2000 unit vector from right ascension and declination, degrees. */
export function unitFromRaDec(raDeg: number, decDeg: number, out: Float64Array = new Float64Array(3)): Float64Array {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  out[0] = Math.cos(dec) * Math.cos(ra);
  out[1] = Math.cos(dec) * Math.sin(ra);
  out[2] = Math.sin(dec);
  return out;
}

/**
 * Relative brightness of a star against a magnitude-0 star (Pogson: 10^(-0.4 m)), times `dim` (0 off .. 1 full,
 * VN-SCN-007 dimmable).
 */
export function starFlux(mag: number, dim = 1): number {
  return dim * Math.pow(10, -0.4 * mag);
}

/** Point diameter in pixels: brighter stars larger, from 1 px at the limit to about 6 px for Sirius (m -1.46). */
export function starSizePx(mag: number): number {
  return Math.min(6, Math.max(1, 1 + 0.75 * (STAR_MAG_LIMIT - mag)));
}

/**
 * Opacity of a star point: the flux mapped onto a perceptual (square-root) ramp so a magnitude-6.5 star is faint
 * but visible and the brightest saturate, times `dim`.
 */
export function starAlpha(mag: number, dim = 1): number {
  const ref = Math.pow(10, -0.4 * STAR_MAG_LIMIT);
  const a = 0.25 * Math.sqrt(starFlux(mag) / ref);
  return Math.min(1, a) * Math.min(1, Math.max(0, dim));
}

/** Effective temperature from B-V, kelvin (Ballesteros 2012, EPL 97 34008, eq. 14). */
export function temperatureFromBv(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

// Blackbody colours, sRGB (Mitchell Charity, "What color is a blackbody?", 2 degree CIE 1931, D65 white point).
const BLACKBODY: readonly (readonly [number, number, number, number])[] = [
  [2500, 1.0, 0.624, 0.329],
  [3000, 1.0, 0.706, 0.42],
  [3500, 1.0, 0.765, 0.537],
  [4000, 1.0, 0.82, 0.639],
  [5000, 1.0, 0.894, 0.808],
  [6000, 1.0, 0.953, 0.937],
  [6500, 1.0, 0.976, 0.992],
  [7000, 0.961, 0.953, 1.0],
  [8000, 0.89, 0.91, 1.0],
  [10000, 0.812, 0.855, 1.0],
  [15000, 0.718, 0.784, 1.0],
  [30000, 0.639, 0.725, 1.0],
];

/** Star colour (sRGB 0..1) from B-V; NaN (unknown) gives white. Writes into `out`. */
export function colourFromBv(bv: number, out: Float32Array | Float64Array, offset = 0): void {
  if (!Number.isFinite(bv)) {
    out[offset] = out[offset + 1] = out[offset + 2] = 1;
    return;
  }
  const t = temperatureFromBv(bv);
  let i = 0;
  while (i < BLACKBODY.length - 2 && BLACKBODY[i + 1]![0] < t) i++;
  const a = BLACKBODY[i]!;
  const b = BLACKBODY[i + 1]!;
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  out[offset] = a[1] + f * (b[1] - a[1]);
  out[offset + 1] = a[2] + f * (b[2] - a[2]);
  out[offset + 2] = a[3] + f * (b[3] - a[3]);
}
