import { describe, expect, it } from "vitest";
import { evaluateSegment } from "../../src/core/ephem/chebyshev.ts";
import { findSegment, readEphemeris, writeEphemeris } from "../../src/core/ephem/format.ts";
import { DEGREES, TOLERANCE_KM, fitAdaptive, type FitResult, type Sample } from "./fit.ts";

// References are closed-form functions, so the truth at any time is known exactly (not our own code's output).
const AU = 149_597_870.7;
const DAY = 86400;
const YEAR = 365.25 * DAY;
const W = (2 * Math.PI) / YEAR;

type Fn = (t: number) => [number, number, number, number, number, number];

/** 1 au circular orbit in the ecliptic with a small out-of-plane wobble. */
const circular: Fn = (t) => [
  AU * Math.cos(W * t),
  AU * Math.sin(W * t),
  1e5 * Math.sin(3 * W * t),
  -AU * W * Math.sin(W * t),
  AU * W * Math.cos(W * t),
  1e5 * 3 * W * Math.cos(3 * W * t),
];

/** A cruise line with a flyby-like Gaussian kick of 50,000 km over about two days at t = 200 d. */
const FLYBY = 200 * DAY;
const SIGMA = 1.5 * DAY;
const flyby: Fn = (t) => {
  const g = Math.exp(-(((t - FLYBY) / SIGMA) ** 2) / 2);
  const dg = (-(t - FLYBY) / SIGMA ** 2) * g;
  return [20 * t, 5e4 * g, 0, 20, 5e4 * dg, 0];
};

function sample(fn: Fn, t0: number, step: number, count: number): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const t = t0 + i * step;
    const [x, y, z, vx, vy, vz] = fn(t);
    return { t, x, y, z, vx, vy, vz };
  });
}

/** Max position error of a fit against the function at `n` points spread over the span (not just midpoints). */
function denseError(r: FitResult, fn: Fn, n: number): number {
  const out = new Float64Array(6);
  const a = r.segments[0]!.t0;
  const b = r.segments.at(-1)!.t1;
  let max = 0;
  for (let k = 0; k <= n; k++) {
    const t = a + ((b - a) * k) / n;
    const seg = r.segments.find((s) => t >= s.t0 && t <= s.t1)!;
    evaluateSegment(Float64Array.from(seg.coeffs), 0, r.degree + 1, seg.t0, seg.t1, t, out, 0);
    const [x, y, z] = fn(t);
    max = Math.max(max, Math.hypot(out[0]! - x, out[1]! - y, out[2]! - z));
  }
  return max;
}

const segmentDays = (r: FitResult): number[] => r.segments.map((s) => (s.t1 - s.t0) / DAY);

