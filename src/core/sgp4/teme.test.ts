import { describe, expect, it } from "vitest";
import { temeToJ2000 } from "./teme";

// Reference: Vallado, Fundamentals of Astrodynamics and Applications (4th ed.), Example 3-15: a TEME position on
// 2004 April 6 07:51:28.386009 UTC (TT Julian centuries 0.0426236319) and the same vector in J2000 (FK5, IAU-76/80).
// The book's J2000 vector includes the EOP nutation corrections (about 0.05 arcsec), so agreement is to tens of metres.
const TTT = 0.0426236319;
const TEME = [5094.1801621, 6127.6446595, 6380.3445327];
const J2000 = [5102.5096, 6123.01152, 6378.1363];

describe("TEME to J2000 (T-093)", () => {
  it("ADR-0007: TEME to the J2000 equator agrees with Vallado's example within 30 m", () => {
    const s = Float64Array.from([...TEME, 0, 0, 0]);
    temeToJ2000(s, TTT, false);
    expect(Math.hypot(s[0]! - J2000[0]!, s[1]! - J2000[1]!, s[2]! - J2000[2]!)).toBeLessThan(0.03);
  });

  it("ADR-0003: the ecliptic output is the equatorial one rotated by the J2000 obliquity; lengths are kept", () => {
    const eq = Float64Array.from([...TEME, 1, 2, 3]);
    const ec = Float64Array.from([...TEME, 1, 2, 3]);
    temeToJ2000(eq, TTT, false);
    temeToJ2000(ec, TTT, true);
    const e = (84381.448 / 3600) * (Math.PI / 180);
    expect(ec[0]).toBeCloseTo(eq[0]!, 9);
    expect(ec[1]).toBeCloseTo(Math.cos(e) * eq[1]! + Math.sin(e) * eq[2]!, 9);
    expect(ec[2]).toBeCloseTo(-Math.sin(e) * eq[1]! + Math.cos(e) * eq[2]!, 9);
    expect(Math.hypot(ec[3]!, ec[4]!, ec[5]!)).toBeCloseTo(Math.hypot(1, 2, 3), 12);
  });
});
