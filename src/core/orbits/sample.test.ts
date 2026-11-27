import { describe, expect, it } from "vitest";
import {
  createOrbitSamples,
  needsResample,
  ORBIT_PERIOD_DAYS,
  ORBIT_SAMPLES,
  orbitFade,
  sampleOrbit,
  splitDouble,
  type Evaluate,
} from "./sample.ts";

const DAY = 86400;

/** A circle of radius r in the xy plane with period P, phase 0 at t = 0. */
const circle =
  (r: number, P: number): Evaluate =>
  (t, out, o) => {
    out[o] = r * Math.cos((2 * Math.PI * t) / P);
    out[o + 1] = r * Math.sin((2 * Math.PI * t) / P);
    out[o + 2] = 0;
    return true;
  };

describe("orbit sampling", () => {
  it("VN-SCN-002: samples one period centred on the current time, from the evaluator (not an ellipse fit)", () => {
    const P = 100 * DAY;
    const s = createOrbitSamples(101);
    sampleOrbit(circle(1e8, P), 30 * DAY, P, s);
    expect(s.tCentre).toBe(30 * DAY);
    expect(s.step).toBeCloseTo(P / 100, 6);
    // Sample i is at t - P/2 + i step; the middle one is the current position.
    const mid = 50;
    expect(s.pos[3 * mid]).toBeCloseTo(1e8 * Math.cos((2 * Math.PI * 30) / 100), 3);
    expect(s.pos[3 * mid + 1]).toBeCloseTo(1e8 * Math.sin((2 * Math.PI * 30) / 100), 3);
    // The ends meet: a full period apart.
    expect(s.pos[0]).toBeCloseTo(s.pos[3 * 100]!, 3);
    expect(s.pos[1]).toBeCloseTo(s.pos[3 * 100 + 1]!, 3);
    expect(s.missing).toBe(0);
  });

  it("VN-SCN-002: the default sample count is odd, so the path passes through the body's current position", () => {
    expect(ORBIT_SAMPLES % 2).toBe(1);
    const s = createOrbitSamples();
    sampleOrbit(circle(1e8, 1000), 123, 1000, s);
    const mid = (ORBIT_SAMPLES - 1) / 2;
    expect(s.pos[3 * mid]).toBeCloseTo(1e8 * Math.cos((2 * Math.PI * 123) / 1000), 3);
    expect(s.alpha[mid]).toBeCloseTo(0.9);
  });

  it("VN-SCN-002: samples the evaluator cannot give are marked and counted", () => {
    const s = createOrbitSamples(11);
    const half: Evaluate = (t, out, o) => (t < 0 ? false : circle(1, 10)(t, out, o));
    sampleOrbit(half, 0, 10, s);
    expect([...s.ok]).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(s.missing).toBe(5);
  });

  it("VN-SCN-002: faded with distance from the current position: opaque at it, faint half a period away", () => {
    expect(orbitFade(0)).toBeCloseTo(0.9);
    expect(orbitFade(1)).toBeCloseTo(0.12);
    expect(orbitFade(0.5)).toBeLessThan(orbitFade(0.25));
    const s = createOrbitSamples(5);
    sampleOrbit(circle(1, 4), 0, 4, s);
    expect([...s.alpha].map((a) => Number(a.toFixed(3)))).toEqual(
      [1, 0.5, 0, 0.5, 1].map((u) => Number(orbitFade(u).toFixed(3))),
    );
  });

  it("VN-SCN-002: resampled once time has moved a sample step, or while samples are missing", () => {
    const s = createOrbitSamples(11);
    sampleOrbit(circle(1, 10), 0, 10, s);
    expect(needsResample(s, 0.5)).toBe(false);
    expect(needsResample(s, -0.99)).toBe(false);
    expect(needsResample(s, 1)).toBe(true);
    expect(needsResample(s, -1)).toBe(true);
    sampleOrbit(() => false, 0, 10, s);
    expect(needsResample(s, 0)).toBe(true);
  });

  it("VN-SCN-002: sidereal periods: Earth a year, Neptune about 165 years, the Moon about 27.3 days", () => {
    expect(ORBIT_PERIOD_DAYS[399]).toBeCloseTo(365.256, 2);
    expect(ORBIT_PERIOD_DAYS[899]! / 365.25).toBeCloseTo(164.8, 0);
    expect(ORBIT_PERIOD_DAYS[301]).toBeCloseTo(27.3217, 3);
  });
});

describe("relative-to-eye encoding", () => {
  it("VN-SCN-004: high + low recovers a float64 to well under a metre at 30 AU, high alone does not", () => {
    const x = 4.5e9 + 0.123456; // km
    const out = new Float32Array(2);
    splitDouble(x, out, 0);
    expect(Math.abs(out[0]! - x)).toBeGreaterThan(1e-3);
    expect(Math.abs(out[0]! + out[1]! - x)).toBeLessThan(1e-4);
    expect(out[0]).toBe(Math.fround(x));
  });
});
