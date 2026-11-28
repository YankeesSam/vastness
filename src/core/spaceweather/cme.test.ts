import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AU_KM } from "../constants";
import { bodyToEcliptic } from "../rotation";
import {
  angleBetween,
  cmeTimes,
  frontKm,
  heeqDirection,
  inFlight,
  MAX_REACH_AU,
  shellOpacity,
  speedClass,
  SUN_RADIUS_KM,
  tdbFromIso,
  UNKNOWN_MASS_OPACITY,
} from "./cme";

const RAD = Math.PI / 180;

describe("CME storms (T-101)", () => {
  // DONKI's analysis of the first Gannon storm CME (testdata/donki/cme-2024-05-08.json): 870 km/s, 21.5 Rs at 09:30.
  const gannon = cmeTimes({ start: "2024-05-08T05:36Z", t21: "2024-05-08T09:30Z" });

  it("VN-EXT-005: the front rises from the occulter, passes 21.5 Rs at its DONKI time, then moves at its speed", () => {
    expect(frontKm(gannon, 870, gannon.start - 60)).toBeNull();
    expect(frontKm(gannon, 870, gannon.start)! / SUN_RADIUS_KM).toBeCloseTo(2.5, 6);
    expect(frontKm(gannon, 870, gannon.t21)! / SUN_RADIUS_KM).toBeCloseTo(21.5, 6);
    expect(frontKm(gannon, 870, gannon.t21 + 1000)! - frontKm(gannon, 870, gannon.t21)!).toBeCloseTo(870_000, 3);
    expect(frontKm(gannon, 870, gannon.t21 + 40 * 86400)).toBeNull();
  });

  it("VN-EXT-005: at constant speed it reaches 1 AU within a day of the shock DONKI measured at Earth", () => {
    // DONKI IPS 2024-05-10T16:36:00-IPS-001 (Earth), linked to this CME (testdata/donki/ips-2024-05-08.json).
    const shock = tdbFromIso("2024-05-10T16:36Z");
    const r = frontKm(gannon, 870, shock)!;
    expect(Math.abs(r - AU_KM) / 870 / 3600).toBeLessThan(24);
  });

  it("VN-EXT-005: the HEEQ axes: 0,0 toward Earth, west the way Earth moves, latitude 90 the pole", () => {
    const pole = [0, 0, 1];
    const earth = [AU_KM, 0, 0]; // Earth on +x moving toward +y (prograde about +z)
    const out = new Float64Array(3);
    heeqDirection(0, 0, pole, earth, out);
    expect([...out].map((v) => +v.toFixed(12))).toEqual([1, 0, 0]);
    heeqDirection(0, 90, pole, earth, out);
    expect([...out].map((v) => +v.toFixed(12))).toEqual([0, 1, 0]);
    heeqDirection(90, 0, pole, earth, out);
    expect([...out].map((v) => +v.toFixed(12))).toEqual([0, 0, 1]);
    // Earth slightly above the solar equator: x is its projection, so a 0,0 CME misses Earth by that latitude (B0).
    heeqDirection(0, 0, pole, [Math.cos(7 * RAD), 0, Math.sin(7 * RAD)], out);
    expect(angleBetween(out, [Math.cos(7 * RAD), 0, Math.sin(7 * RAD)])).toBeCloseTo(7, 9);
  });

  it("VN-EXT-005: the Gannon storm's first CME (lat -7, lon 9, half-angle 43) points at Earth, with the IAU solar pole", () => {
    // Earth's heliocentric ecliptic longitude on 2024-05-08 is the Sun's geocentric longitude (~47.9 deg, Astronomical
    // Almanac 2024) plus 180.
    const t = tdbFromIso("2024-05-08T09:30Z");
    const m = new Float64Array(9);
    bodyToEcliptic(10, t, m);
    const pole = [m[2]!, m[5]!, m[8]!];
    const L = (47.9 + 180) * RAD;
    const earth = [Math.cos(L), Math.sin(L), 0];
    const out = new Float64Array(3);
    expect(heeqDirection(-7, 9, pole, earth, out)).toBe(true);
    const off = angleBetween(out, earth);
    expect(off).toBeGreaterThan(5);
    expect(off).toBeLessThan(43);
  });

  it("VN-EXT-005: colour classes follow DONKI's speed types", () => {
    expect(speedClass(870, "C").type).toBe("C");
    expect(speedClass(1820).type).toBe("O");
    expect(speedClass(3100).type).toBe("ER");
    expect(speedClass(300, "nonsense").type).toBe("S");
  });

  it("VN-EXT-005: opacity grows with mass, falls as the shell spreads, and has a default when mass is unknown", () => {
    const r = 0.05 * AU_KM;
    expect(shellOpacity(1e16, r)).toBeGreaterThan(shellOpacity(1e14, r));
    expect(shellOpacity(1e16, AU_KM)).toBeLessThan(shellOpacity(1e16, r));
    expect(shellOpacity(null, r)).toBeCloseTo(UNKNOWN_MASS_OPACITY, 9);
    expect(shellOpacity(1e20, r)).toBeLessThanOrEqual(1);
    // gone by the edge of the drawn reach
    expect(shellOpacity(1e16, MAX_REACH_AU * AU_KM)).toBe(0);
  });

  it("VN-EXT-005: in flight: started, not yet past 2 AU, from the sorted start times", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../../testdata/donki/cme-2024-05-08.json", import.meta.url), "utf8"),
    ) as Array<{ startTime: string }>;
    expect(raw.length).toBeGreaterThan(0);
    const cmes = [
      { start: "2024-05-08T05:36Z", t21: "2024-05-08T09:30Z", speed: 870 },
      { start: "2024-05-08T19:12Z", t21: "2024-05-08T23:27Z", speed: 828 },
      { start: "2024-05-10T02:12Z", t21: "2024-05-10T22:51Z", speed: 232 },
    ];
    const starts = Float64Array.from(cmes, (c) => tdbFromIso(c.start));
    const t21 = Float64Array.from(cmes, (c) => tdbFromIso(c.t21));
    const speed = Float64Array.from(cmes, (c) => c.speed);
    expect(inFlight(starts, t21, speed, tdbFromIso("2024-05-08T12:00Z")).map((x) => x.index)).toEqual([0]);
    expect(inFlight(starts, t21, speed, tdbFromIso("2024-05-10T12:00Z")).map((x) => x.index)).toEqual([0, 1, 2]);
    // 870 km/s covers 2 AU in about 4 days
    const later = inFlight(starts, t21, speed, tdbFromIso("2024-05-12T18:00Z"));
    expect(later.map((x) => x.index)).toEqual([1, 2]);
    for (const x of later) expect(x.rKm).toBeLessThanOrEqual(MAX_REACH_AU * AU_KM);
  });
});

describe("L1 (T-102)", () => {
  it("VN-EXT-007: L1 is on the Sun-Earth line about 1.5 million km sunward of Earth", async () => {
    const { l1Position } = await import("./l1");
    const out = l1Position([0, 0, 0], [AU_KM, 0, 0], new Float64Array(3));
    // NASA (ACE and DSCOVR mission pages): L1 is about 1.5 million km from Earth toward the Sun.
    expect(AU_KM - out[0]!).toBeGreaterThan(1.45e6);
    expect(AU_KM - out[0]!).toBeLessThan(1.55e6);
    expect(out[1]).toBe(0);
  });
});
