import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AU_KM, C_KM_S } from "./constants";
import { eclipticFromEquatorial } from "./frames";
import { bodyToEcliptic, ROTATING_BODIES, rotationAngles } from "./rotation";

// VN-SCN-009: the IAU rotation models against Horizons (F1, testdata/horizons/rotation-*.json, recorded by
// tools/ephem/record.ts): the sub-observer longitude and latitude Horizons gives for each body seen from the Sun's
// centre (the Sun from Earth's), every 4 years over 2000-2028 and hourly on 2026-11-27. The direction to the observer
// is Horizons' own astrometric RA and Dec, and the body is turned to the time the light left it, so nothing here
// comes from our ephemeris.

const DEG = Math.PI / 180;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** J2000 = 2000-01-01T12:00 TT; TDB - TT under 2 ms is ignored (under 1e-5 degree even for Jupiter). */
const J2000_MS = Date.UTC(2000, 0, 1, 12);

interface Row {
  t: number;
  ra: number;
  dec: number;
  lon: number;
  lat: number;
  deltaAu: number;
}

interface Table {
  west: boolean;
  /** Equatorial and polar radius, km (Horizons' latitudes are planetodetic). */
  a: number;
  c: number;
  rows: Row[];
}

function table(name: string): Table {
  const r = (
    JSON.parse(readFileSync(new URL(`../../testdata/horizons/${name}.json`, import.meta.url), "utf8")) as {
      result: string;
    }
  ).result;
  const pole = /Target pole\/equ : .*\{(East|West)-longitude positive\}/.exec(r)!;
  const radii = /Target radii {4}: ([\d.]+), [\d.]+, ([\d.]+) km/.exec(r)!;
  const body = r.slice(r.indexOf("$$SOE") + 5, r.indexOf("$$EOE"));
  const rows = body
    .trim()
    .split("\n")
    .map((line) => {
      const f = line.split(",").map((s) => s.trim());
      const [, y, mo, dd, hh, mm] = /(\d+)-(\w+)-(\d+) (\d+):(\d+)/.exec(f[0]!)!;
      const ms = Date.UTC(Number(y), MONTHS.indexOf(mo!), Number(dd), Number(hh), Number(mm));
      return {
        t: (ms - J2000_MS) / 1000,
        ra: Number(f[3]),
        dec: Number(f[4]),
        lon: Number(f[5]),
        lat: Number(f[6]),
        deltaAu: Number(f[7]),
      };
    });
  return { west: pole[1] === "West", a: Number(radii[1]), c: Number(radii[2]), rows };
}

/** Our sub-observer longitude (Horizons' sign) and planetodetic latitude for a row, degrees. */
function subPoint(id: number, tb: Table, row: Row): { lon: number; lat: number } {
  const m = new Float64Array(9);
  // The body as it was when the light left it.
  expect(bodyToEcliptic(id, row.t - (row.deltaAu * AU_KM) / C_KM_S, m)).toBe(true);
  const cd = Math.cos(row.dec * DEG);
  const toObserver = eclipticFromEquatorial(
    Float64Array.of(-cd * Math.cos(row.ra * DEG), -cd * Math.sin(row.ra * DEG), -Math.sin(row.dec * DEG)),
  );
  // Ecliptic to body-fixed: the transpose.
  const b = [0, 1, 2].map((c) => m[c]! * toObserver[0]! + m[3 + c]! * toObserver[1]! + m[6 + c]! * toObserver[2]!);
  const east = Math.atan2(b[1]!, b[0]!) / DEG;
  const centric = Math.atan2(b[2]!, Math.hypot(b[0]!, b[1]!));
  const lat = Math.atan(Math.tan(centric) * (tb.a / tb.c) ** 2) / DEG;
  return { lon: (((tb.west ? -east : east) % 360) + 360) % 360, lat };
}

const angleDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

function worst(id: number): { lon: number; lat: number } {
  let lon = 0;
  let lat = 0;
  for (const name of [`rotation-${id}`, `rotation-${id}-spin`]) {
    const tb = table(name);
    for (const row of tb.rows) {
      const s = subPoint(id, tb, row);
      // Longitude error measured along the surface (it means nothing near a pole).
      lon = Math.max(lon, angleDiff(s.lon, row.lon) * Math.cos(row.lat * DEG));
      lat = Math.max(lat, Math.abs(s.lat - row.lat));
    }
  }
  return { lon, lat };
}

/**
 * Tolerance, degrees along the surface. Earth's IAU model turns with TDB and leaves out nutation, where Horizons
 * uses ITRF93 (UT1, nutation): 0.08 degree (9 km) seen over 2000-2028.
 */
const TOLERANCE: Record<number, number> = { 399: 0.1 };
const DEFAULT_TOLERANCE = 0.01;

describe("rotation models", () => {
  it.each(ROTATING_BODIES.map((id) => [id]))(
    "VN-SCN-009: body %i turns as Horizons has it (sub-observer point over 2000-2028 and over 7 hours)",
    (id) => {
      const w = worst(id);
      const tol = TOLERANCE[id] ?? DEFAULT_TOLERANCE;
      expect(w.lon).toBeLessThan(tol);
      expect(w.lat).toBeLessThan(tol);
    },
  );

  it("VN-SCN-009: the body frame is a rotation: orthonormal and right-handed, z along the pole", () => {
    const m = new Float64Array(9);
    const a = new Float64Array(3);
    for (const id of ROTATING_BODIES) {
      for (const t of [-3e9, 0, 8.5e8, 3e9]) {
        bodyToEcliptic(id, t, m);
        const col = (c: number) => [m[c]!, m[3 + c]!, m[6 + c]!];
        const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
        const [x, y, z] = [col(0), col(1), col(2)];
        for (const [u, v, e] of [
          [x, x, 1],
          [y, y, 1],
          [z, z, 1],
          [x, y, 0],
          [y, z, 0],
          [x, z, 0],
        ] as const)
          expect(dot(u, v)).toBeCloseTo(e, 12);
        // x cross y = z
        expect(x[1]! * y[2]! - x[2]! * y[1]!).toBeCloseTo(z[0]!, 12);
        rotationAngles(id, t, a);
        expect(a[2]).toBeGreaterThanOrEqual(0);
        expect(a[2]).toBeLessThan(360);
      }
    }
    expect(bodyToEcliptic(-31, 0, m)).toBe(false);
  });

  it("VN-SCN-009: Earth spins once a sidereal day; Venus and Uranus the other way", () => {
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    const spin = (id: number, dt: number) => {
      rotationAngles(id, 1e8, a);
      rotationAngles(id, 1e8 + dt, b);
      return ((b[2]! - a[2]! + 540) % 360) - 180;
    };
    expect(spin(399, 86164.0905)).toBeCloseTo(0, 3);
    expect(spin(399, 3600)).toBeCloseTo(15.04, 2);
    expect(spin(299, 86400)).toBeLessThan(0);
    expect(spin(799, 3600)).toBeLessThan(0);
  });
});
