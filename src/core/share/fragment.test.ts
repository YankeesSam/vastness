import { describe, expect, it } from "vitest";
import { MAX_DISTANCE_KM } from "../camera/orbit";
import { PLANET_COVERAGE } from "../time/clock";
import { parseUtc } from "../time/scales";
import { decodeFragment, encodeFragment, FRAGMENT_VERSION, type ViewFragment } from "./fragment";

const known = (id: number) => [10, 399, 499, -31, -100025544].includes(id);
const DEG = Math.PI / 180;

const view: ViewFragment = {
  t: parseUtc("2026-01-01T12:34:56.789Z"),
  rate: 86400,
  paused: true,
  selection: -31,
  cam: { target: 399, distanceKm: 1.2e6, azimuth: 30 * DEG, elevation: -25 * DEG },
  layers: {
    bodies: true,
    textures: false,
    labels: false,
    markers: true,
    orbits: true,
    trails: false,
    callouts: false,
    stars: true,
  },
};

describe("view fragment", () => {
  it("VN-UI-002: encodes the view compactly and readably, version first", () => {
    const s = encodeFragment(view);
    expect(s).toBe("v=1&t=2026-01-01T12:34:56.789Z&r=86400&p=1&s=-31&c=399,1200000,30,-25&l=bmos");
    expect(s.length).toBeLessThan(120);
    expect(FRAGMENT_VERSION).toBe(1);
  });

  it("VN-UI-002: round-trips time to the millisecond and the camera to 1e-6 relative", () => {
    const odd: ViewFragment = {
      ...view,
      t: parseUtc("1977-09-05T12:56:00.123Z") + 0.0004,
      rate: -3600,
      paused: false,
      selection: null,
      cam: { target: -100025544, distanceKm: 123.456789e3, azimuth: 1.234567, elevation: 0.5 },
    };
    const back = decodeFragment(encodeFragment(odd), known);
    expect(Math.abs(back.t! - odd.t)).toBeLessThan(1e-3);
    expect(back.rate).toBe(-3600);
    expect(back.paused).toBe(false);
    expect(back.selection).toBeNull();
    expect(back.cam!.target).toBe(-100025544);
    expect(back.cam!.distanceKm / odd.cam!.distanceKm - 1).toBeLessThan(1e-6);
    expect(Math.abs(back.cam!.azimuth - 1.234567)).toBeLessThan(1e-6);
    expect(back.layers).toEqual(view.layers);
  });

  it("VN-UI-002: a leading # and URI escapes are accepted", () => {
    expect(decodeFragment(`#${encodeFragment(view)}`, known).selection).toBe(-31);
    expect(decodeFragment("#v=1&t=2026-01-01T00%3A00%3A00Z", known).t).toBe(parseUtc("2026-01-01T00:00:00Z"));
  });

  it("VN-UI-002: every field is validated on its own; bad ones are dropped, good ones kept", () => {
    const d = decodeFragment("v=1&t=2026-02-30T00:00:00Z&r=1e99&p=yes&s=12345&c=399,-5,0,0&l=bxz&extra=1", known);
    expect(d).toEqual({
      layers: {
        bodies: true,
        textures: false,
        labels: false,
        markers: false,
        orbits: false,
        trails: false,
        callouts: false,
        stars: false,
      },
    });
    expect(decodeFragment("v=1&s=499&c=999,1e6,0,0", known)).toEqual({ selection: 499 });
    expect(decodeFragment(`v=1&c=399,${MAX_DISTANCE_KM * 10},0,0`, known)).toEqual({});
    expect(decodeFragment("v=1&c=399,1e6,0,95", known).cam!.elevation).toBeCloseTo(89 * DEG, 12); // clamped
    expect(decodeFragment("v=1&t=1850-01-01T00:00:00Z", known)).toEqual({}); // outside the planets' coverage
    expect(decodeFragment("v=1&l=", known).layers).toEqual({
      bodies: false,
      textures: false,
      labels: false,
      markers: false,
      orbits: false,
      trails: false,
      callouts: false,
      stars: false,
    });
  });

  it("VN-UI-002: an unknown version, a missing version or junk gives nothing", () => {
    expect(decodeFragment("v=2&t=2026-01-01T00:00:00Z", known)).toEqual({});
    expect(decodeFragment("t=2026-01-01T00:00:00Z", known)).toEqual({});
    expect(decodeFragment("", known)).toEqual({});
    expect(decodeFragment("#%E0%A4%A", known)).toEqual({});
    expect(decodeFragment("x".repeat(5000), known)).toEqual({});
  });

  it("VN-UI-002: the time stays inside the planets' coverage at both ends", () => {
    const end = decodeFragment(encodeFragment({ ...view, t: PLANET_COVERAGE.end }), known).t!;
    expect(Math.abs(end - PLANET_COVERAGE.end)).toBeLessThan(1e-3);
  });

  it("VN-SCL-002: exaggerated scale is x=e; true scale leaves the field out, and old links open in true scale", () => {
    const s = encodeFragment({ ...view, scale: "exaggerated" });
    expect(s.endsWith("&x=e")).toBe(true);
    expect(decodeFragment(s, known).scale).toBe("exaggerated");
    expect(encodeFragment({ ...view, scale: "true" })).toBe(encodeFragment(view));
    expect(decodeFragment(encodeFragment(view), known).scale).toBeUndefined();
    expect(decodeFragment("v=1&x=t", known).scale).toBe("true");
    expect(decodeFragment("v=1&x=huge", known).scale).toBeUndefined();
  });
});
