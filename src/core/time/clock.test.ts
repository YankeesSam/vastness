import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceTime,
  clampToRange,
  MAX_FRAME_DT_S,
  PLANET_COVERAGE,
  rateIndex,
  rateLabel,
  RATE_LADDER,
  reverse,
  stepRate,
} from "./clock";

const DAY = 86400;

describe("clock", () => {
  it("VN-TIM-002: the ladder runs from real time to one year per second in named steps", () => {
    expect(RATE_LADDER.map((r) => r.name)).toEqual([
      "1 s/s",
      "1 min/s",
      "1 h/s",
      "1 day/s",
      "1 week/s",
      "1 month/s",
      "1 year/s",
    ]);
    expect(RATE_LADDER[0]!.rate).toBe(1);
    expect(RATE_LADDER[1]!.rate).toBe(60);
    expect(RATE_LADDER[2]!.rate).toBe(3600);
    expect(RATE_LADDER[3]!.rate).toBe(DAY);
    expect(RATE_LADDER[4]!.rate).toBe(7 * DAY);
    // Julian year and its twelfth (IAU: 365.25 d)
    expect(RATE_LADDER[5]!.rate).toBe((365.25 / 12) * DAY);
    expect(RATE_LADDER[6]!.rate).toBe(365.25 * DAY);
  });

  it("VN-TIM-002: stepping up and down the ladder keeps the direction and stops at the ends", () => {
    expect(stepRate(1, 1)).toBe(60);
    expect(stepRate(60, -1)).toBe(1);
    expect(stepRate(1, -1)).toBe(1);
    expect(stepRate(365.25 * DAY, 1)).toBe(365.25 * DAY);
    expect(stepRate(-3600, 1)).toBe(-DAY); // faster backwards
    expect(stepRate(-3600, -1)).toBe(-60);
    // a rate between rungs snaps to the next rung in that direction
    expect(stepRate(100, 1)).toBe(3600);
    expect(stepRate(100, -1)).toBe(60);
  });

  it("VN-TIM-002: reverse flips the direction and keeps the speed", () => {
    expect(reverse(DAY)).toBe(-DAY);
    expect(reverse(-60)).toBe(60);
  });

  it("VN-TIM-002: labels name the rung and the direction", () => {
    expect(rateLabel(1)).toBe("1 s/s");
    expect(rateLabel(-DAY)).toBe("−1 day/s");
    expect(rateLabel(42)).toBe("42 s/s");
    expect(rateIndex(7 * DAY)).toBe(4);
    expect(rateIndex(-7 * DAY)).toBe(4);
    expect(rateIndex(42)).toBe(-1);
  });

  it("VN-TIM-004: pausing never advances and resuming never jumps (one frame is clamped)", () => {
    const t = 5e8;
    expect(advanceTime(t, DAY, 0.016, true)).toBe(t);
    expect(advanceTime(t, 1, 120, false) - t).toBeCloseTo(MAX_FRAME_DT_S, 9);
    expect(advanceTime(t, -1, 0.1, false) - t).toBeCloseTo(-0.1, 6);
    expect(advanceTime(t, 1, -5, false)).toBe(t);
  });

  it("VN-TIM-001: time is held inside the planets' coverage; reaching an edge says so", () => {
    expect(clampToRange(5, 0, 10)).toEqual({ t: 5, atEdge: false });
    expect(clampToRange(-1, 0, 10)).toEqual({ t: 0, atEdge: true });
    expect(clampToRange(11, 0, 10)).toEqual({ t: 10, atEdge: true });
  });
});

describe("planet coverage", () => {
  it("VN-TIM-001: PLANET_COVERAGE is the planets' coverage in the generated manifest (F3)", () => {
    const m = JSON.parse(readFileSync("public/ephem/manifest.json", "utf8")) as {
      objects: Record<string, { id: number; coverage?: { start: number; end: number } }>;
    };
    const earth = Object.values(m.objects).find((o) => o.id === 399)!;
    expect(PLANET_COVERAGE).toEqual({ start: earth.coverage!.start, end: earth.coverage!.end });
  });
});
