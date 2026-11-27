import { describe, expect, it } from "vitest";
import type { Evaluate } from "../orbits/sample";
import {
  createTrailSamples,
  sampleTrail,
  TRAIL_CHORD_TOLERANCE,
  TRAIL_DEFAULT_DAYS,
  TRAIL_WHOLE,
  trailRange,
  trailStale,
  type TrailRange,
} from "./sample";

const DAY = 86400;
const AU = 149_597_870.7;

/** Straight cruise at 17 km/s. */
const straight: Evaluate = (t, out, o) => {
  out[o] = 17 * t;
  out[o + 1] = 1e9;
  out[o + 2] = 0;
  return true;
};

/** A hyperbolic flyby at t = 0: tight bend over a few days, straight on either side (e = 1.5, q = 700,000 km). */
function flyby(t: number, out: Float64Array, o: number): boolean {
  const mu = 1.267e8; // Jupiter, km^3/s^2
  const e = 1.5;
  const q = 7e5;
  const a = q / (e - 1);
  const n = Math.sqrt(mu / (a * a * a));
  const M = n * t;
  let H = Math.asinh(M / e);
  for (let k = 0; k < 50; k++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
  out[o] = a * (e - Math.cosh(H)) + 5 * AU;
  out[o + 1] = a * Math.sqrt(e * e - 1) * Math.sinh(H);
  out[o + 2] = 0;
  return true;
}

describe("trail range", () => {
  const cov = { start: 0, end: 3000 * DAY };
  it("VN-CAT-004: one year back and one year ahead by default, clipped to the coverage", () => {
    const r: TrailRange = { t0: 0, now: 0, t1: 0 };
    expect(trailRange(1000 * DAY, TRAIL_DEFAULT_DAYS, TRAIL_DEFAULT_DAYS, cov, r)).toBe(true);
    expect(r).toEqual({ t0: 635 * DAY, now: 1000 * DAY, t1: 1365 * DAY });
    trailRange(100 * DAY, TRAIL_DEFAULT_DAYS, TRAIL_DEFAULT_DAYS, cov, r);
    expect(r.t0).toBe(0);
    trailRange(1000 * DAY, TRAIL_WHOLE, TRAIL_WHOLE, cov, r);
    expect([r.t0, r.t1]).toEqual([0, 3000 * DAY]);
  });
  it("VN-EPH-007: no trail outside the coverage", () => {
    expect(trailRange(-1, 365, 365, cov, { t0: 0, now: 0, t1: 0 })).toBe(false);
    expect(trailRange(3001 * DAY, 365, 365, cov, { t0: 0, now: 0, t1: 0 })).toBe(false);
  });
});

describe("trail sampling", () => {
  it("VN-CAT-004: past and predicted parts meet at the current position", () => {
    const s = createTrailSamples();
    const r = { t0: -365 * DAY, now: 10 * DAY, t1: 375 * DAY };
    sampleTrail(straight, r, s);
    expect(s.t[0]).toBe(r.t0);
    expect(s.t[s.split]).toBe(r.now);
    expect(s.t[s.count - 1]).toBe(r.t1);
    for (let i = 1; i < s.count; i++) expect(s.t[i]!).toBeGreaterThan(s.t[i - 1]!);
    for (let i = 0; i < s.split; i++) expect(s.t[i]!).toBeLessThan(r.now);
    expect(s.missing).toBe(0);
  });

  it("VN-CAT-004: a straight cruise needs only the base samples", () => {
    const s = createTrailSamples();
    sampleTrail(straight, { t0: -365 * DAY, now: 0, t1: 365 * DAY }, s);
    expect(s.count).toBe(129);
  });

  it("VN-CAT-004: a flyby is refined where it bends, and the polyline stays within tolerance of the true path", () => {
    const s = createTrailSamples();
    const r = { t0: -365 * DAY, now: 30 * DAY, t1: 365 * DAY };
    sampleTrail(flyby, r, s);
    expect(s.truncated).toBe(false);
    expect(s.count).toBeGreaterThan(129);
    expect(s.count).toBeLessThan(1000);
    // Denser near periapsis than in cruise.
    const near = Array.from(s.t.subarray(0, s.count)).filter((t) => Math.abs(t) < 5 * DAY).length;
    const far = Array.from(s.t.subarray(0, s.count)).filter((t) => t > 200 * DAY && t < 210 * DAY).length;
    expect(near).toBeGreaterThan(5 * far);
    // Between consecutive points the true path stays close to the chord (relative to the chord).
    const p = new Float64Array(3);
    let worst = 0;
    for (let i = 1; i < s.count; i++) {
      const a = s.t[i - 1]!;
      const b = s.t[i]!;
      const chord = Math.hypot(
        s.pos[3 * i]! - s.pos[3 * i - 3]!,
        s.pos[3 * i + 1]! - s.pos[3 * i - 2]!,
        s.pos[3 * i + 2]! - s.pos[3 * i - 1]!,
      );
      for (const f of [0.25, 0.5, 0.75]) {
        flyby(a + f * (b - a), p, 0);
        const lx = s.pos[3 * i - 3]! + f * (s.pos[3 * i]! - s.pos[3 * i - 3]!);
        const ly = s.pos[3 * i - 2]! + f * (s.pos[3 * i + 1]! - s.pos[3 * i - 2]!);
        worst = Math.max(worst, Math.hypot(p[0]! - lx, p[1]! - ly) / chord);
      }
    }
    expect(worst).toBeLessThan(4 * TRAIL_CHORD_TOLERANCE);
  });

  it("VN-CAT-004: the point budget bounds the work and is reported", () => {
    const s = createTrailSamples(200);
    sampleTrail(flyby, { t0: -365 * DAY, now: 0, t1: 365 * DAY }, s);
    expect(s.count).toBeLessThanOrEqual(200);
    expect(s.truncated).toBe(true);
    expect(s.t[s.count - 1]).toBe(365 * DAY);
  });

  it("missing positions are counted, and a stale trail is resampled", () => {
    const s = createTrailSamples();
    const gap: Evaluate = (t, out, o) => (t > 0 && t < 50 * DAY ? false : straight(t, out, o));
    const r = { t0: -365 * DAY, now: 100 * DAY, t1: 365 * DAY };
    sampleTrail(gap, r, s);
    expect(s.missing).toBeGreaterThan(0);
    expect(trailStale(s, r)).toBe(true);
    sampleTrail(straight, r, s);
    expect(trailStale(s, r)).toBe(false);
    expect(trailStale(s, { ...r, now: r.now + DAY })).toBe(false);
    expect(trailStale(s, { ...r, now: r.now + 10 * DAY })).toBe(true);
  });

  /** Worst distance, over many times, between the true position and the polyline interpolated in time. */
  function worstError(ev: Evaluate, s: ReturnType<typeof createTrailSamples>): number {
    const p = new Float64Array(3);
    let worst = 0;
    for (let i = 1; i < s.count; i++) {
      const a = s.t[i - 1]!;
      const b = s.t[i]!;
      for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
        ev(a + f * (b - a), p, 0);
        let d2 = 0;
        for (let k = 0; k < 3; k++) {
          const l = s.pos[3 * i - 3 + k]! + f * (s.pos[3 * i + k]! - s.pos[3 * i - 3 + k]!);
          d2 += (p[k]! - l) ** 2;
        }
        worst = Math.max(worst, Math.sqrt(d2));
      }
    }
    return worst;
  }

  const YEAR = 365.25 * DAY;
  /** A circular heliocentric orbit of 1 AU and 1 year, like JWST's around the Sun. */
  const circle: Evaluate = (t, out, o) => {
    const w = (2 * Math.PI * t) / YEAR;
    out[o] = AU * Math.cos(w);
    out[o + 1] = AU * Math.sin(w);
    out[o + 2] = 0;
    return true;
  };

  it("D-004: base intervals of a whole number of periods do not alias into chords", () => {
    const s = createTrailSamples();
    // Each side spans 64 intervals of exactly two periods: every midpoint lands on its ends.
    sampleTrail(circle, { t0: -128 * YEAR, now: 0, t1: 128 * YEAR }, s);
    expect(worstError(circle, s)).toBeLessThan(0.1 * AU);
  });

  it("D-004: a whole-coverage trail spends its budget evenly (JWST 2021-12-25..2031-11-16 seen from 2029-04-17)", () => {
    for (const cap of [513, 1025, 2049]) {
      const s = createTrailSamples(cap);
      sampleTrail(circle, { t0: -7.3 * YEAR, now: 0, t1: 2.6 * YEAR }, s);
      expect(s.count).toBe(cap);
      // A regular polygon of `cap` points over 10 years: about 1.7 degrees (high) to 7 degrees (low) per side.
      const sides = (cap - 1) / 9.9;
      const even = AU * (1 - Math.cos(Math.PI / sides));
      expect(worstError(circle, s)).toBeLessThan(4 * even);
    }
  });
});
