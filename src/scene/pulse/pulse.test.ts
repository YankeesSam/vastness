import { describe, expect, it } from "vitest";
import { AU_KM } from "../../core/constants";
import { pulseRadiusKm, unitRing } from "./pulse";

describe("light-speed pulse", () => {
  it("VN-SCL-007: the pulse grows at the speed of light in simulation time", () => {
    const p = { origin: 10 as const, t0: 1000 };
    expect(pulseRadiusKm(p, 1000)).toBe(0);
    expect(pulseRadiusKm(p, 1001)).toBe(299_792.458);
    // 1 AU in 499.004784 s (IAU light-time for unit distance)
    expect(pulseRadiusKm(p, 1000 + 499.004784)! / AU_KM).toBeCloseTo(1, 8);
    // run backwards past its start: no pulse
    expect(pulseRadiusKm(p, 999.9)).toBeNull();
  });

  it("VN-SCL-007: the ring is a unit circle in the ecliptic plane (scene y = 0)", () => {
    const r = unitRing(64);
    expect(r.length).toBe(192);
    for (let i = 0; i < 64; i++) {
      expect(Math.hypot(r[3 * i]!, r[3 * i + 2]!)).toBeCloseTo(1, 6);
      expect(r[3 * i + 1]).toBe(0);
    }
  });
});
