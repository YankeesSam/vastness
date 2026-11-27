import { describe, expect, it } from "vitest";
import { evaluateFile } from "../../src/core/ephem/ephemeris.ts";
import { KIND_ELEMENTS, KIND_POSITION, readEphemeris } from "../../src/core/ephem/format.ts";
import type { CachedResponse } from "./client.ts";
import { TOLERANCE_KM } from "./fit.ts";
import { canonicalQuery } from "./horizons.ts";
import type { Fetcher } from "./main.ts";
import { captureIndex, generateOrbiters, jumpIndices, type OrbitersFile } from "./orbiters.ts";

// The truth is closed form (own Kepler solver), never our own code's output.
const J2000_JD = 2451545;
const DAY = 86400;
const MU_MOON = 4902.800118; // the GM the pipeline takes from constants.ts (JPL DE440)
const sec = (iso: string): number => (Date.parse(`${iso}Z`) - Date.UTC(2000, 0, 1, 12)) / 1000;

const A = 6000;
const E = 0.6;
const I = 1.5;
const N = Math.sqrt(MU_MOON / A ** 3);
const FIRST = sec("2030-12-27T03:00:00");
const CAPTURE = sec("2030-12-28T00:00:00");
const SEAM = sec("2031-01-03T07:30:20");
const SEAM_KM = 6;
const LAST = sec("2031-01-09T20:00:00");

/** Osculating two-body state of slowly drifting elements (node and periapsis): the bound orbit. */
function orbit(t: number): number[] {
  const M = N * (t - CAPTURE) + 0.4;
  let ea = M;
  for (let k = 0; k < 50; k++) ea -= (ea - E * Math.sin(ea) - M) / (1 - E * Math.cos(ea));
  const node = 0.3 + 3e-8 * (t - CAPTURE);
  const w = 1.1 - 2e-8 * (t - CAPTURE);
  const q = Math.sqrt(1 - E * E);
  const dE = N / (1 - E * Math.cos(ea));
  const P = [
    Math.cos(w) * Math.cos(node) - Math.sin(w) * Math.sin(node) * Math.cos(I),
    Math.cos(w) * Math.sin(node) + Math.sin(w) * Math.cos(node) * Math.cos(I),
    Math.sin(w) * Math.sin(I),
  ];
  const Q = [
    -Math.sin(w) * Math.cos(node) - Math.cos(w) * Math.sin(node) * Math.cos(I),
    -Math.sin(w) * Math.sin(node) + Math.cos(w) * Math.cos(node) * Math.cos(I),
    Math.cos(w) * Math.sin(I),
  ];
  const [u, v] = [A * (Math.cos(ea) - E), A * q * Math.sin(ea)];
  const [du, dv] = [-A * Math.sin(ea) * dE, A * q * Math.cos(ea) * dE];
  return [0, 1, 2].map((k) => P[k]! * u + Q[k]! * v).concat([0, 1, 2].map((k) => P[k]! * du + Q[k]! * dv));
}

/**
 * Before capture an unbound approach at 3 km/s that blends into the orbit over the hour before capture (a smooth
 * insertion burn); after a seam the positions shift.
 */