describe("adaptive segment fitting (T-017)", () => {
  it("VN-EPH-003: tolerances are 10 km planets and Moon, 50 km cruise, 2 km low lunar orbit", () => {
    expect(TOLERANCE_KM).toEqual({ planet: 10, moon: 10, cruise: 50, lunarOrbit: 2 });
    expect([...DEGREES]).toEqual([7, 8, 9, 10, 11, 12, 13]);
  });

  it("VN-EPH-002: a planet-like orbit over two years meets 10 km at held-out midpoints and everywhere between", () => {
    const s = sample(circular, -YEAR, DAY / 2, 1461); // 2 years at 12 h: fitted daily, midpoints held out
    const r = fitAdaptive(s, { toleranceKm: TOLERANCE_KM.planet });
    expect(r.misses).toEqual([]);
    expect(r.maxErrorKm).toBeLessThanOrEqual(10);
    expect(r.maxErrorKm).toBeGreaterThan(0); // the held-out error is measured, not assumed
    expect(DEGREES).toContain(r.degree);
    expect(denseError(r, circular, 5000)).toBeLessThan(10);
    // Contiguous segments covering exactly the sampled span.
    expect(r.segments[0]!.t0).toBe(s[0]!.t);
    expect(r.segments.at(-1)!.t1).toBe(s.at(-1)!.t);
    r.segments.forEach((seg, i) => i > 0 && expect(seg.t0).toBe(r.segments[i - 1]!.t1));
  });

  it("VN-EPH-002: held-out samples are not used in the fit; they only judge it", () => {
    const s = sample(circular, 0, DAY / 2, 129);
    const a = fitAdaptive(s, { toleranceKm: 1e6, degrees: [9] });
    const nudged = s.map((p, i) => (i % 2 === 1 ? { ...p, x: p.x + 1000 } : p));
    const b = fitAdaptive(nudged, { toleranceKm: 1e6, degrees: [9] });
    expect(Array.from(b.segments[0]!.coeffs)).toEqual(Array.from(a.segments[0]!.coeffs));
    expect(b.maxErrorKm).toBeGreaterThan(999);
    expect(b.maxErrorKm).toBeLessThan(1001);
  });

  it("VN-EPH-003: segments around a flyby are subdivided; cruise segments stay long", () => {
    const s = sample(flyby, 0, DAY / 4, 1601); // 400 days at 6 h
    const r = fitAdaptive(s, { toleranceKm: TOLERANCE_KM.cruise });
    expect(r.misses).toEqual([]);
    expect(r.maxErrorKm).toBeLessThanOrEqual(50);
    const near = r.segments.filter((g) => g.t1 > FLYBY - 5 * DAY && g.t0 < FLYBY + 5 * DAY);
    const far = r.segments.filter((g) => g.t1 < FLYBY - 30 * DAY);
    const longest = (gs: typeof r.segments) => Math.max(...gs.map((g) => g.t1 - g.t0));
    expect(longest(near)).toBeLessThan(longest(far) / 2);
    expect(denseError(r, flyby, 20000)).toBeLessThan(100); // between held-out points it stays close
  });

  it("VN-EPH-003: a tighter tolerance gives more, shorter segments", () => {
    const s = sample(circular, 0, DAY, 2 * 365 + 1);
    const loose = fitAdaptive(s, { toleranceKm: 50, degrees: [7] });
    const tight = fitAdaptive(s, { toleranceKm: 0.001, degrees: [7] });
    expect(tight.segments.length).toBeGreaterThan(loose.segments.length);
    expect(Math.max(...segmentDays(tight))).toBeLessThan(Math.max(...segmentDays(loose)));
  });

  it("VN-EPH-003: a segment that misses at the step limit is listed with its error, never hidden", () => {
    // Sample-to-sample noise of 200 km on a few points: no polynomial can follow it.
    const noisy = sample(circular, 0, DAY, 257).map((p, i) => (i === 101 || i === 151 ? { ...p, x: p.x + 200 } : p));
    const r = fitAdaptive(noisy, { toleranceKm: 10 });
    expect(r.misses.length).toBeGreaterThan(0);
    for (const m of r.misses) {
      expect(m.errorKm).toBeGreaterThan(10);
      expect((m.t0 <= 101 * DAY && m.t1 >= 101 * DAY) || (m.t0 <= 151 * DAY && m.t1 >= 151 * DAY)).toBe(true);
    }
    expect(r.maxErrorKm).toBeGreaterThan(10);
    expect([101 * DAY, 151 * DAY]).toContain(r.maxErrorEpoch);
  });

  it("VN-EPH-002: the fit writes to the binary format and evaluates the same after reading", () => {
    const s = sample(circular, 0, DAY / 2, 365);
    const r = fitAdaptive(s, { toleranceKm: 10 });
    const file = readEphemeris(
      writeEphemeris({ objectId: 399, centerId: 10, degree: r.degree, segments: r.segments }).buffer,
    );
    const out = new Float64Array(6);
    const t = 77.3 * DAY;
    const i = findSegment(file, t);
    const n = r.degree + 1;
    evaluateSegment(file.coeffs, i * 3 * n, n, file.t0[i]!, file.t1[i]!, t, out, 0);
    const [x, y, z] = circular(t);
    expect(Math.hypot(out[0]! - x, out[1]! - y, out[2]! - z)).toBeLessThan(10);
  });

  it("rejects inputs it cannot fit honestly", () => {
    const s = sample(circular, 0, DAY, 10);
    expect(() => fitAdaptive(s, { toleranceKm: 10 })).toThrow(/odd number/);
    expect(() => fitAdaptive(s.slice(0, 9), { toleranceKm: 0 })).toThrow(/tolerance/);
    expect(() => fitAdaptive([s[1]!, s[0]!, s[2]!], { toleranceKm: 10 })).toThrow(/ascending/);
  });
});

describe("fit target below the tolerance (T-019 finding)", () => {
  it("VN-EPH-003: targetKm subdivides further, while misses are still judged against the tolerance", () => {
    const s = sample(circular, 0, DAY, 2 * 365 + 1);
    const plain = fitAdaptive(s, { toleranceKm: 0.01, degrees: [7] });
    const margin = fitAdaptive(s, { toleranceKm: 0.01, targetKm: 0.005, degrees: [7] });
    expect(margin.segments.length).toBeGreaterThan(plain.segments.length);
    expect(margin.maxErrorKm).toBeLessThanOrEqual(0.005);
    // Noise no segment can follow: misses list only what exceeds the tolerance, not the target.
    const noisy = s.map((p, i) => (i === 101 ? { ...p, x: p.x + 30 } : p));
    const r = fitAdaptive(noisy, { toleranceKm: 1000, targetKm: 1, degrees: [7] });
    expect(r.misses).toEqual([]);
    expect(r.maxErrorKm).toBeGreaterThan(1);
    expect(() => fitAdaptive(s, { toleranceKm: 10, targetKm: 20 })).toThrow(/target/);
  });
});

describe("fitAdaptive short tail", () => {
  it("VN-EPH-002: a last piece too short for the degree joins the one before instead of failing", () => {
    const s: { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i <= 66; i++) {
      const t = i * 3600;
      s.push({
        t,
        x: Math.cos(t / 1e5) * 1e6,
        y: Math.sin(t / 1e5) * 1e6,
        z: 0,
        vx: -Math.sin(t / 1e5) * 10,
        vy: Math.cos(t / 1e5) * 10,
        vz: 0,
      });
    }
    expect(() => fitAdaptive(s, { toleranceKm: 1, degrees: [13] })).toThrow(/too few samples/);
    const r = fitAdaptive(s, { toleranceKm: 1, degrees: [13], joinShortTail: true });
    expect(r.segments.at(-1)!.t1).toBe(66 * 3600);
    expect(r.misses).toEqual([]);
  });
});
