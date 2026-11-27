import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODIES } from "./constants";
import { createEphemeris, type EphemerisManifest } from "./ephem/ephemeris";
import { saturnPole, RINGS_INNER_KM, RINGS_OUTER_KM } from "./rings";
import { bodyToEcliptic } from "./rotation";
import { discCovered, eclipsePossible, ringTransmission, sunVisible } from "./shadow";
import { parseUtc } from "./time/scales";

const SUN_R = BODIES[10].radiusKm;
const dir = new URL("../../public/ephem/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
const eph = createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));

async function pos(id: number, t: number): Promise<Float64Array> {
  await eph.load(t, [id]);
  const s = new Float64Array(6);
  expect(eph.state(id, t, s)).toBe("ok");
  return s.subarray(0, 3);
}

describe("disc overlap", () => {
  it("VN-SCN-010: apart, inside, annular and half-covered discs", () => {
    expect(discCovered(1, 1, 2.5)).toBe(0);
    expect(discCovered(1, 2, 0.5)).toBe(1); // umbra: the occluder covers the whole Sun
    expect(discCovered(1, 0.5, 0.2)).toBeCloseTo(0.25, 12); // annular: (0.5/1)^2
    // Equal discs offset by one radius: lens area (2 pi/3 - sqrt(3)/2) r^2 over pi r^2
    expect(discCovered(1, 1, 1)).toBeCloseTo((2 * Math.PI) / 3 / Math.PI - Math.sqrt(3) / 2 / Math.PI, 12);
    // continuous and monotonic through the penumbra
    let prev = 1;
    for (let d = 0; d <= 3; d += 0.01) {
      const c = discCovered(1, 1.3, d);
      expect(c).toBeLessThanOrEqual(prev + 1e-12);
      prev = c;
    }
  });
});

