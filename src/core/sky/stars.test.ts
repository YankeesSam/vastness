import { describe, expect, it } from "vitest";
import { eclipticFromEquatorial } from "../frames.ts";
import {
  STAR_STRIDE,
  colourFromBv,
  decodeStars,
  encodeStars,
  starAlpha,
  starSizePx,
  temperatureFromBv,
  unitFromRaDec,
} from "./stars.ts";

const DEG = Math.PI / 180;

describe("stars (VN-SCN-007)", () => {
  it("VN-SCN-007: encode and decode round-trip; a wrong magic, version or size is refused", () => {
    const data = Float32Array.from([1, 0, 0, -1.46, 0, 0, 1, 0, 6.5, NaN]);
    const set = decodeStars(encodeStars(data));
    expect(set.count).toBe(2);
    expect(Array.from(set.data.subarray(0, 9))).toEqual(Array.from(data.subarray(0, 9)));
    expect(set.data[9]).toBeNaN();
    const bad = encodeStars(data);
    new DataView(bad).setUint32(0, 0, true);
    expect(() => decodeStars(bad)).toThrow(/not a star file/);
    const v2 = encodeStars(data);
    new DataView(v2).setUint32(4, 2, true);
    expect(() => decodeStars(v2)).toThrow(/version/);
    expect(() => decodeStars(encodeStars(data).slice(0, 20))).toThrow(/size/);
    expect(() => encodeStars(new Float32Array(STAR_STRIDE + 1))).toThrow();
  });

  it("VN-SCN-007: the north ecliptic pole (RA 18h, Dec +66 33' 38.55\", J2000, Astronomical Almanac) maps to ecliptic +z", () => {
    const e = eclipticFromEquatorial(unitFromRaDec(270, 66 + 33 / 60 + 38.55 / 3600));
    expect(Math.acos(Math.min(1, e[2]!)) / DEG).toBeLessThan(1e-4);
  });

  it("VN-SCN-007: brighter stars are larger and more opaque; dim 0 hides them; sizes stay within 1..6 px", () => {
    expect(starSizePx(-1.46)).toBe(6);
    expect(starSizePx(6.5)).toBe(1);
    expect(starSizePx(2)).toBeGreaterThan(starSizePx(4));
    expect(starAlpha(0)).toBe(1);
    expect(starAlpha(6.5)).toBeCloseTo(0.25, 6);
    expect(starAlpha(4)).toBeGreaterThan(starAlpha(5));
    expect(starAlpha(0, 0)).toBe(0);
    expect(starAlpha(6.5, 0.5)).toBeCloseTo(0.125, 6);
  });

  it("VN-SCN-007: B-V to temperature (Ballesteros 2012): the Sun (B-V 0.65) near 5,800 K; colours redden with B-V", () => {
    expect(temperatureFromBv(0.65)).toBeGreaterThan(5600);
    expect(temperatureFromBv(0.65)).toBeLessThan(6000);
    const blue = new Float32Array(3);
    const red = new Float32Array(3);
    colourFromBv(-0.2, blue);
    colourFromBv(1.6, red);
    expect(blue[2]! / blue[0]!).toBeGreaterThan(1);
    expect(red[2]! / red[0]!).toBeLessThan(0.7);
    const unknown = new Float32Array(3);
    colourFromBv(NaN, unknown);
    expect(Array.from(unknown)).toEqual([1, 1, 1]);
  });
});
