import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSolarWind, hourlySolarWind, planetaryKp } from "./parse";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../testdata/swpc/${name}`, import.meta.url), "utf8"));
const wind = fixture("rtsw_wind_1m.json") as Array<Record<string, unknown>>;
const mag = fixture("rtsw_mag_1m.json") as Array<Record<string, unknown>>;

describe("SWPC solar wind (T-102)", () => {
  it("VN-EXT-007: hourly means of the active spacecraft's good minutes only", () => {
    const hours = hourlySolarWind(wind, mag);
    expect(hours.map((h) => h.t)).toEqual(["2026-11-27T22:00Z", "2026-11-27T23:00Z"]);
    const rows = wind.filter((r) => r.active === true && String(r.time_tag).startsWith("2026-11-27T22"));
    const expected = rows.reduce((s, r) => s + (r.proton_speed as number), 0) / rows.length;
    expect(hours[0]!.speed).toBeCloseTo(expected, 1);
    expect(hours[0]!.minutes).toBe(60);
    // Only the operational spacecraft: the others SWPC also serves are left out.
    expect(hours[0]!.source).toBe("SOLAR1");
    const bz = mag.filter((r) => r.active === true && String(r.time_tag).startsWith("2026-11-27T23"));
    expect(hours[1]!.bz).toBeCloseTo(bz.reduce((s, r) => s + (r.bz_gsm as number), 0) / bz.length, 2);
  });

  it("VN-EXT-007: a minute that is inactive or flagged is not counted", () => {
    const flagged = wind.map((r) => ({ ...r, overall_quality: 1 }));
    expect(hourlySolarWind(flagged, []).length).toBe(0);
  });

  it("VN-EXT-007: planetary Kp, 3-hourly, sorted, with the spans recorded", () => {
    const kp = planetaryKp(fixture("noaa-planetary-k-index.json"));
    expect(kp[0]).toEqual(["2026-11-21T00:00Z", 2.67]);
    expect(kp.length).toBeGreaterThan(40);
    const f = buildSolarWind(
      { wind, mag, kp: fixture("noaa-planetary-k-index.json") },
      { retrieved: "2026-11-28", source: "s", credit: "c" },
    );
    expect(f.span).toEqual({ start: "2026-11-27T22:00Z", end: "2026-11-27T23:00Z" });
    expect(f.kpSpan.start).toBe("2026-11-21T00:00Z");
  });
});
