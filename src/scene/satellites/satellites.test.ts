import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Ephemeris, EvalStatus } from "../../core/ephem/ephemeris";
import { illustrativePeriod } from "../../core/ephem/illustrative";
import { SECONDS_PER_DAY, parseUtc } from "../../core/time/scales";
import { parseVectors } from "../../../tools/ephem/horizons";
import {
  SATELLITE_NEAR_KM,
  VALID_DAYS,
  elementsAge,
  satelliteShown,
  satelliteTracks,
  withSatellites,
  type SatellitesData,
} from "./satellites";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const data = JSON.parse(readFileSync(`${root}data/satellites.json`, "utf8")) as SatellitesData;
const ISS = -125544;
const GOES19 = -160133;

/** Earth at a fixed heliocentric state; records the IDs asked to load. */
const EARTH_STATE = [1.4e8, 3e7, -1e3, -6, 29, 0.001];
function baseEphemeris() {
  const loads: (readonly number[] | undefined)[] = [];
  const e = {
    ids: [10, 399],
    has: (id: number) => id === 10 || id === 399,
    name: (id: number) => String(id),
    center: () => 10,
    coverage: () => ({ start: -1e10, end: 1e10 }),
    chunksAt: () => [],
    load: async (_t: number, ids?: readonly number[]) => void loads.push(ids),
    relativeState: () => "outside" as EvalStatus,
    state(id: number, _t: number, out: Float64Array, o = 0): EvalStatus {
      if (id !== 399) return "outside";
      EARTH_STATE.forEach((v, k) => (out[o + k] = v));
      return "ok";
    },
    peek(id: number, t: number, out: Float64Array, o = 0) {
      return this.state(id, t, out, o);
    },
    illustrativeEdge: () => undefined,
    illustrative: () => "outside" as EvalStatus,
  };
  return { eph: e as unknown as Ephemeris, loads };
}

const tracks = satelliteTracks(data);
const { eph: base, loads } = baseEphemeris();
const eph = withSatellites(base, tracks);
const iss = tracks.find((s) => s.id === ISS)!;
const out = new Float64Array(6);
const geo = (st: Float64Array) => [0, 1, 2, 3, 4, 5].map((k) => st[k]! - EARTH_STATE[k]!);

