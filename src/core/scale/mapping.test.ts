import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODIES, type BodyId } from "../constants";
import { createEphemeris, type EphemerisManifest } from "../ephem/ephemeris";
import { sceneFromEcliptic } from "../frames";
import { PLANET_COVERAGE } from "../time/clock";
import {
  amountFor,
  CLASS_FACTOR,
  FRAMED_RADII,
  keepFramed,
  MOON_CLEARANCE,
  mapBodies,
  mapSmall,
  pushWeight,
  scaleTable,
  stepAmount,
} from "./mapping";

const IDS: BodyId[] = [10, 199, 299, 399, 301, 499, 599, 699, 799, 899];
const at = (id: BodyId) => IDS.indexOf(id);

/** Seeded so a failure repeats (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (p: Float64Array, i: number, j: number) =>
  Math.hypot(p[3 * i]! - p[3 * j]!, p[3 * i + 1]! - p[3 * j + 1]!, p[3 * i + 2]! - p[3 * j + 2]!);

describe("scale mapping", () => {
  const table = scaleTable(IDS);
  const n = IDS.length;

  it("VN-SCL-001: true scale draws true positions and true mean radii", () => {
    const pos = Float64Array.from({ length: 3 * n }, (_, i) => (i + 1) * 1.234e6);
    const ok = new Uint8Array(n).fill(1);
    const out = new Float64Array(3 * n);
    const r = new Float64Array(n);
    mapBodies(table, 0, pos, ok, out, r);
    expect([...out]).toEqual([...pos]);
    expect([...r]).toEqual(IDS.map((id) => BODIES[id].radiusKm));
  });

  it("VN-SCL-002: exaggerated radii use the class factors; the Moon is stretched from Earth to clear it", () => {
    const pos = new Float64Array(3 * n);
    pos[3 * at(399)] = 1.5e8;
    pos[3 * at(301)] = 1.5e8 + 356_000; // the Moon at its closest
    const ok = new Uint8Array(n).fill(1);
    const out = new Float64Array(3 * n);
    const r = new Float64Array(n);
    mapBodies(table, 1, pos, ok, out, r);
    expect(r[at(10)]).toBeCloseTo(BODIES[10].radiusKm * CLASS_FACTOR.star, 6);
    expect(r[at(399)]).toBeCloseTo(BODIES[399].radiusKm * CLASS_FACTOR.terrestrial, 6);
    expect(r[at(599)]).toBeCloseTo(BODIES[599].radiusKm * CLASS_FACTOR.giant, 6);
    expect(r[at(301)]).toBeCloseTo(BODIES[301].radiusKm * CLASS_FACTOR.moon, 6);
    // Earth stays put; the Moon sits on the same line, MOON_CLEARANCE times the two enlarged radii away.
    expect(out[3 * at(399)]).toBe(1.5e8);
    expect(dist(out, at(301), at(399)) / (r[at(301)]! + r[at(399)]!)).toBeCloseTo(MOON_CLEARANCE, 9);
    expect([out[3 * at(301) + 1], out[3 * at(301) + 2]]).toEqual([0, 0]);
    // Half way is the geometric mean (an even change on a logarithmic view).
    mapBodies(table, 0.5, pos, ok, out, r);
    expect(r[at(399)]).toBeCloseTo(BODIES[399].radiusKm * Math.sqrt(CLASS_FACTOR.terrestrial), 6);
  });

  it("VN-SCL-002: no two bodies overlap in exaggerated scale at 400 seeded times in the planets' coverage", async () => {
    const dir = new URL("../../../public/ephem/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
    const eph = createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));
    const rand = rng(20261127);
    const span = PLANET_COVERAGE.end - PLANET_COVERAGE.start;
    const pos = new Float64Array(3 * n);
    const ok = new Uint8Array(n).fill(1);
    const out = new Float64Array(3 * n);
    const r = new Float64Array(n);
    const st = new Float64Array(6);
    const sc = new Float64Array(3);
    let worst = Infinity;
    for (let s = 0; s < 400; s++) {
      const t = PLANET_COVERAGE.start + rand() * span;
      await eph.load(t, IDS);
      for (let i = 0; i < n; i++) {
        expect(eph.state(IDS[i]!, t, st)).toBe("ok");
        sceneFromEcliptic(st, sc);
        pos.set(sc, 3 * i);
      }
      mapBodies(table, 1, pos, ok, out, r);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) worst = Math.min(worst, dist(out, i, j) / (r[i]! + r[j]!));
    }
    // Clear by a margin, so the times between samples are clear too (Mercury at perihelion is the tightest pair).
    expect(worst).toBeGreaterThan(1.2);
  }, 60_000);

  it("VN-SCL-002: a small object near an enlarged body keeps its altitude above the drawn surface", () => {
    const pos = new Float64Array(3 * (n + 1));
    pos[3 * at(399)] = 1.5e8;
    pos[3 * at(301)] = 1.5e8 + 384_400;
    const ok = new Uint8Array(n).fill(1);
    const drawn = new Float64Array(3 * (n + 1));
    const r = new Float64Array(n);
    mapBodies(table, 1, pos, ok, drawn, r);
    const o = 3 * n;
    const out = new Float64Array(3 * (n + 1));
    // 400 km above Earth
    pos[o] = 1.5e8;
    pos[o + 1] = BODIES[399].radiusKm + 400;
    mapSmall(table, pos, ok, drawn, r, o, out);
    expect(out[o]).toBeCloseTo(1.5e8, 6);
    expect(out[o + 1]! - r[at(399)]!).toBeCloseTo(400, 3);
    // 100 km above the Moon: carried with the stretched Moon
    pos[o] = 1.5e8 + 384_400;
    pos[o + 1] = 0;
    pos[o + 2] = BODIES[301].radiusKm + 100;
    mapSmall(table, pos, ok, drawn, r, o, out);
    expect(out[o]).toBeCloseTo(drawn[3 * at(301)]!, 3);
    expect(out[o + 2]! - r[at(301)]!).toBeCloseTo(100, 3);
    // Far from every body: unchanged
    pos[o] = 5e8;
    pos[o + 1] = 3e8;
    pos[o + 2] = 0;
    mapSmall(table, pos, ok, drawn, r, o, out);
    expect([out[o], out[o + 1], out[o + 2]]).toEqual([5e8, 3e8, 0]);
    // True scale: unchanged anywhere
    mapBodies(table, 0, pos, ok, drawn, r);
    pos[o] = 1.5e8;
    pos[o + 1] = BODIES[399].radiusKm + 400;
    mapSmall(table, pos, ok, drawn, r, o, out);
    expect([out[o], out[o + 1], out[o + 2]]).toEqual([1.5e8, BODIES[399].radiusKm + 400, 0]);
  });

  it("VN-SCL-002: the push is continuous and keeps order along a ray from the body", () => {
    expect(pushWeight(10, 10, 5)).toBe(1);
    expect(pushWeight(20, 10, 5)).toBe(0);
    const grow = 6.36e6;
    const R1 = 6.37e6;
    let prev = -Infinity;
    for (let d = 0; d < 3 * R1; d += 1e4) {
      const f = d + grow * pushWeight(d, R1, grow);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it("VN-SCL-003: a switch takes 1 s, and is instant with reduced motion", () => {
    expect(amountFor("true")).toBe(0);
    expect(amountFor("exaggerated")).toBe(1);
    let a = 0;
    for (let i = 0; i < 30; i++) a = stepAmount(a, 1, 1 / 60, false);
    expect(a).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 40; i++) a = stepAmount(a, 1, 1 / 60, false);
    expect(a).toBe(1);
    expect(stepAmount(1, 0, 0.25, false)).toBe(0.75);
    expect(stepAmount(1, 0, 0.001, true)).toBe(0);
  });

  it("VN-SCL-003: close in, the followed body keeps its apparent size; a far view keeps its distance", () => {
    expect(keepFramed(3 * 6371, 6371, 6371e3)).toBeCloseTo(3 * 6371e3, 3);
    expect(keepFramed(3 * 6371e3, 6371e3, 6371)).toBeCloseTo(3 * 6371, 6);
    const far = 30 * 1.496e8;
    expect(keepFramed(far, 695_700, 695_700 * 40)).toBe(far);
    expect(far).toBeGreaterThan(FRAMED_RADII * 695_700 * 40);
  });
});
