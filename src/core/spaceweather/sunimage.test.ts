import { describe, expect, it } from "vitest";
import { nearestIndex, outlineRadius } from "./sunimage";

describe("Sun image (T-104)", () => {
  it("VN-EXT-009: the image nearest the time, ends included", () => {
    const t = [0, 10, 20];
    expect(nearestIndex(t, -5)).toBe(0);
    expect(nearestIndex(t, 4)).toBe(0);
    expect(nearestIndex(t, 6)).toBe(1);
    expect(nearestIndex(t, 99)).toBe(2);
    expect(nearestIndex([], 1)).toBe(-1);
  });

  it("VN-EXT-009: the disc in front of the Sun covers its outline as seen from the camera", () => {
    const r = 695_700;
    const d = 1.2e7;
    const disc = outlineRadius(r, d);
    // the disc at d - r and the sphere's limb subtend the same angle from the camera
    expect(Math.atan(disc / (d - r))).toBeCloseTo(Math.asin(r / d), 12);
    expect(outlineRadius(r, 1e12)).toBeCloseTo(r, 0);
  });
});
