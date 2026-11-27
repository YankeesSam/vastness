import { describe, expect, it } from "vitest";
import { LOAD_PX, RELEASE_PX, radiusPx, TEXTURED_BODIES, wantTexture } from "./materials";

describe("body textures on demand", () => {
  it("VN-SCN-006: the planets and the Moon have maps, the Sun does not", () => {
    expect([...TEXTURED_BODIES].sort((a, b) => a - b)).toEqual([199, 299, 301, 399, 499, 599, 699, 799, 899]);
  });

  it("VN-PRF-002: a map is held from LOAD_PX of drawn radius and let go below RELEASE_PX", () => {
    expect(wantTexture(LOAD_PX - 0.1, false)).toBe(false);
    expect(wantTexture(LOAD_PX, false)).toBe(true);
    expect(wantTexture(RELEASE_PX + 0.1, true)).toBe(true);
    expect(wantTexture(RELEASE_PX - 0.1, true)).toBe(false);
  });

  it("VN-PRF-002: drawn radius in pixels: Earth from 1 AU is sub-pixel, from the Earth and Moon view it is large", () => {
    expect(radiusPx(6371, 1.496e8, 50, 800)).toBeLessThan(0.1);
    // 400,000 km away with a 50 degree field and 800 px: about 14 px
    expect(radiusPx(6371, 4e5, 50, 800)).toBeCloseTo(13.7, 0);
    expect(radiusPx(6371, 6000, 50, 800)).toBe(Infinity);
  });
});
