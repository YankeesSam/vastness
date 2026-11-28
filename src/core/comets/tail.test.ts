import { describe, expect, it } from "vitest";
import { AU_KM, BODIES } from "../constants";
import { DUST_BETA, SOLAR_WIND_KM_S, TAIL_OFF_AU, activity, dustTail, ionTailDirection } from "./tail";

const MU = BODIES[10].gmKm3S2;
const unit = (v: ArrayLike<number>) => {
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n];
};
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe("comet tails (T-107, VN-EXT-015)", () => {
  it("VN-EXT-015: activity grows towards the Sun as 1/r^2 and is zero beyond the cut-off", () => {
    expect(activity(1)).toBeCloseTo(1, 12);
    expect(activity(0.5)).toBeCloseTo(4, 12);
    expect(activity(2) / activity(1)).toBeLessThanOrEqual(0.25);
    expect(activity(TAIL_OFF_AU)).toBe(0);
    expect(activity(30)).toBe(0);
    // Monotonic and continuous through the fade.
    let prev = activity(0.3);
    for (let r = 0.31; r < TAIL_OFF_AU + 1; r += 0.01) {
      const a = activity(r);
      expect(a).toBeLessThanOrEqual(prev);
      expect(prev - a).toBeLessThanOrEqual(0.1 * prev + 1e-3); // no jump
      prev = a;
    }
  });

  it("VN-EXT-015: the ion tail points away from the Sun, aberrated by the comet's motion through the solar wind", () => {
    const out = new Float64Array(3);
    ionTailDirection([AU_KM, 0, 0], [0, 0, 0], out);
    expect([...out]).toEqual([1, 0, 0]);
    // Moving at 40 km/s across the radial line: the tail swings back against the motion by atan(40 / 400).
    ionTailDirection([AU_KM, 0, 0], [0, 40, 0], out);
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeCloseTo(1, 12);
    expect(out[1]).toBeLessThan(0);
    expect(Math.atan2(-out[1]!, out[0]!)).toBeCloseTo(Math.atan(40 / SOLAR_WIND_KM_S), 12);
  });

  it("VN-EXT-015: the dust tail starts at the nucleus, leaves anti-sunward and curves behind the motion", () => {
    const r = [AU_KM, 0, 0];
    const v = [0, 30, 0];
    const n = 16;
    const out = new Float64Array(3 * n);
    const days = 20;
    dustTail(r, v, MU, DUST_BETA, days * 86400, out, n);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    const first = unit([out[3]!, out[4]!, out[5]!]);
    const last = unit([out[3 * n - 3]!, out[3 * n - 2]!, out[3 * n - 1]!]);
    expect(dot(first, [1, 0, 0])).toBeGreaterThan(0.99); // near the nucleus: anti-sunward
    expect(last[0]).toBeGreaterThan(0); // still on the far side of the Sun
    expect(last[1]).toBeLessThan(0); // lagging behind the direction of motion
    expect(Math.atan2(-last[1]!, last[0]!)).toBeGreaterThan(Math.atan2(-first[1]!, first[0]!));
    // Length: half beta GM / d^2 tau^2 for the oldest dust, d its distance from the Sun at release.
    const tau = days * 86400;
    const d = Math.hypot(AU_KM, 30 * tau);
    const len = Math.hypot(out[3 * n - 3]!, out[3 * n - 2]!, out[3 * n - 1]!);
    expect(len).toBeCloseTo((0.5 * DUST_BETA * MU * tau * tau) / (d * d), 0);
  });

  it("VN-EXT-015: a dust tail at rest points straight away from the Sun and allocates nothing per call", () => {
    const out = new Float64Array(3 * 4);
    const before = out;
    dustTail([0, 2 * AU_KM, 0], [0, 0, 0], MU, DUST_BETA, 10 * 86400, out, 4);
    expect(out).toBe(before);
    for (let k = 1; k < 4; k++) {
      expect(out[3 * k]).toBeCloseTo(0, 6);
      expect(out[3 * k + 1]).toBeGreaterThan(0);
      expect(out[3 * k + 2]).toBeCloseTo(0, 6);
    }
  });
});
