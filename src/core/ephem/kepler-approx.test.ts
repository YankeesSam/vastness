import { describe, expect, it } from "vitest";
import { AU_KM } from "../constants";
import { parseUtc, tdbFromJd } from "../time/scales";
import { KEPLER_APPROX_END, KEPLER_APPROX_START, PLANET_IDS, approxPlanetState, solveKepler } from "./kepler-approx";

// References are independent of this code: published event dates (equinox, opposition, perihelion) and the
// physics every orbit must obey. Positions agree with Horizons only to the approximation's stated error
// (ssd.jpl.nasa.gov/planets/approx_pos.html), which is why the UI flags them approximate (VN-EPH-006).

const DEG = Math.PI / 180;
const state = (id: (typeof PLANET_IDS)[number], tdb: number) => {
  const out = new Float64Array(6);
  expect(approxPlanetState(id, tdb, out)).toBe(true);
  return out;
};
const lon = (s: Float64Array) => (((Math.atan2(s[1]!, s[0]!) / DEG) % 360) + 360) % 360;
const r = (s: Float64Array) => Math.hypot(s[0]!, s[1]!, s[2]!);

describe("Kepler's equation", () => {
  it("VN-EPH-006: solves M = E - e sin E to 1e-12 rad from e = 0 to 0.97", () => {
    for (const e of [0, 0.0167, 0.2056, 0.5, 0.9, 0.97]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.137) {
        const E = solveKepler(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12);
      }
    }
  });
});

describe("Standish approximate planet positions (Table 2a/2b, 3000 BC to 3000 AD)", () => {
  it("VN-EPH-006: covers 3000 BC to 3000 AD and refuses outside it", () => {
    const out = new Float64Array(6);
    expect(KEPLER_APPROX_START).toBeLessThan(parseUtc("1900-01-01"));
    expect(KEPLER_APPROX_END).toBeGreaterThan(parseUtc("2100-01-01"));
    expect(approxPlanetState(499, KEPLER_APPROX_END + 86400, out)).toBe(false);
    expect(approxPlanetState(499, KEPLER_APPROX_START - 86400, out)).toBe(false);
    expect(approxPlanetState(499, parseUtc("1850-06-01"), out)).toBe(true);
    expect(approxPlanetState(499, parseUtc("2150-06-01"), out)).toBe(true);
  });

  it("VN-EPH-006: Earth is heliocentric longitude 180 deg at the March equinox 2000-03-20T07:35 UTC", () => {
    expect(lon(state(399, parseUtc("2000-03-20T07:35:00Z")))).toBeCloseTo(180, 1);
  });

  it("VN-EPH-006: Earth's perihelion (0.98329 au, early January) and aphelion (1.01671 au, early July)", () => {
    // 2000: perihelion 2000-01-03, aphelion 2000-07-04 (EM barycentre: close to Earth's dates).
    const peri = r(state(399, parseUtc("2000-01-03T05:00:00Z"))) / AU_KM;
    const aph = r(state(399, parseUtc("2000-07-04T00:00:00Z"))) / AU_KM;
    expect(peri).toBeCloseTo(0.98329, 3);
    expect(aph).toBeCloseTo(1.01671, 3);
  });

  it("VN-EPH-006: Earth and Mars share heliocentric longitude at the 2003-08-28 opposition", () => {
    const t = parseUtc("2003-08-28T18:00:00Z");
    const d = lon(state(499, t)) - lon(state(399, t));
    expect(Math.abs(((d + 540) % 360) - 180)).toBeLessThan(0.1);
  });

  it("VN-EPH-006: every planet stays between perihelion and aphelion, near the ecliptic, at its orbital speed", () => {
    const GM_SUN = 132_712_440_041.279419;
    const a: Record<number, number> = {
      199: 0.387,
      299: 0.723,
      399: 1,
      499: 1.524,
      599: 5.2,
      699: 9.54,
      799: 19.19,
      899: 30.07,
    };
    for (const id of PLANET_IDS) {
      // 1700, 1899-12-31, 2100-01-02, 2400 and 500 BC (JD 1538432.5).
      for (const t of [
        parseUtc("1700-01-01"),
        parseUtc("1899-12-31"),
        parseUtc("2100-01-02"),
        parseUtc("2400-07-01"),
        tdbFromJd(1538432.5),
      ]) {
        const s = state(id, t);
        const rr = r(s);
        const ratio = rr / (a[id]! * AU_KM);
        expect(ratio).toBeGreaterThan(0.75);
        expect(ratio).toBeLessThan(1.25);
        expect(Math.abs(Math.asin(s[2]! / rr))).toBeLessThan(8 * DEG);
        // Vis-viva: v^2 = GM (2/r - 1/a), within the approximation.
        const v = Math.hypot(s[3]!, s[4]!, s[5]!);
        const vv = Math.sqrt(GM_SUN * (2 / rr - 1 / (a[id]! * AU_KM)));
        expect(v / vv).toBeCloseTo(1, 1);
      }
    }
  });

  it("VN-EPH-006: Jupiter returns to the same longitude after its 11.862-year sidereal period", () => {
    const t = parseUtc("2150-01-01");
    const later = t + 11.862 * 365.25 * 86400;
    const d = lon(state(599, later)) - lon(state(599, t));
    expect(Math.abs(((d + 540) % 360) - 180)).toBeLessThan(1);
  });

  it("VN-EPH-006: velocity is the derivative of position", () => {
    const t = parseUtc("1850-01-01");
    const h = 600;
    const a = state(699, t - h);
    const b = state(699, t + h);
    const s = state(699, t);
    for (let i = 0; i < 3; i++) expect(s[3 + i]).toBeCloseTo((b[i]! - a[i]!) / (2 * h), 4);
  });
});
