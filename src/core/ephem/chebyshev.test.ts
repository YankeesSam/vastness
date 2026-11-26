import { describe, expect, it } from "vitest";
import { chebyshevNodes, evaluatePosVel, evaluateSegment, fitChebyshev, fitSegment } from "./chebyshev";

// Reference functions are analytic (polynomials, sines, a circular orbit), so the expected values do not come from
// the code under test.

const T = (k: number, x: number): number => Math.cos(k * Math.acos(x));

/** Coefficients for three axes laid out as the evaluator expects: x0..xn, y0..yn, z0..zn. */
function layout(cx: number[], cy: number[], cz: number[]): Float64Array {
  return Float64Array.from([...cx, ...cy, ...cz]);
}

describe("Chebyshev nodes", () => {
  it("VN-EPH-002: n first-kind nodes cos((2j+1) pi / 2n), ascending, inside (-1, 1)", () => {
    const n = 9;
    const x = chebyshevNodes(n);
    expect(x).toHaveLength(n);
    for (let j = 0; j < n; j++) expect(x[j]).toBeCloseTo(-Math.cos(((2 * j + 1) * Math.PI) / (2 * n)), 15);
    for (let j = 1; j < n; j++) expect(x[j]!).toBeGreaterThan(x[j - 1]!);
  });
});

describe("Clenshaw evaluation", () => {
  it("VN-EPH-002: value equals sum c_k T_k(tau) and the derivative equals the analytic one", () => {
    const cx = [0.5, -1.25, 2, 0.75, -0.3, 0.1, 0.05, -0.02];
    const cy = [0, 0.75, 0, 0.25, 0, 0, 0, 0]; // tau^3
    const cz = [1, 0, 0, 0, 0, 0, 0, 0];
    const coeffs = layout(cx, cy, cz);
    const out = new Float64Array(6);
    for (const tau of [-1, -0.73, -0.1, 0, 0.42, 0.999, 1]) {
      evaluatePosVel(coeffs, 0, cx.length, tau, 1, out, 0);
      const expectX = cx.reduce((s, c, k) => s + c * T(k, tau), 0);
      expect(out[0]).toBeCloseTo(expectX, 13);
      expect(out[1]).toBeCloseTo(tau ** 3, 14);
      expect(out[2]).toBe(1);
      expect(out[4]).toBeCloseTo(3 * tau * tau, 13); // d(tau^3)/dtau
      expect(out[5]).toBe(0);
      // Finite-difference check of the x derivative (dT_k/dtau is not trivial at the ends).
      if (Math.abs(tau) < 0.99) {
        const h = 1e-6;
        const f = (t: number) => cx.reduce((s, c, k) => s + c * T(k, t), 0);
        expect(out[3]).toBeCloseTo((f(tau + h) - f(tau - h)) / (2 * h), 7);
      }
    }
  });

  it("VN-EPH-002: velocity is d/dtau times 2 / (t1 - t0); offsets select the segment and output slot", () => {
    const n = 4;
    const seg0 = layout([9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9]);
    const seg1 = layout([10, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]); // x = 10 + 2 tau
    const coeffs = Float64Array.from([...seg0, ...seg1]);
    const out = new Float64Array(12).fill(-1);
    // Segment covers [100, 200] s: tau = (2t - 300) / 100, dx/dt = 2 * 2 / 100.
    evaluateSegment(coeffs, 3 * n, n, 100, 200, 175, out, 6);
    expect(Array.from(out.subarray(0, 6))).toEqual([-1, -1, -1, -1, -1, -1]);
    expect(out[6]).toBeCloseTo(10 + 2 * 0.5, 14);
    expect(out[9]).toBeCloseTo(0.04, 15);
  });

  it("VN-EPH-005: evaluation allocates nothing (no arrays, objects, closures or spreads in its body)", () => {
    for (const f of [evaluatePosVel, evaluateSegment]) {
      expect(f.toString()).not.toMatch(/\bnew\b|\[\s*\]|\{\s*\}|=>|\.\.\.|Array|\.slice|\.map/);
    }
  });
});

