import { describe, expect, it } from "vitest";
import {
  createReadout,
  formatDistance,
  formatLightTime,
  formatSpeed,
  READOUT_INTERVAL_MS,
  readouts,
} from "./readouts.ts";

// References: the astronomical unit is exactly 149,597,870.7 km (IAU 2012 B2); the light-time for one au is
// tau_A = 499.004 783 836 s (IAU 2009 System of Astronomical Constants); the international mile is exactly
// 1.609344 km.
const AU = 149_597_870.7;
const TAU_A = 499.004783836;

describe("read-outs", () => {
  it("VN-INF-001: distances from the Sun and Earth, heliocentric speed and speed relative to Earth", () => {
    const body = new Float64Array([AU, 0, 0, 0, 30, 0]);
    const earth = new Float64Array([0, AU, 0, -30, 0, 0]);
    const r = readouts(body, earth, createReadout());
    expect(r.sunKm).toBeCloseTo(AU, 3);
    expect(r.earthKm).toBeCloseTo(Math.SQRT2 * AU, 3);
    expect(r.helioSpeedKmS).toBeCloseTo(30, 12);
    expect(r.earthSpeedKmS).toBeCloseTo(Math.hypot(30, 30), 12);
  });

  it("VN-INF-002: one-way light-time from Earth is distance / c: one au is tau_A", () => {
    const r = readouts(new Float64Array([AU, 0, 0, 0, 0, 0]), new Float64Array(6), createReadout());
    expect(r.lightTimeS).toBeCloseTo(TAU_A, 6);
  });

  it("VN-INF-002: light-time is shown as h m s", () => {
    expect(formatLightTime(TAU_A)).toBe("8 m 19 s");
    expect(formatLightTime(0.4)).toBe("0 s");
    expect(formatLightTime(1.28)).toBe("1 s");
    expect(formatLightTime(3600 * 22 + 61.6)).toBe("22 h 01 m 02 s");
    expect(formatLightTime(59.6)).toBe("1 m 00 s");
  });

  it("VN-INF-004: distances in km, AU or miles", () => {
    expect(formatDistance(AU, "km")).toBe("149,597,871 km");
    expect(formatDistance(AU, "au")).toBe("1.00000 AU");
    expect(formatDistance(1.609344e6, "mi")).toBe("1,000,000 mi");
    expect(formatDistance(384_400.4, "km")).toBe("384,400 km");
    expect(formatDistance(1234.56, "km")).toBe("1,234.6 km");
    expect(formatDistance(24.4 * AU, "au")).toBe("24.4000 AU");
    expect(formatDistance(0, "km")).toBe("0 km");
  });

  it("VN-INF-004: speeds in km/s, or mi/s with miles", () => {
    expect(formatSpeed(29.78, "km")).toBe("29.780 km/s");
    expect(formatSpeed(29.78, "au")).toBe("29.780 km/s");
    expect(formatSpeed(1.609344, "mi")).toBe("1.000 mi/s");
  });

  it("VN-INF-004: read-outs update at most 4 times a second", () => {
    expect(READOUT_INTERVAL_MS).toBeGreaterThanOrEqual(250);
  });
});
