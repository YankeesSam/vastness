import { describe, expect, it } from "vitest";
import { AU_KM } from "../constants";
import {
  BAR_MAX_KM,
  BAR_MIN_KM,
  barPosition,
  formatAu,
  formatKm,
  formatLightTime,
  indicator,
  viewWidthKm,
} from "./indicator";

describe("scale indicator", () => {
  it("VN-SCL-004: the view width at the focus follows the field of view and the aspect", () => {
    // 90 degrees vertical, square: width = 2 d
    expect(viewWidthKm(1000, Math.PI / 2, 1)).toBeCloseTo(2000, 9);
    expect(viewWidthKm(1000, Math.PI / 2, 16 / 9)).toBeCloseTo(2000 * (16 / 9), 9);
  });

  it("VN-SCL-004: the bar is logarithmic, clamped at its ends", () => {
    expect(barPosition(BAR_MIN_KM)).toBe(0);
    expect(barPosition(BAR_MAX_KM)).toBe(1);
    expect(barPosition(1e-9)).toBe(0);
    expect(barPosition(1e20)).toBe(1);
    expect(barPosition(0)).toBe(0);
    // each decade is the same length
    const d = barPosition(1e3) - barPosition(1e2);
    expect(barPosition(1e9) - barPosition(1e8)).toBeCloseTo(d, 12);
    expect(barPosition(Math.sqrt(BAR_MIN_KM * BAR_MAX_KM))).toBeCloseTo(0.5, 12);
  });

  it("VN-SCL-004: the width in km, AU and light-time", () => {
    expect(formatKm(0.25)).toBe("250 m");
    expect(formatKm(12_742)).toBe("12,700 km");
    expect(formatKm(384_400)).toBe("384,000 km");
    expect(formatKm(1.2e6)).toBe("1.2 million km");
    expect(formatKm(4.5e9)).toBe("4.5 billion km");
    expect(formatAu(AU_KM)).toBe("1 AU");
    expect(formatAu(30.07 * AU_KM)).toBe("30.1 AU");
    expect(formatAu(384_400)).toBe("0.00257 AU");
    expect(formatAu(1000)).toBe("6.7 × 10⁻⁶ AU");
    expect(formatAu(29_800)).toBe("2 × 10⁻⁴ AU");
    // light: Earth-Moon 1.28 s, 1 AU 8.32 min (499.0 s), a Julian light-year 9.4607305e12 km
    expect(formatLightTime(384_400)).toBe("1.28 light-seconds");
    expect(formatLightTime(AU_KM)).toBe("8.32 light-minutes");
    expect(formatLightTime(9.4607305e12)).toBe("1 light-year");
    expect(formatLightTime(1e3)).toBe("3.34 light-milliseconds");
    expect(formatLightTime(0.1)).toBe("0.334 light-microseconds");
  });

  it("VN-SCL-004: marks for Earth-Moon, Earth-Sun, Sun-Neptune and Voyager 1 (when known), in order", () => {
    const v1 = 170 * AU_KM;
    const ind = indicator(AU_KM, v1);
    expect(ind.marks.map((m) => m.name)).toEqual(["Earth–Moon", "Earth–Sun", "Sun–Neptune", "Voyager 1"]);
    const pos = ind.marks.map((m) => m.position);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(ind.marks[1]!.position).toBe(ind.position);
    expect(ind.light).toBe("8.32 light-minutes");
    expect(indicator(AU_KM, null).marks).toHaveLength(3);
  });
});
