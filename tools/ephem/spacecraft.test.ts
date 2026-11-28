import { describe, expect, it } from "vitest";
import { evaluateSegment } from "../../src/core/ephem/chebyshev.ts";
import { findSegment, readEphemeris } from "../../src/core/ephem/format.ts";
import type { CachedResponse } from "./client.ts";
import { canonicalQuery } from "./horizons.ts";
import type { Fetcher } from "./main.ts";
import {
  GRID_MIN,
  STEP_LADDER_MIN,
  chunkBounds,
  discoverCoverage,
  fitPoints,
  generateSpacecraft,
  missRuns,
  parseCoverageEdge,
  tdbText,
  tile,
} from "./spacecraft.ts";

const J2000_JD = 2451545;
const DAY = 86400;
const AU = 149_597_870.7;
const W = (2 * Math.PI) / (365.25 * DAY);
const sec = (iso: string): number => (Date.parse(`${iso}Z`) - Date.UTC(2000, 0, 1, 12)) / 1000;

interface Craft {
  name: string;
  first: number;
  last: number;
  /** Flybys: a velocity change of `dv` km/s over about `tau` s at `tc`. */
  bumps: { tc: number; dv: number; tau: number }[];
  /** Trajectory-file seams: the position jumps by `km` (in x) after `t`. */
  seams?: { t: number; km: number }[];
  /** A fast oscillation in y of `km` with `period` s, within `half` s of `tc`. */
  wobble?: { tc: number; km: number; period: number; half: number };
}

