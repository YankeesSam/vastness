import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tdbFromUtc } from "../../src/core/time/scales.ts";
import {
  HORIZONS_API,
  HorizonsError,
  canonicalQuery,
  parseVectors,
  queryUrl,
  secondsFromJdText,
  vectorParams,
} from "./horizons.ts";
import { FIXTURES } from "./record.ts";

// F1: responses recorded once by tools/ephem/record.ts (testdata/horizons).
const fixture = (name: string): string =>
  readFileSync(new URL(`../../testdata/horizons/${name}.json`, import.meta.url), "utf8");
const q = (name: string): string => canonicalQuery(vectorParams(FIXTURES[name]!));

function horizonsError(fn: () => unknown): HorizonsError {
  try {
    fn();
  } catch (e) {
    if (e instanceof HorizonsError) return e;
    throw e;
  }
  throw new Error("expected a HorizonsError");
}

describe("Horizons query builder (T-015)", () => {
  it("VN-DAT-001: a vector query is heliocentric-capable, ecliptic J2000 ICRF, km-s, geometric, TDB, CSV", () => {
    const p = vectorParams({ command: "399", center: "500@10", start: "2000-01-01", stop: "2000-01-02", step: "1 d" });
    expect(p).toMatchObject({
      COMMAND: "'399'",
      CENTER: "'500@10'",
      EPHEM_TYPE: "'VECTORS'",
      REF_PLANE: "'ECLIPTIC'",
      REF_SYSTEM: "'ICRF'",
      OUT_UNITS: "'KM-S'",
      VEC_TABLE: "'2'",
      VEC_CORR: "'NONE'",
      TIME_TYPE: "'TDB'",
      CSV_FORMAT: "'YES'",
      OBJ_DATA: "'NO'",
      STEP_SIZE: "'1 d'",
      format: "json",
    });
    expect(Object.keys(p)).toEqual([...Object.keys(p)].sort());
  });

  it("VN-DAT-001: the URL hits horizons.api with single-quoted, URL-encoded, sorted parameters", () => {
    const url = queryUrl(vectorParams(FIXTURES["moon-geocentric-2000-01"]!));
    expect(url.startsWith(`${HORIZONS_API}?CENTER='500%40399'&COMMAND='301'&`)).toBe(true);
    expect(url).toContain("STOP_TIME='2000-01-01%2006%3A00'");
    expect(url.endsWith("&format=json")).toBe(true);
    // Same query, same text, regardless of insertion order (the cache key, T-016).
    const p = vectorParams(FIXTURES["moon-geocentric-2000-01"]!);
    const shuffled = Object.fromEntries(Object.entries(p).reverse());
    expect(canonicalQuery(shuffled)).toBe(canonicalQuery(p));
  });
});

