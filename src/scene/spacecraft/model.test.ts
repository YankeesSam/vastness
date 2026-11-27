import { describe, expect, it } from "vitest";
import { markerShown, pixelRadius } from "../../core/labels/declutter";
import { drawnRadiusKm, MODEL_ICON_RADIUS_PX, MODEL_RANGE_KM, modelShown } from "./model";
import { SPACECRAFT_RADIUS_KM } from "../bodies/positions";

const FOV = (50 * Math.PI) / 180;
const H = 800;

describe("spacecraft model sizing", () => {
  it("VN-CAT-006: the model shows within 10,000 km and not beyond", () => {
    expect(MODEL_RANGE_KM).toBe(10_000);
    expect(modelShown(9_999)).toBe(true);
    expect(modelShown(10_000)).toBe(true);
    expect(modelShown(10_001)).toBe(false);
    expect(modelShown(1.5e6)).toBe(false);
  });

  it("VN-CAT-006: beyond range the spacecraft keeps its true size, so its marker shows", () => {
    const r = drawnRadiusKm(50_000, FOV, H);
    expect(r).toBe(SPACECRAFT_RADIUS_KM);
    expect(markerShown(pixelRadius(r, 50_000, FOV, H))).toBe(true);
  });

  it("VN-CAT-006: in range it is at least an icon-sized model, and the marker gives way to it", () => {
    for (const d of [10_000, 1_000, 10, 0.5]) {
      const r = drawnRadiusKm(d, FOV, H);
      const px = pixelRadius(r, d, FOV, H);
      expect(px).toBeGreaterThanOrEqual(MODEL_ICON_RADIUS_PX * 0.99);
      expect(markerShown(px)).toBe(false);
    }
  });

  it("VN-CAT-006: close up the true size wins over the icon size", () => {
    expect(drawnRadiusKm(0.02, FOV, H)).toBe(SPACECRAFT_RADIUS_KM); // the fly-to framing distance
  });
});