function truth(c: Craft, t: number): number[] {
  let x = 1.2 * AU * Math.cos(W * t);
  let y = 1.2 * AU * Math.sin(W * t);
  let vx = -1.2 * AU * W * Math.sin(W * t);
  let vy = 1.2 * AU * W * Math.cos(W * t);
  for (const b of c.bumps) {
    // A flyby as a smooth velocity change of dv km/s over about tau s: position dv * tau * softplus(u).
    const u = (t - b.tc) / b.tau;
    const softplus = u > 30 ? u : Math.log1p(Math.exp(u));
    const sigma = 1 / (1 + Math.exp(-u));
    x += b.dv * b.tau * softplus;
    y -= 0.5 * b.dv * b.tau * softplus;
    vx += b.dv * sigma;
    vy -= 0.5 * b.dv * sigma;
  }
  for (const j of c.seams ?? []) if (t > j.t) x += j.km;
  const w = c.wobble;
  if (w && Math.abs(t - w.tc) < w.half) {
    const k = (2 * Math.PI) / w.period;
    y += w.km * Math.sin(k * (t - w.tc));
    vy += w.km * k * Math.cos(k * (t - w.tc));
  }
  return [x, y, 0, vx, vy, 0];
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const horizonsDate = (t: number): string => {
  const d = new Date(Date.UTC(2000, 0, 1, 12) + t * 1000);
  const iso = d.toISOString();
  return `${iso.slice(0, 4)}-${MON[d.getUTCMonth()]}-${iso.slice(8, 10)} ${iso.slice(11, 23)}0`;
};
const unq = (v: string): string => v.replace(/^'|'$/g, "");
const env = (o: object): string =>
  JSON.stringify({ signature: { source: "NASA/JPL Horizons API", version: "1.2" }, ...o });

class FakeHorizons implements Fetcher {
  queries: string[] = [];
  constructor(private readonly crafts: Record<number, Craft>) {}
  async get(params: Record<string, string>): Promise<CachedResponse> {
    const query = canonicalQuery(params);
    this.queries.push(query);
    const id = Number(unq(params.COMMAND!));
    const c = this.crafts[id]!;
    const t0 = sec(unq(params.START_TIME!).replace(" ", "T"));
    const t1 = sec(unq(params.STOP_TIME!).replace(" ", "T"));
    const [n, unit] = unq(params.STEP_SIZE!).split(" ");
    // "N m", "1 d", or a bare count of equal intervals.
    const step = unit === undefined ? (t1 - t0) / Number(n) : Number(n) * (unit === "d" ? DAY : 60);
    let body: string;
    if (t0 < c.first) {
      body = env({
        error: `No ephemeris for target "${c.name} (spacecraft)" prior to A.D. ${horizonsDate(c.first)} TDB\n`,
      });
    } else if (t1 > c.last) {
      body = env({
        error: `No ephemeris for target "${c.name} (spacecraft)" after A.D. ${horizonsDate(c.last)} TDB\n`,
      });
    } else {
      const lines: string[] = [];
      for (let k = 0; t0 + k * step <= t1 + 1e-6; k++) {
        const t = t0 + k * step;
        const v = truth(c, t).map((x) => x.toExponential(15));
        lines.push(`${(J2000_JD + t / DAY).toFixed(9)}, A.D. calendar, ${v.join(", ")},`);
      }
      body = env({
        result: [
          `Target body name: ${c.name} (spacecraft) (${id})   {source: test_traj}`,
          "Center body name: Sun (10)                     {source: DE441}",
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

const CRAFT: Craft = {
  name: "Testcraft",
  first: sec("2028-03-03T10:17:42.123"),
  last: sec("2031-06-30T05:03:00"),
  // A sharp flyby (refined) and a gentle feature the 1-day fit handles.
  bumps: [
    { tc: sec("2029-05-10T06:00:00"), dv: 5, tau: 2 * 3600 },
    { tc: sec("2030-08-01T00:00:00"), dv: 0.5, tau: 20 * DAY },
  ],
};

describe("spacecraft coverage", () => {
  it("VN-EPH-007: reads Horizons' coverage edges from its refusals", () => {
    const p = parseCoverageEdge(
      'No ephemeris for target "Voyager 1 (spacecraft)" prior to A.D. 1977-SEP-05 13:59:24.3830 TDB',
    );
    expect(p?.side).toBe("prior");
    expect(p!.t).toBeCloseTo(sec("1977-09-05T13:59:24.383"), 2);
    const a = parseCoverageEdge('No ephemeris for target "JWST" after A.D. 2031-NOV-16 00:01:09.1827 TDB');
    expect(a?.side).toBe("after");
    expect(a!.t).toBeCloseTo(sec("2031-11-16T00:01:09.1827"), 2);
    expect(parseCoverageEdge("No ephemeris for target Earth")).toBeUndefined();
  });

  it("VN-EPH-007: coverage runs from the first to the last epoch, rounded inwards to the grid", async () => {
    const c = await discoverCoverage(new FakeHorizons({ [-9]: CRAFT }), -9, 1900, 2100);
    expect(c.start).toBe(sec("2028-03-03T10:20:00"));
    expect(c.end).toBe(sec("2031-06-30T05:00:00"));
    expect(c.start % (GRID_MIN * 60)).toBe(0);
    expect(c.first).toBeCloseTo(CRAFT.first, 3);
  });

  it("clamps coverage to the app's span", async () => {
    const long = { ...CRAFT, first: sec("1977-09-05T13:59:24"), last: sec("2100-01-01T00:00:00") };
    const c = await discoverCoverage(new FakeHorizons({ [-9]: long }), -9, 1980, 2000);
    expect(tdbText(c.start)).toBe("1980-01-01 00:00");
    expect(tdbText(c.end)).toBe("2000-01-01 00:00");
  });
});

describe("tiling and chunks", () => {
  it("chunks align to decades from the coverage start", () => {
    const b = chunkBounds(sec("2028-03-03T10:20:00"), sec("2031-06-30T05:00:00"), 10, 1900);
    expect(b.map(([a, z]) => [tdbText(a), tdbText(z)])).toEqual([
      ["2028-03-03 10:20", "2030-01-01 00:00"],
      ["2030-01-01 00:00", "2031-06-30 05:00"],
    ]);
  });

  it("tiles a chunk into a 1-day base and a 1..3 day tail of even steps", () => {
    const t0 = sec("2028-03-03T10:20:00");
    const t1 = sec("2030-01-01T00:00:00");
    const w = tile(t0, t1);
    expect(w[0]).toMatchObject({ t0, level: 0 });
    expect(w.at(-1)!.t1).toBe(t1);
    for (let i = 1; i < w.length; i++) expect(w[i]!.t0).toBe(w[i - 1]!.t1);
    for (const x of w) {
      const s = STEP_LADDER_MIN[x.level]! * 60;
      expect(((x.t1 - x.t0) / s) % 2).toBe(0);
    }
    const tail = w.at(-1)!.t1 - w.at(-1)!.t0;
    expect(tail).toBeGreaterThanOrEqual(DAY);
    expect(tail).toBeLessThan(3 * DAY);
    // A short span is all tail.
    expect(tile(t0, t0 + 2 * DAY)).toEqual([{ t0, t1: t0 + 2 * DAY, level: 2 }]);
    expect(tile(t0, t0 + 10 * DAY)).toEqual([{ t0, t1: t0 + 10 * DAY, level: 1 }]);
  });

  it("merges adjacent misses into runs", () => {
    expect(
      missRuns([
        { t0: 4, t1: 6, errorKm: 70 },
        { t0: 0, t1: 2, errorKm: 60 },
        { t0: 2, t1: 4, errorKm: 90 },
      ]),
    ).toEqual([{ t0: 0, t1: 6, errorKm: 90 }]);
  });
});

describe("fitPoints", () => {
  it("VN-EPH-003: a piece shorter than a step after a seam on the window's last sample is fitted at a lower degree, padded", () => {
    // Rosetta 2010: a seam one second before the window's last 1 min sample leaves a 1 s piece with one point.
    const p = { t: 1001, x: 7e7, y: -3e7, z: 1e5, vx: 12, vy: 25, vz: -0.5 };
    const segs = fitPoints([p], 1000, 1001, 11, 60, 25);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.coeffs.length).toBe(3 * 12);
    const out = new Float64Array(6);
    for (const [t, k] of [
      [1001, 0],
      [1000, -1],
    ] as const) {
      evaluateSegment(segs[0]!.coeffs as Float64Array, 0, 12, 1000, 1001, t, out, 0);
      expect(out[0]).toBeCloseTo(p.x + k * p.vx, 6);
      expect(out[1]).toBeCloseTo(p.y + k * p.vy, 6);
      expect(out[2]).toBeCloseTo(p.z + k * p.vz, 6);
    }
    // A long piece with too few points is still an error.
    expect(() => fitPoints([p], 0, 1001, 11, 60, 25)).toThrow(/too few points/);
  });
});

describe("generateSpacecraft", () => {
  const run = (craft: Craft, maxIntervals?: number) => {
    const client = new FakeHorizons({ [-9]: craft });
    return generateSpacecraft({
      client,
      spacecraft: [{ id: -9, name: "Testcraft" }],
      fromYear: 1900,
      toYear: 2100,
      chunkYears: 10,
      targetFraction: 0.5,
      ...(maxIntervals ? { maxIntervals } : {}),
    }).then((r) => ({ ...r, client }));
  };

  it("VN-EPH-003: the flyby is refined until the fit holds 50 km everywhere, with nothing missed", async () => {
    const { files, objects } = await run(CRAFT);
    const m = objects[0] as {
      chunks: { file: string; coverage: { start: number; end: number } }[];
      misses: unknown[];
      refined: { t0: number; t1: number; step_minutes: number }[];
      max_error_km: { km: number };
      coverage: { start: number; end: number };
    };
    expect(m.misses).toEqual([]);
    const tc = CRAFT.bumps[0]!.tc;
    expect(m.refined.some((r) => r.t0 <= tc && r.t1 >= tc && r.step_minutes < 1440)).toBe(true);
    expect(m.max_error_km.km).toBeLessThan(25);
    expect(m.chunks.map((c) => c.file)).toEqual(["-9/2028.bin", "-9/2030.bin"]);
    // Held-out check at epochs off every sampling grid, dense around the flyby.
    const eph = m.chunks.map((c) => {
      const b = files.get(c.file)!;
      return readEphemeris(b.buffer, b.byteOffset, b.byteLength);
    });
    const out = new Float64Array(6);
    let worst = 0;
    const epochs: number[] = [];
    for (let k = 0; k < 400; k++) epochs.push(tc - 2 * DAY + k * 433.7);
    for (let t = m.coverage.start + 1234.5; t < m.coverage.end; t += 3.3 * DAY) epochs.push(t);
    for (const t of epochs) {
      const f = eph.find((e) => findSegment(e, t) >= 0)!;
      const i = findSegment(f, t);
      evaluateSegment(f.coeffs, i * 3 * (f.degree + 1), f.degree + 1, f.t0[i]!, f.t1[i]!, t, out, 0);
      const [x, y, z] = truth(CRAFT, t);
      worst = Math.max(worst, Math.hypot(out[0]! - x!, out[1]! - y!, out[2]! - z!));
    }
    expect(worst).toBeLessThan(50); // VN-EPH-003 cruise tolerance
  });

  it("VN-EPH-003: a feature too sharp for the 1 min step limit is listed as a miss", async () => {
    // A 100 s wobble of 500 km for a day: nothing sampled every minute can follow it.
    const tc = sec("2029-05-10T06:03:00");
    const sharp = { ...CRAFT, bumps: [], wobble: { tc, km: 500, period: 100, half: 12 * 3600 } };
    const { objects } = await run(sharp);
    const m = objects[0] as { misses: { t0: number; t1: number; error_km: number }[] };
    expect(m.misses.length).toBeGreaterThan(0);
    expect(m.misses.every((x) => x.error_km > 50 && x.t1 >= tc - 13 * 3600 && x.t0 <= tc + 13 * 3600)).toBe(true);
  });

  it("VN-EPH-003: a seam in Horizons' trajectory gets a segment boundary within seconds, both sides within tolerance", async () => {
    const tj = sec("2029-09-01T12:02:30");
    const seamed = { ...CRAFT, seams: [{ t: tj, km: 1.97e6 }] };
    const { files, objects } = await run(seamed);
    const m = objects[0] as {
      chunks: { file: string }[];
      misses: unknown[];
      seams: { t: number; t_after: number; jump_km: number }[];
    };
    expect(m.misses).toEqual([]);
    expect(m.seams).toHaveLength(1);
    expect(m.seams[0]!.t).toBeLessThanOrEqual(tj);
    expect(m.seams[0]!.t_after).toBeGreaterThan(tj);
    expect(m.seams[0]!.t_after - m.seams[0]!.t).toBeLessThanOrEqual(5);
    expect(m.seams[0]!.jump_km).toBeCloseTo(1.97e6, -3);
    const b = files.get(m.chunks[0]!.file)!;
    const f = readEphemeris(b.buffer, b.byteOffset, b.byteLength);
    const out = new Float64Array(6);
    let worst = 0;
    for (const t of [tj - 3600, tj - 60, tj - 6, tj + 6, tj + 61, tj + 3600, tj + 5 * DAY]) {
      const i = findSegment(f, t);
      evaluateSegment(f.coeffs, i * 3 * (f.degree + 1), f.degree + 1, f.t0[i]!, f.t1[i]!, t, out, 0);
      const [x, y, z] = truth(seamed, t);
      worst = Math.max(worst, Math.hypot(out[0]! - x!, out[1]! - y!, out[2]! - z!));
    }
    expect(worst).toBeLessThan(50);
  });

  it("VN-EPH-003: a 60 km seam inside a flyby window, invisible to the 5 min fit, is found and cut at 1 min", async () => {
    const tj = CRAFT.bumps[0]!.tc + 2 * 3600 + 90;
    const seamed = { ...CRAFT, seams: [{ t: tj, km: 60 }] };
    const { objects } = await run(seamed);
    const m = objects[0] as { misses: unknown[]; seams: { t: number; t_after: number }[] };
    expect(m.misses).toEqual([]);
    expect(m.seams).toHaveLength(1);
    expect(m.seams[0]!.t).toBeLessThanOrEqual(tj);
    expect(m.seams[0]!.t_after).toBeGreaterThan(tj);
  });

  it("VN-GEN-010: two runs give byte-identical files; long windows split into stitched requests", async () => {
    const a = await run(CRAFT);
    const b = await run(CRAFT, 100);
    expect(b.client.queries.length).toBeGreaterThan(a.client.queries.length);
    const c = await run(CRAFT);
    expect([...c.files.keys()]).toEqual([...a.files.keys()]);
    for (const [k, v] of a.files) expect(Buffer.from(c.files.get(k)!).equals(Buffer.from(v))).toBe(true);
    expect(JSON.stringify(c.objects)).toBe(JSON.stringify(a.objects));
    // Splitting requests changes nothing in the output either.
    for (const [k, v] of a.files) expect(Buffer.from(b.files.get(k)!).equals(Buffer.from(v))).toBe(true);
  });
});

describe("pipeline wiring", () => {
  it("VN-CAT-002: the heliocentric spacecraft come from the catalog; orbiters wait for T-089", async () => {
    const { readFileSync } = await import("node:fs");
    const { heliocentricSpacecraft } = await import("./main.ts");
    const catalog = JSON.parse(readFileSync(new URL("../../data/catalog.json", import.meta.url), "utf8"));
    const ids = heliocentricSpacecraft(catalog).map((s) => s.id);
    expect(ids).toEqual([-255, -226, -170, -159, -98, -96, -64, -49, -32, -31, -28, -24, -23]); // T-085: Rosetta, Pioneer 10 and 11
  });

  it("VN-EPH-008: spacecraft reference epochs lie inside coverage, off the grid, and visit refined windows", async () => {
    const { spacecraftEpochs } = await import("./check.ts");
    const o = {
      id: -9,
      coverage: { start: sec("2028-03-03T10:20:00"), end: sec("2031-06-30T05:00:00") },
      refined: [{ t0: sec("2029-05-09T00:00:00"), t1: sec("2029-05-11T00:00:00"), step_minutes: 5 }],
    };
    const jds = spacecraftEpochs(o, 20, 10);
    expect([...jds].sort()).toEqual(jds);
    const ts = jds.map((j) => (Number(j) - J2000_JD) * DAY);
    expect(ts.every((t) => t > o.coverage.start && t < o.coverage.end)).toBe(true);
    expect(ts.filter((t) => t > o.refined[0]!.t0 && t < o.refined[0]!.t1).length).toBeGreaterThanOrEqual(10);
    expect(ts.every((t) => Math.abs(t / 300 - Math.round(t / 300)) > 1e-3)).toBe(true);
  });
});