describe("Horizons response parser (T-015)", () => {
  it("VN-DAT-004: Earth from the Sun: header fields and every $$SOE/$$EOE record", () => {
    const r = parseVectors(fixture("earth-2000-01"), q("earth-2000-01"));
    expect(r.header).toEqual({
      target: "Earth (399)",
      center: "Sun (10)",
      source: "DE441",
      frame: "Ecliptic of J2000.0",
      timeScale: "TDB",
      apiVersion: "1.2",
    });
    expect(r.records).toHaveLength(4);
    const first = r.records[0]!;
    expect(first.jd).toBe("2451544.500000000");
    expect(first.t).toBe(-43200); // 2000-01-01 00:00 TDB is half a day before J2000
    expect(first.x).toBe(-2.521092855899356e7);
    expect(first.y).toBe(1.449279195838006e8);
    expect(first.z).toBe(-6.164165719002485e2);
    expect(first.vx).toBe(-2.983983333677879e1);
    expect(first.vz).toBe(6.168441184239981e-5);
    expect(r.records.map((x) => x.t)).toEqual([-43200, 43200, 129600, 216000]);
    // ~1 au and ~30 km/s: the units are km and km/s.
    expect(Math.hypot(first.x, first.y, first.z) / 149_597_870.7).toBeCloseTo(0.983, 3);
  });

  it("VN-DAT-004: Moon from Earth at 60 m steps: centre and hourly epochs from the JD text", () => {
    const r = parseVectors(fixture("moon-geocentric-2000-01"), q("moon-geocentric-2000-01"));
    expect(r.header.target).toBe("Moon (301)");
    expect(r.header.center).toBe("Earth (399)");
    expect(r.records).toHaveLength(7);
    // JD 2451544.541666667 printed to 9 digits: within 0.1 ms of 01:00 TDB.
    r.records.forEach((rec, i) => expect(Math.abs(rec.t - (-43200 + 3600 * i))).toBeLessThan(1e-4));
    const d = Math.hypot(r.records[0]!.x, r.records[0]!.y, r.records[0]!.z);
    expect(d).toBeGreaterThan(356_000);
    expect(d).toBeLessThan(407_000);
  });

  it("VN-DAT-004: a spacecraft's trajectory source comes from the header", () => {
    const r = parseVectors(fixture("voyager1-2000-01"), q("voyager1-2000-01"));
    expect(r.header.target).toBe("Voyager 1 (spacecraft) (-31)");
    expect(r.header.source).toBe("Voyager_1_ST+refit2022_m");
    expect(r.records).toHaveLength(3);
  });

  it("VN-DAT-004: an unknown ID is reported with the query", () => {
    const e = horizonsError(() => parseVectors(fixture("error-unknown-id"), q("error-unknown-id")));
    expect(e.kind).toBe("unknown-id");
    expect(e.message).toContain("9999999");
    expect(e.query).toBe(q("error-unknown-id"));
    expect(e.message).toContain(q("error-unknown-id"));
  });

  it("VN-DAT-004: no ephemeris for the span is reported with the query", () => {
    const e = horizonsError(() => parseVectors(fixture("error-no-ephemeris"), q("error-no-ephemeris")));
    expect(e.kind).toBe("no-ephemeris");
    expect(e.message).toContain('No ephemeris for target "Voyager 1 (spacecraft)" prior to A.D. 1977-SEP-05');
    expect(e.message).toContain("START_TIME='1950-01-01'");
  });

  it("VN-DAT-004: an ambiguous name (error text inside result, not the error field) is reported", () => {
    const e = horizonsError(() => parseVectors(fixture("error-ambiguous"), q("error-ambiguous")));
    expect(e.kind).toBe("ambiguous");
    expect(e.message).toContain("Multiple major-bodies match");
    expect(e.message).toContain("COMMAND='Mars'");
  });

  it("VN-DAT-004: malformed bodies fail as format errors, never as empty data", () => {
    expect(horizonsError(() => parseVectors("<html>503</html>", "x")).kind).toBe("format");
    expect(horizonsError(() => parseVectors(JSON.stringify({ result: "$$SOE\n$$EOE" }), "x")).kind).toBe("format");
    const bad = JSON.stringify({
      result: "Target body name: A (1)\nCenter body name: B (2)\n$$SOE\n2451545.0, A.D., 1, 2, x, 4, 5, 6,\n$$EOE",
    });
    expect(horizonsError(() => parseVectors(bad, "x")).kind).toBe("format");
  });

  it("VN-EPH-001: JD text to TDB seconds is exact to the printed digits (no float-JD round-off)", () => {
    expect(secondsFromJdText("2451545.000000000")).toBe(0);
    expect(secondsFromJdText("2451545.5")).toBe(43200);
    expect(secondsFromJdText("2415020.500000000")).toBe((2415020.5 - 2451545) * 86400);
    expect(secondsFromJdText("2457754.000000000")).toBe(6209 * 86400); // 2016-12-31 12:00 TDB
    expect(() => secondsFromJdText("A.D. 2000")).toThrow(RangeError);
    // A float JD would lose ~20 us at this date; the text path keeps the 1 us digit.
    const t = secondsFromJdText("2460000.123456789");
    expect(Math.abs(t - ((2460000 - 2451545) * 86400 + 0.123456789 * 86400))).toBeLessThan(1e-6);
    expect(tdbFromUtc(2000, 1, 1, 0)).not.toBe(secondsFromJdText("2451544.5")); // UTC is not TDB
  });
});
