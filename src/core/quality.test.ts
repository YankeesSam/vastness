import { describe, expect, it } from "vitest";
import { chooseTier, QUALITY, QUALITY_TIERS, resolveTier, type DeviceInfo } from "./quality";

const desktop: DeviceInfo = { pixelRatio: 1, cores: 16, memoryGb: 8, maxTextureSize: 16384, coarsePointer: false };
const phone: DeviceInfo = { pixelRatio: 3, cores: 8, memoryGb: 4, maxTextureSize: 4096, coarsePointer: true };

describe("quality tiers", () => {
  it("VN-PRF-003: three tiers, each step up costs at least as much in every setting", () => {
    expect(QUALITY_TIERS).toEqual(["low", "medium", "high"]);
    for (let i = 1; i < QUALITY_TIERS.length; i++) {
      const lo = QUALITY[QUALITY_TIERS[i - 1]!];
      const hi = QUALITY[QUALITY_TIERS[i]!];
      expect(hi.maxPixelRatio).toBeGreaterThanOrEqual(lo.maxPixelRatio);
      expect(hi.textureSize).toBeGreaterThanOrEqual(lo.textureSize);
      expect(hi.trailPoints).toBeGreaterThan(lo.trailPoints);
      expect(hi.starMagLimit).toBeGreaterThan(lo.starMagLimit);
    }
    // the high tier is what the app drew before tiers existed: every star to V 6.5, 2049-point trails
    expect(QUALITY.high.starMagLimit).toBe(6.5);
    expect(QUALITY.high.trailPoints).toBe(2049);
    // trails need room for 64 base intervals a side plus the ends
    expect(QUALITY.low.trailPoints).toBeGreaterThan(2 * 64 + 3);
  });

  it("VN-PRF-003: a desktop with a capable GPU gets high, a phone gets low", () => {
    expect(chooseTier(desktop)).toBe("high");
    expect(chooseTier(phone)).toBe("low");
  });

  it("VN-PRF-003: a small GPU texture limit or few cores means low; unknown memory is not held against the device", () => {
    expect(chooseTier({ ...desktop, maxTextureSize: 2048 })).toBe("low");
    expect(chooseTier({ ...desktop, cores: 2 })).toBe("low");
    expect(chooseTier({ ...desktop, memoryGb: undefined })).toBe("high");
  });

  it("VN-PRF-003: middling devices get medium", () => {
    expect(chooseTier({ ...desktop, cores: 3 })).toBe("medium");
    expect(chooseTier({ ...desktop, cores: 4 })).toBe("high"); // a 4-core desktop (and the CI runner)
    expect(chooseTier({ ...desktop, memoryGb: 4 })).toBe("medium");
    expect(chooseTier({ ...desktop, maxTextureSize: 4096 })).toBe("medium");
    expect(chooseTier({ ...phone, memoryGb: 8, cores: 8 })).toBe("medium"); // a strong tablet
  });

  it("VN-PRF-003, VN-UI-003: a tier chosen in settings wins over the device; auto uses the device", () => {
    expect(resolveTier("auto", phone)).toBe("low");
    expect(resolveTier("high", phone)).toBe("high");
    expect(resolveTier("low", desktop)).toBe("low");
  });
});