const BURN = 3600;
function truth(t: number): number[] {
  if (t >= CAPTURE) {
    const s = orbit(t);
    if (t > SEAM) s[1] = s[1]! + SEAM_KM;
    return s;
  }
  const c = orbit(CAPTURE);
  const d = t - CAPTURE;
  const line = [c[0]! + 3 * d, c[1]! + 0.5 * d, c[2]!, 3, 0.5, 0];
  if (d < -BURN) return line;
  const o = orbit(t);
  const u = (d + BURN) / BURN; // 0..1 over the burn
  const w = u * u * (3 - 2 * u);
  const dw = (6 * u * (1 - u)) / BURN;
  const pos = [0, 1, 2].map((k) => (1 - w) * line[k]! + w * o[k]!);
  const vel = [0, 1, 2].map((k) => (1 - w) * line[k + 3]! + w * o[k + 3]! + dw * (o[k]! - line[k]!));
  return [...pos, ...vel];
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const horizonsDate = (t: number): string => {
  const iso = new Date(Date.UTC(2000, 0, 1, 12) + t * 1000).toISOString();
  return `${iso.slice(0, 4)}-${MON[Number(iso.slice(5, 7)) - 1]}-${iso.slice(8, 10)} ${iso.slice(11, 23)}0`;
};
const unq = (v: string): string => v.replace(/^'|'$/g, "");
const env = (o: object): string =>
  JSON.stringify({ signature: { source: "NASA/JPL Horizons API", version: "1.2" }, ...o });

class FakeHorizons implements Fetcher {
  queries: string[] = [];
  async get(params: Record<string, string>): Promise<CachedResponse> {
    const query = canonicalQuery(params);
    this.queries.push(query);
    expect(unq(params.CENTER!)).toBe("500@301");
    const t0 = sec(unq(params.START_TIME!).replace(" ", "T"));
    const t1 = sec(unq(params.STOP_TIME!).replace(" ", "T"));
    const [n, unit] = unq(params.STEP_SIZE!).split(" ");
    // "N m", "1 d", or a bare count of equal intervals (the 1 s seam probe).
    const step = unit === undefined ? (t1 - t0) / Number(n) : Number(n) * (unit === "d" ? DAY : 60);
    let body: string;
    if (t0 < FIRST) {
      body = env({
        error: `No ephemeris for target "Testorbiter (spacecraft)" prior to A.D. ${horizonsDate(FIRST)} TDB\n`,
      });
    } else if (t1 > LAST) {
      body = env({
        error: `No ephemeris for target "Testorbiter (spacecraft)" after A.D. ${horizonsDate(LAST)} TDB\n`,
      });
    } else {
      const lines: string[] = [];
      for (let k = 0; t0 + k * step <= t1 + 1e-6; k++) {
        const t = t0 + k * step;
        lines.push(
          `${(J2000_JD + t / DAY).toFixed(9)}, A.D. calendar, ${truth(t)
            .map((x) => x.toExponential(15))
            .join(", ")},`,
        );
      }
      body = env({
        result: [
          "Target body name: Testorbiter (spacecraft) (-999)   {source: test_merged}",
          "Center body name: Moon (301)                     {source: DE441}",
          "Reference frame : Ecliptic of J2000.0",
          "            JDTDB,            Calendar Date (TDB),   X,   Y,   Z,  VX,  VY,  VZ,",
          "$$SOE",
          ...lines,
          "$$EOE",
        ].join("\n"),
      });
    }
    return { body, retrieved: "2026-11-26", fromCache: true, query };
  }
}

const CONFIG: OrbitersFile = {
  build_date: "2031-01-05",
  window_days: 2,
  budget_bytes: 5_000_000,
  orbiters: [{ id: -999, name: "Testorbiter", center: 301, tolerance: "lunarOrbit" }],
};

const run = (cfg: OrbitersFile = CONFIG) =>
  generateOrbiters({ client: new FakeHorizons(), orbiters: cfg, fromYear: 2030, toYear: 2032, targetFraction: 0.5 });

interface Obj {
  center: number;
  stored: string;
  coverage: { start: number; end: number };
  mission: { bytes: number; budget_bytes: number; max_error_km: { km: number }; parts: { kept: string }[] };
  chunks: { file: string; segment_kind: string; coverage: { start: number; end: number } }[];
  max_error_km: { km: number };
  misses: unknown[];
  seams: { t: number; t_after: number; jump_km: number }[];
  window?: { build_date: string; days: number };
}

describe("orbiters (T-089)", () => {
  it("VN-EPH-011: capture is where the orbiter stays bound to its parent", () => {
    const s = Array.from({ length: 101 }, (_, i) => {
      const t = CAPTURE - 50 * 300 + i * 300;
      const [x, y, z, vx, vy, vz] = truth(t) as [number, number, number, number, number, number];
      return { t, x, y, z, vx, vy, vz };
    });
    // Bound from partway through the insertion burn (the hour before CAPTURE, samples 38..50) onwards.
    const k = captureIndex(s, MU_MOON);
    expect(k).toBeGreaterThan(38);
    expect(k).toBeLessThanOrEqual(50);
    const energy = (p: (typeof s)[number]) =>
      (p.vx ** 2 + p.vy ** 2 + p.vz ** 2) / 2 - MU_MOON / Math.hypot(p.x, p.y, p.z);
    expect(energy(s[k - 1]!)).toBeGreaterThanOrEqual(0);
    expect(s.slice(k).every((p) => energy(p) < 0)).toBe(true);
    expect(captureIndex(s.slice(60), MU_MOON)).toBe(0);
    expect(captureIndex(s.slice(0, 40), MU_MOON)).toBe(-1);
  });

  it("VN-EPH-003: a seam between trajectory arcs is found at the fine step", () => {
    const s = Array.from({ length: 21 }, (_, i) => {
      const t = SEAM - 600 + 20 + i * 60;
      const [x, y, z, vx, vy, vz] = truth(t) as [number, number, number, number, number, number];
      return { t, x, y, z, vx, vy, vz };
    });
    expect(jumpIndices(s, TOLERANCE_KM.lunarOrbit / 2)).toEqual([10]);
  });

  it("VN-EPH-009, VN-EPH-011: stored relative to the Moon, transfer as positions and orbit as elements, within 2 km", async () => {
    const { files, objects } = await run();
    const o = objects[0] as Obj;
    expect(o.center).toBe(301);
    expect(o.stored).toBe("mission");
    // The transfer cannot be elements (unbound); the bound orbit is much smaller as elements.
    expect(o.mission.parts.map((p) => p.kept)).toEqual(["position", "elements", "elements"]);
    expect(o.chunks.map((c) => c.segment_kind)).toEqual(["position", "elements", "elements"]);
    for (const c of o.chunks) {
      const f = readEphemeris(files.get(c.file)!.slice().buffer);
      expect(f.centerId).toBe(301);
      expect(f.kind).toBe(c.segment_kind === "elements" ? KIND_ELEMENTS : KIND_POSITION);
    }
    // VN-EPH-003: 2 km at dense epochs off every sampling grid, away from the seam's own minute.
    const parsed = o.chunks.map((c) => readEphemeris(files.get(c.file)!.slice().buffer));
    const out = new Float64Array(6);
    let max = 0;
    for (let t = o.coverage.start + 37; t < o.coverage.end; t += 1003) {
      if (Math.abs(t - SEAM) < 120) continue;
      const f = parsed.find((x) => t >= x.start && t <= x.end)!;
      expect(evaluateFile(f, t, out)).toBe(true);
      const s = truth(t);
      max = Math.max(max, Math.hypot(out[0]! - s[0]!, out[1]! - s[1]!, out[2]! - s[2]!));
    }
    expect(max).toBeLessThan(TOLERANCE_KM.lunarOrbit);
    // Whole mission measured and reported; the seam listed where it is.
    expect(o.mission.bytes).toBeGreaterThan(0);
    expect(o.mission.max_error_km.km).toBeLessThan(TOLERANCE_KM.lunarOrbit);
    expect(o.max_error_km.km).toBeLessThan(TOLERANCE_KM.lunarOrbit);
    expect(o.misses).toEqual([]);
    expect(o.seams).toHaveLength(1);
    expect(o.seams[0]!.t).toBeLessThanOrEqual(SEAM);
    expect(o.seams[0]!.t_after).toBeGreaterThan(SEAM);
    expect(o.seams[0]!.t_after - o.seams[0]!.t).toBeLessThanOrEqual(1); // placed to a second
    expect(o.seams[0]!.jump_km).toBeCloseTo(SEAM_KM, 0);
  });

  it("VN-EPH-011: over the budget only the segments around the build date are stored", async () => {
    const full = (await run()).objects[0] as Obj;
    const { objects } = await run({ ...CONFIG, budget_bytes: Math.floor(full.mission.bytes / 2) });
    const o = objects[0] as Obj;
    expect(o.stored).toBe("window");
    expect(o.window).toEqual({ build_date: "2031-01-05", days: 2 });
    expect(o.mission.bytes).toBe(full.mission.bytes); // measured over the whole mission either way
    const build = sec("2031-01-05T00:00:00");
    expect(o.coverage.start).toBeLessThanOrEqual(build - 2 * DAY);
    expect(o.coverage.end).toBeGreaterThanOrEqual(build + 2 * DAY);
    expect(o.coverage.end - o.coverage.start).toBeLessThan(full.coverage.end - full.coverage.start);
  });

  it("VN-GEN-010: two runs give byte-identical files", async () => {
    const a = await run();
    const b = await run();
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
    for (const [k, v] of a.files) expect(Buffer.from(v).equals(Buffer.from(b.files.get(k)!))).toBe(true);
    expect(JSON.stringify(a.objects)).toBe(JSON.stringify(b.objects));
  });
});

describe("orbiters in the pipeline (T-089)", () => {
  it("VN-EPH-009: data/orbiters.json lists every catalog spacecraft that orbits a planet or the Moon, with its parent", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (f: string) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8"));
    const catalog = read("catalog.json") as { objects: { id: number; type: string; parent?: number }[] };
    const cfg = read("orbiters.json") as OrbitersFile;
    const want = catalog.objects
      .filter((o) => o.type === "spacecraft" && o.parent !== 10)
      .map((o) => [o.id, o.parent])
      .sort();
    expect(cfg.orbiters.map((o) => [o.id, o.center]).sort()).toEqual(want);
    // VN-EPH-003: 2 km for the lunar orbiters; OI-6: 5 MB and +-30 days.
    for (const o of cfg.orbiters) expect(o.tolerance).toBe(o.center === 301 ? "lunarOrbit" : "cruise");
    expect(cfg.budget_bytes).toBe(5_000_000);
    expect(cfg.window_days).toBe(30);
  });

  it("VN-EPH-011: npm run ephem writes orbiters beside the bodies; the manifest names format version 2", async () => {
    const { generate } = await import("./main.ts");
    const files = await generate({
      bodies: {
        coverage: { from_year: 2030, to_year: 2032 },
        chunk_years: 2,
        bodies: [{ id: 10, name: "Sun", origin: true }],
      },
      client: new FakeHorizons(),
      orbiters: CONFIG,
    });
    const m = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!)) as {
      format_version: number;
      objects: { id: number; center?: number }[];
    };
    expect(m.format_version).toBe(2);
    expect(m.objects.map((o) => o.id)).toEqual([-999, 10]);
    expect(m.objects[0]!.center).toBe(301);
    expect([...files.keys()].filter((k) => k.startsWith("-999/"))).toHaveLength(3);
  });
});
