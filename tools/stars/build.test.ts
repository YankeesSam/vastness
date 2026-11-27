import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAR_MAG_LIMIT, STAR_STRIDE, decodeStars } from "../../src/core/sky/stars.ts";
import { buildStars, parseTdat, selectStars } from "./build.ts";

const DEG = Math.PI / 180;
const sample = readFileSync(new URL("../../testdata/stars/bsc5p-sample.tdat", import.meta.url), "latin1");

/** Ecliptic longitude and latitude, degrees, of a stored unit vector. */
function lonLat(d: Float32Array, i: number): [number, number] {
  const [x, y, z] = [d[STAR_STRIDE * i]!, d[STAR_STRIDE * i + 1]!, d[STAR_STRIDE * i + 2]!];
  return [(((Math.atan2(y, x) / DEG) % 360) + 360) % 360, Math.asin(z) / DEG];
}

describe("tools/stars (T-064, VN-SCN-007)", () => {
  it("VN-SCN-007: parses the HEASARC dump by its field list", () => {
    const stars = parseTdat(sample);
    expect(stars).toHaveLength(6);
    const sirius = stars.find((s) => s.hr === 2491)!;
    expect(sirius.vmag).toBe(-1.46);
    expect(sirius.raDeg).toBeCloseTo(101.2875, 3);
    expect(sirius.decDeg).toBeCloseTo(-16.7161, 4);
    expect(sirius.bv).toBe(0);
  });

  it("VN-SCN-007: keeps V <= 6.5, brightest first", () => {
    const kept = selectStars(parseTdat(sample));
    expect(kept.map((s) => s.hr)).toEqual([2491, 2326, 7001, 424, 7228]); // HR 8294 (V 6.57) is dropped
    expect(kept.every((s) => s.vmag <= STAR_MAG_LIMIT)).toBe(true);
  });

  it("VN-SCN-007: Sirius lands at ecliptic J2000 longitude 104.08, latitude -39.61 (SIMBAD) within 0.02 degrees", () => {
    const { buffer } = buildStars(sample);
    const set = decodeStars(buffer);
    expect(set.count).toBe(5);
    const [lon, lat] = lonLat(set.data, 0);
    expect(Math.abs(lon - 104.0814)).toBeLessThan(0.02);
    expect(Math.abs(lat - -39.6052)).toBeLessThan(0.02);
    // Polaris: ecliptic latitude +66.10 (SIMBAD)
    expect(Math.abs(lonLat(set.data, 3)[1] - 66.1)).toBeLessThan(0.02);
  });

  it("VN-SCN-007: the committed public/stars.bin holds the catalogue to 6.5, brightest first", () => {
    const buf = readFileSync(new URL("../../public/stars.bin", import.meta.url));
    const set = decodeStars(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(set.count).toBeGreaterThan(8000);
    expect(set.count).toBeLessThan(9110);
    expect(set.data[3]).toBe(Math.fround(-1.46)); // Sirius first
    for (let i = 1; i < set.count; i++) {
      expect(set.data[STAR_STRIDE * i + 3]!).toBeGreaterThanOrEqual(set.data[STAR_STRIDE * (i - 1) + 3]!);
      expect(set.data[STAR_STRIDE * i + 3]!).toBeLessThanOrEqual(STAR_MAG_LIMIT);
    }
  });
});