describe("eclipses (VN-SCN-010)", () => {
  it("VN-SCN-010: the Moon's centre is in Earth's umbra at the 2025-03-14 total lunar eclipse (06:58:43 UTC), and lit a day later", async () => {
    const t = parseUtc("2025-03-14T06:58:43Z");
    const f = sunVisible(await pos(301, t), [0, 0, 0], SUN_R, await pos(399, t), BODIES[399].radiusKm);
    expect(f).toBe(0);
    const t2 = t + 86400;
    expect(sunVisible(await pos(301, t2), [0, 0, 0], SUN_R, await pos(399, t2), BODIES[399].radiusKm)).toBe(1);
  });

  it("VN-SCN-010: the 2024-04-08 greatest eclipse point (18:17:16 UTC, 25.29 N 104.14 W) is in the Moon's umbra; 1000 km off the track is penumbral", async () => {
    const t = parseUtc("2024-04-08T18:17:16Z");
    const earth = await pos(399, t);
    const moon = await pos(301, t);
    const m = new Float64Array(9);
    bodyToEcliptic(399, t, m);
    const site = (latDeg: number, lonDeg: number) => {
      const la = (latDeg * Math.PI) / 180;
      const lo = (lonDeg * Math.PI) / 180;
      const b = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
      const r = BODIES[399].radiusKm;
      return [0, 1, 2].map((k) => earth[k]! + r * (m[3 * k]! * b[0]! + m[3 * k + 1]! * b[1]! + m[3 * k + 2]! * b[2]!));
    };
    expect(sunVisible(site(25.29, -104.14), [0, 0, 0], SUN_R, moon, BODIES[301].radiusKm)).toBe(0);
    const off = sunVisible(site(34.29, -104.14), [0, 0, 0], SUN_R, moon, BODIES[301].radiusKm);
    expect(off).toBeGreaterThan(0.05);
    expect(off).toBeLessThan(0.6);
    // The far side of the Earth sees no eclipse.
    expect(sunVisible(site(-25.29, 75.86), [0, 0, 0], SUN_R, moon, BODIES[301].radiusKm)).toBe(1);
  });

  it("VN-SCN-010: at the 2017-05-24 northern solstice of Saturn, rings behind Saturn are in its shadow, rings beside it are lit", async () => {
    const t = parseUtc("2017-05-24T00:00:00Z");
    const sat = await pos(699, t);
    const r = BODIES[699].radiusKm;
    const away = Math.hypot(sat[0]!, sat[1]!, sat[2]!);
    const anti = [0, 1, 2].map((k) => sat[k]! / away);
    const pole = saturnPole(t);
    // A ring point straight behind Saturn: anti-Sun direction projected into the ring plane, at 100,000 km.
    const dot = anti[0]! * pole[0]! + anti[1]! * pole[1]! + anti[2]! * pole[2]!;
    const inPlane = [0, 1, 2].map((k) => anti[k]! - dot * pole[k]!);
    const n = Math.hypot(...inPlane);
    const behind = [0, 1, 2].map((k) => sat[k]! + (1e5 * inPlane[k]!) / n);
    // Sun 26.7 degrees above the rings: the shadow reaches about 1.1 R / tan(26.7) beyond Saturn's limb on the rings.
    expect(sunVisible(behind, [0, 0, 0], SUN_R, sat, r)).toBe(0);
    const side = [
      pole[1]! * inPlane[2]! - pole[2]! * inPlane[1]!,
      pole[2]! * inPlane[0]! - pole[0]! * inPlane[2]!,
      pole[0]! * inPlane[1]! - pole[1]! * inPlane[0]!,
    ];
    const beside = [0, 1, 2].map((k) => sat[k]! + (1e5 * side[k]!) / n);
    expect(sunVisible(beside, [0, 0, 0], SUN_R, sat, r)).toBe(1);
  });

  it("VN-SCN-010: the rings shade Saturn: light through the B ring is cut to exp(-tau/mu); through the Cassini division far less", () => {
    // Saturn at the origin, rings in the z = 0 plane, Sun 26.7 degrees above them along +x.
    const e = (26.7 * Math.PI) / 180;
    const sunDir = [Math.cos(e), 0, Math.sin(e)];
    const sun = sunDir.map((c) => c * 1e15); // far enough that every ray to it is parallel
    const through = (rRing: number) => {
      // The point on Saturn's southern side whose ray to the Sun crosses the ring plane at rRing (beyond the limb is fine
      // for the test: the function only needs the ray).
      const t = rRing / Math.cos(e);
      return [rRing - t * sunDir[0]!, 0, -t * sunDir[2]!];
    };
    const mu = Math.sin(e);
    expect(ringTransmission(through(100_000), sun, [0, 0, 0], [0, 0, 1], 1)).toBeCloseTo(Math.exp(-1.45 / mu), 6);
    expect(ringTransmission(through(120_000), sun, [0, 0, 0], [0, 0, 1], 1)).toBeCloseTo(Math.exp(-0.05 / mu), 6);
    expect(ringTransmission(through(RINGS_OUTER_KM + 1000), sun, [0, 0, 0], [0, 0, 1], 1)).toBe(1);
    expect(ringTransmission(through(RINGS_INNER_KM - 1000), sun, [0, 0, 0], [0, 0, 1], 1)).toBe(1);
    // Points on the lit side (between the rings and the Sun) are not shaded.
    expect(ringTransmission([0, 0, 60_000], sun, [0, 0, 0], [0, 0, 1], 1)).toBe(1);
    // Enlarged Saturn (exaggerated scale) scales the rings with it.
    expect(ringTransmission(through(300_000), sun, [0, 0, 0], [0, 0, 1], 3)).toBeCloseTo(Math.exp(-1.45 / mu), 6);
  });

  it("VN-SCN-010, VN-PRF-002: shadows are computed only when an eclipse is possible (two eclipse seasons a year)", async () => {
    const R = (id: 399 | 301) => BODIES[id].radiusKm;
    const at = async (iso: string) => {
      const t = parseUtc(iso);
      return { e: await pos(399, t), m: await pos(301, t) };
    };
    const lunar = await at("2025-03-14T06:58:43Z");
    expect(eclipsePossible(lunar.m, R(301), [0, 0, 0], SUN_R, lunar.e, R(399))).toBe(true);
    expect(eclipsePossible(lunar.e, R(399), [0, 0, 0], SUN_R, lunar.m, R(301))).toBe(false);
    const solar = await at("2024-04-08T18:17:16Z");
    expect(eclipsePossible(solar.e, R(399), [0, 0, 0], SUN_R, solar.m, R(301))).toBe(true);
    // One day after each, neither.
    const after = await at("2024-04-09T18:17:16Z");
    expect(eclipsePossible(after.e, R(399), [0, 0, 0], SUN_R, after.m, R(301))).toBe(false);
    const after2 = await at("2025-03-15T06:58:43Z");
    expect(eclipsePossible(after2.m, R(301), [0, 0, 0], SUN_R, after2.e, R(399))).toBe(false);
    // Never false where some point of the body is shadowed: sample the Earth's surface through the 2024 eclipse day.
    for (let h = -6; h <= 6; h += 0.25) {
      const t = parseUtc("2024-04-08T18:17:16Z") + h * 3600;
      const e = await pos(399, t);
      const m = await pos(301, t);
      let shaded = false;
      for (let k = 0; k < 400 && !shaded; k++) {
        const z = 1 - (2 * (k + 0.5)) / 400;
        const a = k * 2.399963;
        const p = [
          e[0]! + R(399) * Math.sqrt(1 - z * z) * Math.cos(a),
          e[1]! + R(399) * Math.sqrt(1 - z * z) * Math.sin(a),
          e[2]! + R(399) * z,
        ];
        shaded = sunVisible(p, [0, 0, 0], SUN_R, m, R(301)) < 1;
      }
      if (shaded) expect(eclipsePossible(e, R(399), [0, 0, 0], SUN_R, m, R(301))).toBe(true);
    }
  });
});
