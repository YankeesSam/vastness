import { describe, expect, it } from "vitest";
import { GLOW_MIN_PX, GLOW_RADII, glowProfile, glowRadiusKm } from "./glow.ts";

const FOV = (50 * Math.PI) / 180;
const R_SUN = 695_700;

describe("Sun glow (VN-SCN-005)", () => {
  it("VN-SCN-005: near the Sun the glow is a fixed number of solar radii, scaled by size", () => {
    expect(glowRadiusKm(R_SUN, 1e7, FOV, 720)).toBeCloseTo(GLOW_RADII * R_SUN, 6);
    expect(glowRadiusKm(R_SUN, 1e7, FOV, 720, 2)).toBeCloseTo(2 * GLOW_RADII * R_SUN, 6);
  });

  it("VN-SCN-005: from far away it keeps a minimum size on screen, so the Sun is visible from 150 AU", () => {
    const d = 150 * 149_597_870.7;
    const r = glowRadiusKm(R_SUN, d, FOV, 720);
    const px = r / ((2 * d * Math.tan(FOV / 2)) / 720);
    expect(px).toBeCloseTo(GLOW_MIN_PX, 6);
  });

  it("VN-SCN-005: the profile is brightest at the centre, falls monotonically to 0 at the edge and scales with brightness", () => {
    expect(glowProfile(0)).toBeCloseTo(1, 12);
    expect(glowProfile(1)).toBe(0);
    expect(glowProfile(2)).toBe(0);
    let prev = Infinity;
    for (let r = 0; r <= 1; r += 0.05) {
      const v = glowProfile(r);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(glowProfile(0.3, 2)).toBeCloseTo(2 * glowProfile(0.3), 12);
    expect(glowProfile(0.3, 0)).toBe(0);
  });
});
