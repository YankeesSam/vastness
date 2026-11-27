import { describe, expect, it } from "vitest";
import { AU_KM } from "../constants";
import { MAX_DISTANCE_KM, MAX_ELEVATION } from "./orbit";
import { PRESETS, presetCamera, VERTICAL_FOV_DEG, type PresetId } from "./presets";

const halfView = (d: number) => d * Math.tan(((VERTICAL_FOV_DEG / 2) * Math.PI) / 180);

describe("preset views", () => {
  it("VN-CAM-005: whole system, inner planets, outer planets, heliopause and Earth-Moon", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Whole system",
      "Inner planets",
      "Outer planets",
      "Heliopause (Voyagers)",
      "Earth and Moon",
    ]);
  });

  it("VN-CAM-005: the whole system is seen top-down onto the ecliptic and takes in Neptune's orbit", () => {
    const c = presetCamera("system");
    expect(c.target).toBe(10);
    expect(c.elevation).toBe(MAX_ELEVATION);
    expect(halfView(c.distanceKm)).toBeGreaterThanOrEqual(30.4 * AU_KM); // Neptune's aphelion
  });

  it("VN-CAM-005: each preset frames its region in the vertical field of view", () => {
    // Region radii: Mars aphelion 1.67 AU, Neptune aphelion 30.4 AU, Voyager 1 about 170 AU from the Sun in 2026
    // and moving out 3.6 AU a year (180 AU taken), the Moon's apogee 406,700 km.
    const need: Partial<Record<PresetId, [number, number]>> = {
      inner: [10, 1.67 * AU_KM],
      outer: [10, 30.4 * AU_KM],
      heliopause: [10, 180 * AU_KM],
      "earth-moon": [399, 406_700],
    };
    for (const [id, [target, r]] of Object.entries(need) as [PresetId, [number, number]][]) {
      const c = presetCamera(id);
      expect(c.target, id).toBe(target);
      expect(halfView(c.distanceKm), id).toBeGreaterThanOrEqual(r);
      expect(halfView(c.distanceKm), id).toBeLessThan(r * 1.6); // and does not lose it in empty space
      expect(c.distanceKm).toBeLessThanOrEqual(MAX_DISTANCE_KM);
      expect(Math.abs(c.elevation)).toBeLessThanOrEqual(MAX_ELEVATION);
    }
  });
});
