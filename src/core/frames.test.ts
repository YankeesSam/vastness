import { describe, expect, it } from "vitest";
import { AU_KM, BODIES, C_KM_S, OBLIQUITY_J2000_ARCSEC, type BodyId } from "./constants";
import {
  auFromKm,
  cross,
  distance,
  eclipticFromEquatorial,
  equatorialFromEcliptic,
  kmFromAu,
  lightTimeSeconds,
  norm,
  sceneFromEcliptic,
  vec3,
} from "./frames";

describe("constants (ADR-0003)", () => {
  it("VN-SCN-001: au is the IAU 2012 defined value and c the SI value", () => {
    expect(AU_KM).toBe(149_597_870.7);
    expect(C_KM_S).toBe(299_792.458);
    expect(OBLIQUITY_J2000_ARCSEC).toBe(84381.448);
  });

  it("VN-SCN-001: the Sun, the eight planets and the Moon have mean radius, GM and a cited source", () => {
    const ids: BodyId[] = [10, 199, 299, 399, 301, 499, 599, 699, 799, 899];
    expect(
      Object.keys(BODIES)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      const b = BODIES[id];
      expect(b.horizonsId).toBe(id);
      expect(b.radiusKm).toBeGreaterThan(1000);
      expect(b.gmKm3S2).toBeGreaterThan(1000);
      expect(b.radiusSource).toMatch(/IAU/);
      expect(b.gmSource).toMatch(/DE440/);
    }
    // Ordering sanity against well-known facts: the Sun is largest, Jupiter the largest planet, the Moon smallest.
    const r = (id: BodyId) => BODIES[id].radiusKm;
    expect(r(10)).toBe(695_700); // IAU 2015 Resolution B3 nominal solar radius
    expect(r(599)).toBeGreaterThan(r(699));
    expect(r(301)).toBeLessThan(r(199));
    expect(r(399)).toBeCloseTo(6371.0, 0);
  });

  it("VN-SCN-001: the Sun's GM gives Earth a sidereal year of 365.256 days at 1 au (Kepler's third law)", () => {
    const gm = BODIES[10].gmKm3S2 + BODIES[399].gmKm3S2 + BODIES[301].gmKm3S2;
    const periodDays = (2 * Math.PI * Math.sqrt(AU_KM ** 3 / gm)) / 86400;
    expect(periodDays).toBeCloseTo(365.256, 1);
  });
});

describe("frames (ecliptic J2000, km)", () => {
  it("VN-SCN-001: km <-> au and light-time", () => {
    expect(auFromKm(AU_KM)).toBe(1);
    expect(kmFromAu(2.5)).toBe(2.5 * AU_KM);
    // 1 au of light-time is 499.004784 s (IAU).
    expect(lightTimeSeconds(AU_KM)).toBeCloseTo(499.004784, 6);
  });

  it("vector helpers", () => {
    const a = vec3(3, 4, 12);
    expect(norm(a)).toBe(13);
    expect(distance(a, vec3(0, 0, 0))).toBe(13);
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
  });

  it("VN-SCN-001: the one ecliptic to scene conversion is (x, y, z) -> (x, z, -y), right-handed and y-up", () => {
    const out = new Float64Array(3);
    sceneFromEcliptic(vec3(1, 2, 3), out);
    expect(Array.from(out)).toEqual([1, 3, -2]);
    // The ecliptic north pole points up (+y) in the scene.
    sceneFromEcliptic(vec3(0, 0, 1), out);
    expect(Array.from(out, (c) => c + 0)).toEqual([0, 1, 0]); // + 0 folds -0

    // Handedness: x cross y = z holds after mapping each axis.
    const map = (v: Float64Array) => {
      const o = new Float64Array(3);
      sceneFromEcliptic(v, o);
      return o;
    };
    const ex = map(vec3(1, 0, 0));
    const ey = map(vec3(0, 1, 0));
    const ez = map(vec3(0, 0, 1));
    expect(Array.from(cross(ex, ey), (c) => c + 0)).toEqual(Array.from(ez, (c) => c + 0));
  });

  it("VN-SCN-001: the output stays float64 (no float32 positions in the core)", () => {
    const out = new Float64Array(3);
    sceneFromEcliptic(vec3(1.5e10 + 0.123, 0, 0), out);
    expect(out[0]).toBe(1.5e10 + 0.123);
  });

  it("ecliptic <-> equatorial J2000 by the obliquity 84381.448 arcsec", () => {
    const eps = (OBLIQUITY_J2000_ARCSEC / 3600) * (Math.PI / 180);
    // The equatorial north pole in ecliptic coordinates is (0, sin eps, cos eps).
    const pole = eclipticFromEquatorial(vec3(0, 0, 1));
    expect(pole[0]).toBe(0);
    expect(pole[1]).toBeCloseTo(Math.sin(eps), 15);
    expect(pole[2]).toBeCloseTo(Math.cos(eps), 15);
    // The vernal equinox is common to both.
    expect(Array.from(eclipticFromEquatorial(vec3(1, 0, 0)))).toEqual([1, 0, 0]);
    const v = vec3(1.2e8, -3.4e7, 5.6e6);
    const back = equatorialFromEcliptic(eclipticFromEquatorial(v));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(v[i]!, 6);
  });
});