describe("least-squares fit", () => {
  it("VN-EPH-002: recovers an exact polynomial's coefficients", () => {
    const tau = chebyshevNodes(20);
    const c = [0.3, -2, 0.5, 1, 0, -0.25];
    const values = Array.from(tau, (x) => c.reduce((s, ck, k) => s + ck * T(k, x), 0));
    const fit = fitChebyshev(tau, values, 5);
    for (let k = 0; k <= 5; k++) expect(fit[k]).toBeCloseTo(c[k]!, 12);
  });

  it("VN-EPH-002: a degree-17 fit of sin(3 tau) is accurate to 1e-12 at held-out midpoints", () => {
    const tau = chebyshevNodes(40);
    // Truncation bound: the first dropped coefficient is about 2 J_18(3) = 5e-13.
    const f = (x: number) => Math.sin(3 * x + 0.4);
    const fit = fitChebyshev(
      tau,
      Array.from(tau, (x) => f(x)),
      17,
    );
    const out = new Float64Array(6);
    const coeffs = layout(Array.from(fit), new Array(18).fill(0), new Array(18).fill(0));
    let worst = 0;
    for (let i = 0; i + 1 < tau.length; i++) {
      const mid = (tau[i]! + tau[i + 1]!) / 2;
      evaluatePosVel(coeffs, 0, 18, mid, 1, out, 0);
      worst = Math.max(worst, Math.abs(out[0]! - f(mid)));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it("VN-EPH-002: velocity samples as extra rows give a fit that honours both", () => {
    const tau = chebyshevNodes(6);
    const f = (x: number) => Math.exp(x);
    // With only 6 positions a degree-9 fit is underdetermined; derivatives make it well posed.
    const fit = fitChebyshev(tau, Array.from(tau, f), 9, { derivatives: Array.from(tau, f), scale: 1 });
    const coeffs = layout(Array.from(fit), new Array(10).fill(0), new Array(10).fill(0));
    const out = new Float64Array(6);
    for (const x of [-0.95, -0.3, 0.2, 0.8]) {
      evaluatePosVel(coeffs, 0, 10, x, 1, out, 0);
      expect(out[0]).toBeCloseTo(f(x), 8);
      expect(out[3]).toBeCloseTo(f(x), 6);
    }
  });

  it("VN-EPH-002: a 30-day segment of a circular 1 au orbit reproduces position to 1 m and velocity to 1 mm/s", () => {
    const AU = 149_597_870.7;
    const GM = 132_712_440_041.279419;
    const w = Math.sqrt(GM / AU ** 3); // rad/s
    const t0 = 0;
    const t1 = 30 * 86400;
    const pos = (t: number) => [AU * Math.cos(w * t), AU * Math.sin(w * t), 1e5 * Math.sin(w * t)];
    const vel = (t: number) => [-AU * w * Math.sin(w * t), AU * w * Math.cos(w * t), 1e5 * w * Math.cos(w * t)];
    const times = Array.from({ length: 31 }, (_, i) => t0 + i * 86400);
    const seg = fitSegment(t0, t1, times, times.map(pos), times.map(vel), 10);
    expect(seg).toHaveLength(3 * 11);
    const out = new Float64Array(6);
    for (let i = 0; i < 30; i++) {
      const t = t0 + (i + 0.5) * 86400; // held-out midpoints
      evaluateSegment(seg, 0, 11, t0, t1, t, out, 0);
      const p = pos(t);
      const v = vel(t);
      for (let a = 0; a < 3; a++) {
        expect(Math.abs(out[a]! - p[a]!)).toBeLessThan(1e-3);
        expect(Math.abs(out[3 + a]! - v[a]!)).toBeLessThan(1e-6);
      }
    }
  });

  it("VN-EPH-002: rejects too few rows for the degree", () => {
    expect(() => fitChebyshev([0, 0.5], [1, 2], 3)).toThrow(RangeError);
  });
});