describe("Earth satellite layer (VN-CAT-007)", () => {
  it("VN-CAT-007: every satellite in data/satellites.json joins the ephemeris as an Earth-centred object", () => {
    expect(tracks).toHaveLength(data.satellites.length);
    for (const s of tracks) {
      expect(eph.has(s.id)).toBe(true);
      expect(eph.center(s.id)).toBe(399);
      expect(eph.coverage(s.id)).toEqual({
        start: s.epoch - VALID_DAYS * SECONDS_PER_DAY,
        end: s.epoch + VALID_DAYS * SECONDS_PER_DAY,
      });
    }
    expect(eph.ids).toEqual([...eph.ids].sort((a, b) => a - b));
    expect(eph.has(10)).toBe(true);
  });

  it("VN-CAT-007: inside 14 days the state is Earth's plus SGP4's, in the J2000 ecliptic (ISS against Horizons)", () => {
    const body = readFileSync(`${root}testdata/horizons/iss-2026-11-26.json`, "utf8");
    const recs = parseVectors(body, "iss").records;
    let worst = 0;
    for (const h of recs) {
      expect(eph.state(ISS, h.t, out)).toBe("ok");
      const g = geo(out);
      worst = Math.max(worst, Math.hypot(g[0]! - h.x, g[1]! - h.y, g[2]! - h.z));
    }
    // Same bound as tools/gp's check (along-track drift of GP elements against Horizons' ISS trajectory).
    expect(worst).toBeLessThan(30);
  });

  it("VN-CAT-007: low and geostationary orbits come out at their radii", () => {
    eph.state(ISS, iss.epoch, out);
    expect(Math.hypot(...geo(out).slice(0, 3))).toBeGreaterThan(6378 + 380);
    expect(Math.hypot(...geo(out).slice(0, 3))).toBeLessThan(6378 + 440);
    const g19 = tracks.find((s) => s.id === GOES19)!;
    eph.state(GOES19, g19.epoch + 3600, out);
    expect(Math.hypot(...geo(out).slice(0, 3))).toBeCloseTo(42164, -2);
  });

  it("VN-CAT-007, VN-EPH-011: beyond 14 days there is no exact state, only the illustrative orbit", () => {
    const t = iss.epoch + 20 * SECONDS_PER_DAY;
    expect(eph.state(ISS, t, out)).toBe("outside");
    expect(eph.illustrativeEdge(ISS, t)).toBe(iss.illustrative.after);
    expect(eph.illustrative(ISS, t, out)).toBe("ok");
    expect(Math.hypot(...geo(out).slice(0, 3))).toBeGreaterThan(6378 + 350);
    // The ISS's period is about 92 minutes.
    expect(illustrativePeriod(iss.illustrative.after!) / 60).toBeCloseTo(92.9, 0);
    // The ellipse starts where SGP4 left off.
    const edge = iss.coverage.end;
    const exact = new Float64Array(6);
    eph.state(ISS, edge, exact);
    eph.illustrative(ISS, edge + 1e-3, out);
    expect(Math.hypot(out[0]! - exact[0]!, out[1]! - exact[1]!, out[2]! - exact[2]!)).toBeLessThan(0.1);
    // Inside the span there is no illustrative orbit.
    expect(eph.illustrative(ISS, iss.epoch, out)).toBe("outside");
  });

  it("VN-EPH-007: before launch nothing is drawn, not even an illustrative orbit", () => {
    const launch = iss.epoch - 5 * SECONDS_PER_DAY; // pretend it launched five days before its elements
    const [t] = satelliteTracks({ satellites: data.satellites.filter((s) => s.id === ISS) }, () => launch);
    expect(t!.coverage.start).toBe(launch);
    expect(t!.illustrative.before).toBeUndefined();
    const e = withSatellites(base, [t!]);
    expect(e.illustrative(ISS, launch - 3600, out)).toBe("outside");
    const [old] = satelliteTracks({ satellites: data.satellites.filter((s) => s.id === ISS) }, () =>
      parseUtc("1998-11-20"),
    );
    expect(old!.illustrative.before!.from).toBe(parseUtc("1998-11-20"));
    expect(withSatellites(base, [old!]).illustrative(ISS, iss.epoch - 30 * SECONDS_PER_DAY, out)).toBe("ok");
  });

  it("VN-UI-005: loading a satellite loads Earth's chunks instead", async () => {
    await eph.load(0, [-31, ISS, GOES19]);
    await eph.load(0, [10]);
    expect(loads).toEqual([[-31, 399], [10]]);
    expect(eph.peek(ISS, iss.epoch, out)).toBe("ok");
  });

  it("VN-CAT-007: the panel line gives the element epoch and its age at the time shown", () => {
    expect(elementsAge(iss, iss.epoch + 3.25 * SECONDS_PER_DAY)).toBe(
      "2026-11-26 22:39 UTC, 3.3 days before the time shown",
    );
    expect(elementsAge(iss, iss.epoch - 5 * 3600)).toBe("2026-11-26 22:39 UTC, 5 h after the time shown");
    expect(elementsAge(iss, iss.epoch + 60)).toBe("2026-11-26 22:39 UTC, less than an hour from the time shown");
  });

  it("VN-CAT-007: satellite markers show when the camera is near Earth, or for the selected satellite", () => {
    expect(satelliteShown(2e4, false)).toBe(true);
    expect(satelliteShown(SATELLITE_NEAR_KM * 2, false)).toBe(false);
    expect(satelliteShown(1.5e8, true)).toBe(true);
  });
});
