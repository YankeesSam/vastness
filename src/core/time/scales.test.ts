import { describe, expect, it } from "vitest";
import { LEAP_SECONDS, LEAP_SECONDS_SOURCE, LEAP_SECONDS_VALID_UNTIL } from "./leap-seconds";
import {
  J2000_JD,
  calendarToJd,
  formatUtc,
  jdTdb,
  parseUtc,
  taiMinusUtc,
  tdbFromJd,
  tdbFromTt,
  tdbMinusTt,
  ttFromTdb,
  ttFromUtc,
  utcFromTt,
} from "./scales";

// Reference values are from IERS and the Astronomical Almanac, or from an independent series
// (SOFA test values), never from this module's own output.

/** Astronomical Almanac two-term TDB - TT (good to about 50 microseconds over 1900-2100), a sanity bound only. */
function tdbMinusTtAlmanac(tt: number): number {
  const g = ((357.53 + 0.98560028 * (tt / 86400)) * Math.PI) / 180;
  return 0.001657 * Math.sin(g) + 0.000014 * Math.sin(2 * g);
}

describe("leap-second table (IERS Bulletin C)", () => {
  it("VN-EPH-001: matches IERS Leap_Second.dat (Bulletin C 72): 28 entries from 10 s in 1972 to 37 s in 2017", () => {
    expect(LEAP_SECONDS).toHaveLength(28);
    expect(LEAP_SECONDS[0]).toEqual({ year: 1972, month: 1, taiMinusUtc: 10 });
    expect(LEAP_SECONDS[1]).toEqual({ year: 1972, month: 7, taiMinusUtc: 11 });
    expect(LEAP_SECONDS[13]).toEqual({ year: 1985, month: 7, taiMinusUtc: 23 });
    expect(LEAP_SECONDS[23]).toEqual({ year: 2006, month: 1, taiMinusUtc: 33 });
    expect(LEAP_SECONDS.at(-1)).toEqual({ year: 2017, month: 1, taiMinusUtc: 37 });
    for (let i = 1; i < LEAP_SECONDS.length; i++) {
      expect(LEAP_SECONDS[i]!.taiMinusUtc - LEAP_SECONDS[i - 1]!.taiMinusUtc).toBe(1);
    }
    expect(LEAP_SECONDS_VALID_UNTIL).toBe("2027-06-28");
    expect(LEAP_SECONDS_SOURCE).toContain("Bulletin C 72");
  });

  it("VN-EPH-001: TAI-UTC by UTC month (entries start on the 1st), 10 s before 1972 (approximate), 37 s after the last entry", () => {
    expect(taiMinusUtc(1999, 1)).toBe(32);
    expect(taiMinusUtc(1998, 12)).toBe(31);
    expect(taiMinusUtc(2016, 12)).toBe(36);
    expect(taiMinusUtc(2017, 1)).toBe(37);
    expect(taiMinusUtc(2090, 6)).toBe(37);
    expect(taiMinusUtc(1950, 1)).toBe(10);
  });
});

describe("Julian dates", () => {
  it("VN-EPH-001: calendar to JD: J2000, the MJD epoch and the Unix epoch", () => {
    expect(calendarToJd(2000, 1, 1, 12 * 3600)).toBe(2451545.0);
    expect(calendarToJd(1858, 11, 17, 0)).toBe(2400000.5);
    expect(calendarToJd(1970, 1, 1, 0)).toBe(2440587.5);
    expect(calendarToJd(1900, 1, 1, 0)).toBe(2415020.5);
    expect(calendarToJd(2100, 1, 1, 0)).toBe(2488069.5);
    expect(J2000_JD).toBe(2451545.0);
  });

  it("VN-EPH-001: JD(TDB) and TDB seconds since J2000 round-trip", () => {
    expect(jdTdb(0)).toBe(2451545.0);
    expect(jdTdb(86400)).toBe(2451546.0);
    expect(tdbFromJd(2451545.5)).toBe(43200);
    expect(tdbFromJd(jdTdb(1.23456789e9))).toBeCloseTo(1.23456789e9, 4);
  });
});

describe("UTC, TAI, TT", () => {
  it("VN-EPH-001: J2000.0 (2000-01-01T12:00:00 TT) is 2000-01-01T11:58:55.816 UTC", () => {
    expect(ttFromUtc(2000, 1, 1, 11 * 3600 + 58 * 60 + 55.816)).toBeCloseTo(0, 9);
  });

  it("VN-EPH-001: 2017-01-01T00:00:00 UTC is 2017-01-01T00:01:09.184 TT", () => {
    const tt = ttFromUtc(2017, 1, 1, 0);
    // 6210 days after 2000-01-01, minus the 12 h to J2000, plus 69.184 s.
    expect(tt).toBeCloseTo(6210 * 86400 - 43200 + 69.184, 6);
  });

  it("VN-EPH-001: 2016-12-31T23:59:60 UTC exists, one second before 2017-01-01T00:00:00", () => {
    const leap = ttFromUtc(2016, 12, 31, 86400);
    const before = ttFromUtc(2016, 12, 31, 86399);
    const after = ttFromUtc(2017, 1, 1, 0);
    expect(leap - before).toBeCloseTo(1, 9);
    expect(after - leap).toBeCloseTo(1, 9);
  });

  it("VN-EPH-001: TT back to UTC labels the leap second as second 60", () => {
    expect(utcFromTt(ttFromUtc(2016, 12, 31, 86400.5))).toEqual({ year: 2016, month: 12, day: 31, seconds: 86400.5 });
    const u = utcFromTt(ttFromUtc(2017, 1, 1, 0.25));
    expect(u.year).toBe(2017);
    expect(u.month).toBe(1);
    expect(u.day).toBe(1);
    expect(u.seconds).toBeCloseTo(0.25, 6);
    const v = utcFromTt(ttFromUtc(1985, 6, 30, 86399.75));
    expect([v.year, v.month, v.day]).toEqual([1985, 6, 30]);
    expect(v.seconds).toBeCloseTo(86399.75, 6);
  });

  it("VN-EPH-001: UTC -> TT -> UTC round-trips across 1900-2100", () => {
    for (let year = 1900; year <= 2100; year += 7) {
      for (const [month, day, s] of [
        [1, 1, 0],
        [6, 30, 86399.5],
        [12, 31, 43210.125],
      ] as const) {
        const u = utcFromTt(ttFromUtc(year, month, day, s));
        expect([u.year, u.month, u.day]).toEqual([year, month, day]);
        expect(u.seconds).toBeCloseTo(s, 5);
      }
    }
  });
});

