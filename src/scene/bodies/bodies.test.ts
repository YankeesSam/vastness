import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODIES } from "../../core/constants";
import { createEphemeris, type Ephemeris, type EphemerisManifest } from "../../core/ephem/ephemeris";
import { parseUtc } from "../../core/time/scales";
import { DRAWN_BODIES, worldPositions } from "./positions";

const dir = new URL("../../../public/ephem/", import.meta.url);

function realEphemeris(): Ephemeris {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
  return createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));
}

describe("bodies", () => {
  it("VN-SCN-001: the Sun, the eight planets and the Moon, with true mean radii from the constants table", () => {
    expect(DRAWN_BODIES.map((b) => b.name)).toEqual([
      "Sun",
      "Mercury",
      "Venus",
      "Earth",
      "Moon",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]);
    for (const b of DRAWN_BODIES) expect(b.radiusKm).toBe(BODIES[b.horizonsId].radiusKm);
  });

  it("VN-SCN-001: world positions are the ephemeris states mapped to the scene frame (ecliptic z up to y up)", () => {
    const states: Record<number, number[]> = { 10: [0, 0, 0], 399: [1e8, 2e7, 3e3] };
    const eph = {
      state(id: number, _t: number, out: Float64Array, o = 0) {
        const s = states[id];
        if (!s) return "loading";
        out[o] = s[0]!;
        out[o + 1] = s[1]!;
        out[o + 2] = s[2]!;
        return "ok";
      },
    } as unknown as Ephemeris;
    const out = new Float64Array(3 * DRAWN_BODIES.length);
    const ok = new Uint8Array(DRAWN_BODIES.length);
    expect(worldPositions(eph, 0, out, ok)).toBe(2);
    const e = DRAWN_BODIES.findIndex((b) => b.horizonsId === 399);
    expect([...out.subarray(3 * e, 3 * e + 3)]).toEqual([1e8, 3e3, -2e7]);
    expect(ok[e]).toBe(1);
    expect(ok[DRAWN_BODIES.findIndex((b) => b.horizonsId === 499)]).toBe(0);
  });

  it("VN-SCN-001: every drawn body has a position from public/ephem at 2026-01-01", async () => {
    const eph = realEphemeris();
    const t = parseUtc("2026-01-01T00:00:00Z");
    await eph.load(t);
    const out = new Float64Array(3 * DRAWN_BODIES.length);
    const ok = new Uint8Array(DRAWN_BODIES.length);
    expect(worldPositions(eph, t, out, ok)).toBe(DRAWN_BODIES.length);
    // Earth about 1 AU from the Sun, the Moon about 384 000 km from Earth (sanity, not accuracy: ephem:check does that).
    const at = (id: number) => 3 * DRAWN_BODIES.findIndex((b) => b.horizonsId === id);
    const d = (i: number, j: number) =>
      Math.hypot(out[i]! - out[j]!, out[i + 1]! - out[j + 1]!, out[i + 2]! - out[j + 2]!);
    expect(d(at(399), at(10)) / 1.496e8).toBeCloseTo(0.98, 1);
    expect(d(at(301), at(399))).toBeGreaterThan(356_000);
    expect(d(at(301), at(399))).toBeLessThan(407_000);
  });
});
