import { describe, expect, it } from "vitest";
import { AU_KM } from "../constants";
import { flightAt, frameDistance, MAX_FLIGHT_S, planFlight, type FlightPoint } from "./flyto";

const sample = (D: number, w0: number, w1: number, n = 400) => {
  const f = planFlight(D, w0, w1);
  const p: FlightPoint = { u: 0, w: 0 };
  const pts: FlightPoint[] = [];
  for (let i = 0; i <= n; i++) {
    flightAt(f, i / n, p);
    pts.push({ ...p });
  }
  return { f, pts };
};

const CASES: [string, number, number, number][] = [
  ["Earth to Moon", 384_400, 2e4, 7300],
  ["Earth to Mars", 2.5 * AU_KM, 2e4, 14_000],
  ["Earth to Neptune", 30 * AU_KM, 2e4, 1e5],
  ["Voyager range", 160 * AU_KM, 1e6, 10],
  ["one metre over", 1e-3, 5, 5],
];

describe("fly-to", () => {
  it.each(CASES)("VN-CAM-002: %s starts and ends exactly where asked", (_n, D, w0, w1) => {
    const { pts } = sample(D, w0, w1);
    expect(pts[0]!.u).toBe(0);
    expect(pts[0]!.w).toBe(w0);
    expect(pts.at(-1)!.u).toBe(1);
    expect(pts.at(-1)!.w).toBe(w1);
  });

  it.each(CASES)("VN-CAM-002: %s never skips past the target (progress is monotonic in [0, 1])", (_n, D, w0, w1) => {
    const { pts } = sample(D, w0, w1);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.u).toBeGreaterThanOrEqual(pts[i - 1]!.u - 1e-12);
      expect(pts[i]!.u).toBeLessThanOrEqual(1);
    }
  });

  it.each(CASES)("VN-CAM-002: %s rises then falls on the log-distance curve (one peak, no dip)", (_n, D, w0, w1) => {
    const { pts } = sample(D, w0, w1);
    let falling = false;
    for (let i = 1; i < pts.length; i++) {
      const up = pts[i]!.w > pts[i - 1]!.w * (1 + 1e-12);
      const down = pts[i]!.w < pts[i - 1]!.w * (1 - 1e-12);
      if (down) falling = true;
      if (falling) expect(up).toBe(false);
    }
    const lo = Math.min(w0, w1);
    for (const p of pts) expect(p.w).toBeGreaterThanOrEqual(lo * (1 - 1e-9));
  });

  it("VN-CAM-002: a long move climbs far enough to frame start and end together", () => {
    const D = 30 * AU_KM;
    const { pts } = sample(D, 2e4, 1e5);
    expect(Math.max(...pts.map((p) => p.w))).toBeGreaterThan(D * 0.5);
  });

  it("VN-CAM-002: duration grows with the log of the distance travelled and stays under 4 s", () => {
    const durations = [1e2, 1e4, 1e6, 1e8, 1e10].map((D) => planFlight(D, 1e3, 1e3).duration);
    for (let i = 1; i < durations.length; i++) expect(durations[i]!).toBeGreaterThanOrEqual(durations[i - 1]!);
    expect(durations[2]! - durations[1]!).toBeGreaterThan(0.2); // log-scaled: each factor of 100 adds time
    for (const D of [1e-3, 1, 1e5, AU_KM, 200 * AU_KM]) {
      const d = planFlight(D, 1e3, 1e3).duration;
      expect(d).toBeLessThan(4);
      expect(d).toBeLessThanOrEqual(MAX_FLIGHT_S);
    }
  });

  it("VN-CAM-002: a pure zoom (no travel) moves the distance only, monotonically", () => {
    const { f, pts } = sample(0, 1e6, 1e3);
    expect(f.duration).toBeGreaterThan(0);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.w).toBeLessThanOrEqual(pts[i - 1]!.w);
    expect(planFlight(0, 10, 10).duration).toBe(0);
  });
});

describe("framing", () => {
  it("VN-CAM-002: the end distance frames the body (four radii), never below 10 m", () => {
    expect(frameDistance(6371)).toBe(25_484);
    expect(frameDistance(0)).toBe(1e-2);
  });
});
