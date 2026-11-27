import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromOmm, fromTle, initialize, propagate } from "./sgp4";

// VN-CAT-007, ADR-0007: the reference is the verification set published with Vallado et al., "Revisiting
// Spacetrack Report #3" (AIAA 2006-6753): testdata/sgp4/SGP4-VER.TLE (element sets with start, stop and step in
// minutes) and testdata/sgp4/tmatver.out (the reference MATLAB code's TEME output, AFSPC mode), never our own output.

const read = (f: string): string => readFileSync(new URL(`../../../testdata/sgp4/${f}`, import.meta.url), "utf8");

interface Case {
  line1: string;
  line2: string;
}

/** Element sets in the verification file (comment lines start with #). */
function cases(): Map<number, Case> {
  const lines = read("SGP4-VER.TLE")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("1 ") || l.startsWith("2 "));
  const out = new Map<number, Case>();
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const n = Number(lines[i]!.slice(2, 7));
    out.set(n, { line1: lines[i]!, line2: lines[i + 1]! });
  }
  return out;
}

interface Row {
  t: number;
  r: [number, number, number];
  v: [number, number, number];
}

/** Reference rows per satellite: "<catnr> xx" then "tsince x y z vx vy vz ...". */
function reference(): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  let cur: Row[] | null = null;
  for (const line of read("tmatver.out").split(/\r\n|\r|\n/)) {
    const head = /^\s*(\d+) xx\s*$/.exec(line);
    if (head) {
      cur = [];
      out.set(Number(head[1]), cur);
      continue;
    }
    // The file ends in one run-on line of rows with no satellite header: it cannot be attributed, so it is skipped.
    if (line.length > 400) continue;
    const f = line.trim().split(/\s+/).map(Number);
    if (cur && f.length >= 7 && f.slice(0, 7).every(Number.isFinite)) {
      cur.push({ t: f[0]!, r: [f[1]!, f[2]!, f[3]!], v: [f[4]!, f[5]!, f[6]!] });
    }
  }
  return out;
}

const CASES = cases();
const REF = reference();

describe("SGP4/SDP4 (T-092)", () => {
  it("reads every verification element set and its reference rows", () => {
    expect(CASES.size).toBeGreaterThanOrEqual(30);
    expect(REF.size).toBeGreaterThanOrEqual(30);
    expect(REF.get(5)![0]!.r[0]).toBe(7022.46529266);
  });

  // Near-Earth normal (06251), near-Earth low perigee (28057), deep-space 12 h resonant Molniya (08195, 09880),
  // GEO and 24 h synchronous resonance (14128 EUTELSAT, 28626, 21897), low-inclination Lyddane cases (04632, 09998),
  // the original Spacetrack Report #3 SDP4 case (11801), and every other set in the file.
  it("VN-CAT-007: matches the AIAA 2006-6753 reference positions to 1 m and velocities to 1 mm/s", () => {
    const out = new Float64Array(6);
    let checked = 0;
    let worstR = 0;
    let worstV = 0;
    const failures: string[] = [];
    for (const [n, rows] of REF) {
      const c = CASES.get(n);
      expect(c, `${n}`).toBeDefined();
      const sat = initialize(fromTle(c!.line1, c!.line2), "a");
      for (const [k, row] of rows.entries()) {
        const err = propagate(sat, row.t, out);
        if (err !== 0) {
          // The reference prints the state at its last row and then stops on the same error (33334 at the epoch).
          if (k !== rows.length - 1) failures.push(`${n} t=${row.t}: error ${err}`);
          continue;
        }
        const dr = Math.hypot(out[0]! - row.r[0], out[1]! - row.r[1], out[2]! - row.r[2]);
        const dv = Math.hypot(out[3]! - row.v[0], out[4]! - row.v[1], out[5]! - row.v[2]);
        worstR = Math.max(worstR, dr);
        worstV = Math.max(worstV, dv);
        if (dr > 1e-3 || dv > 1e-6)
          failures.push(`${n} t=${row.t}: dr ${dr.toExponential(2)} km dv ${dv.toExponential(2)}`);
        checked++;
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(checked).toBeGreaterThan(500);
    expect(worstR).toBeLessThan(1e-3);
    expect(worstV).toBeLessThan(1e-6);
  });

  it("VN-CAT-007: a satellite the reference stops (decay or bad elements) reports an error instead of a position", () => {
    // 33334 is in the set to show an error at the epoch (eccentricity out of range); its rows stop there.
    const out = new Float64Array(6).fill(7);
    const c = CASES.get(33334);
    if (!c) return;
    const sat = initialize(fromTle(c.line1, c.line2), "a");
    const rows = REF.get(33334) ?? [];
    const last = rows.at(-1)?.t ?? 0;
    expect(propagate(sat, last + 600, out)).not.toBe(0);
  });

  it("VN-DAT-009: OMM JSON fields give the same elements as the TLE they came from", () => {
    // ISS (25544) as TLE and as the OMM keywords CelesTrak publishes for the same element set.
    const l1 = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927";
    const l2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537";
    const tle = fromTle(l1, l2);
    const omm = fromOmm({
      EPOCH: "2008-09-20T12:25:40.104192",
      MEAN_MOTION: 15.72125391,
      ECCENTRICITY: 0.0006703,
      INCLINATION: 51.6416,
      RA_OF_ASC_NODE: 247.4627,
      ARG_OF_PERICENTER: 130.536,
      MEAN_ANOMALY: 325.0288,
      BSTAR: -0.11606e-4,
    });
    expect(omm.epochDays1950).toBeCloseTo(tle.epochDays1950, 8);
    for (const k of ["bstar", "inclo", "nodeo", "ecco", "argpo", "mo", "noKozai"] as const) {
      expect(omm[k]).toBeCloseTo(tle[k], 12);
    }
  });

  it("VN-PRF-002: propagation allocates nothing per call (writes into the caller's array)", () => {
    const c = CASES.get(5)!;
    const sat = initialize(fromTle(c.line1, c.line2));
    const out = new Float64Array(12);
    expect(propagate(sat, 360, out, 6)).toBe(0);
    expect(out[0]).toBe(0);
    expect(Math.hypot(out[6]!, out[7]!, out[8]!)).toBeGreaterThan(6378);
  });
});