describe("TDB", () => {
  it("VN-EPH-001: TDB - TT matches the SOFA iauDtdb reference value within 30 microseconds", () => {
    // SOFA t_sofa_c.c: iauDtdb(2448939.5, 0.123, 0.76543, 5.0123, 5525.242, 3190.0) = -0.1280368005936998991e-2 s.
    // The topocentric terms in that value are under 2 microseconds.
    const t = (2448939.5 - 2451545.0 + 0.123) * 86400;
    expect(Math.abs(tdbMinusTt(t) - -0.1280368005936998991e-2)).toBeLessThan(30e-6);
  });

  it("VN-EPH-001: TDB - TT stays within 50 microseconds of the Almanac two-term formula over 1900-2100", () => {
    let worst = 0;
    for (let tt = -3.2e9; tt <= 3.2e9; tt += 1.1e6) {
      worst = Math.max(worst, Math.abs(tdbMinusTt(tt) - tdbMinusTtAlmanac(tt)));
    }
    expect(worst).toBeLessThan(50e-6);
  });

  it("VN-EPH-001: TT <-> TDB round-trips to a nanosecond and the difference stays under 1.7 ms", () => {
    for (let tt = -3.2e9; tt <= 3.2e9; tt += 9.7e6) {
      const tdb = tdbFromTt(tt);
      expect(Math.abs(tdb - tt)).toBeLessThan(1.7e-3);
      expect(Math.abs(ttFromTdb(tdb) - tt)).toBeLessThan(1e-9 * Math.max(1, Math.abs(tt) / 1e6));
    }
  });
});

describe("ISO parse and format (UTC at the edge, TDB inside)", () => {
  it("VN-EPH-001: parse and format round-trip, including the leap second", () => {
    for (const iso of [
      "2000-01-01T11:58:55.816Z",
      "2016-12-31T23:59:60.000Z",
      "2017-01-01T00:00:00.000Z",
      "1977-09-05T12:56:00.000Z",
      "1900-01-01T00:00:00.000Z",
      "2099-12-31T23:59:59.999Z",
    ]) {
      expect(formatUtc(parseUtc(iso))).toBe(iso);
    }
  });

  it("VN-EPH-001: parse accepts a date, minutes, no Z and fractions; J2000 TT lands at TDB about zero", () => {
    expect(parseUtc("2000-01-01T11:58:55.816Z")).toBeCloseTo(tdbMinusTt(0), 9);
    expect(parseUtc("2017-01-01")).toBe(parseUtc("2017-01-01T00:00:00Z"));
    expect(parseUtc("2017-01-01T00:00")).toBe(parseUtc("2017-01-01T00:00:00.000Z"));
    expect(parseUtc("2017-01-01T00:00:00.5Z") - parseUtc("2017-01-01T00:00:00Z")).toBeCloseTo(0.5, 6);
  });

  it("VN-EPH-001: parse rejects malformed text, impossible dates and a second 60 outside a leap second", () => {
    for (const bad of [
      "",
      "2017-13-01",
      "2017-02-29",
      "2017-01-01T24:00:00Z",
      "2017-01-01T00:60:00Z",
      "2017-06-30T23:59:60Z",
      "2016-12-31T23:58:60Z",
      "2017-01-01T00:00:00+01:00",
      "17-01-01",
    ]) {
      expect(() => parseUtc(bad), bad).toThrow(RangeError);
    }
    expect(parseUtc("2016-02-29")).toBeTypeOf("number");
  });

  it("VN-EPH-001: format rounds with carry into the next day and month", () => {
    const t = parseUtc("2017-01-31T23:59:59.9996Z");
    expect(formatUtc(t)).toBe("2017-02-01T00:00:00.000Z");
    expect(formatUtc(t, 0)).toBe("2017-02-01T00:00:00Z");
    expect(formatUtc(parseUtc("2016-12-31T23:59:60.9996Z"))).toBe("2017-01-01T00:00:00.000Z");
    expect(formatUtc(parseUtc("2016-12-31T23:59:59.9996Z"))).toBe("2016-12-31T23:59:60.000Z");
  });
});
