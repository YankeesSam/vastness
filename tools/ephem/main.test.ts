import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateSegment } from "../../src/core/ephem/chebyshev.ts";
import { findSegment, readEphemeris } from "../../src/core/ephem/format.ts";
import type { CachedResponse } from "./client.ts";
import { canonicalQuery } from "./horizons.ts";
import {
  CREDIT,
  generate,
  horizonsCommand,
  stableStringify,
  writeOutputs,
  yearStart,
  type BodiesFile,
  type Fetcher,
} from "./main.ts";

const J2000_JD = 2451545;
const DAY = 86400;
const AU = 149_597_870.7;

const BODIES_JSON = JSON.parse(readFileSync(new URL("../../data/bodies.json", import.meta.url), "utf8")) as BodiesFile;

// A fake Horizons that answers vector queries from closed-form circular orbits, in the real response layout
// (header lines as in the F1 recordings). Each object has its own radius and period; the truth is known exactly.
const ORBITS: Record<number, { r: number; days: number; name: string; source: string }> = {
  399: { r: AU, days: 365.25, name: "Earth", source: "DE441" },
  301: { r: 384_400, days: 27.32, name: "Moon", source: "DE441" },
  499: { r: 1.524 * AU, days: 687, name: "Mars", source: "mar099" },
  4: { r: 1.524 * AU, days: 687, name: "Mars Barycenter", source: "DE441" },
  // T-107: a comet, asked for by designation; Horizons names it without an ID in the header.
  1000036: { r: 3 * AU, days: 1900, name: "1P/Halley", source: "JPL#75" },
};
/** Comet designations the fake knows, as the pipeline asks for them. */
const DESIGNATIONS: Record<string, number> = { "DES=1P;CAP;NOFRAG": 1000036 };
const NAMES: Record<number, string> = { 10: "Sun", 399: "Earth" };

function truth(id: number, t: number): [number, number, number, number, number, number] {
  const o = ORBITS[id]!;
  const w = (2 * Math.PI) / (o.days * DAY);
  const r = o.r;
  return [
    r * Math.cos(w * t),
    r * Math.sin(w * t),
    0.01 * r * Math.sin(w * t),
    -r * w * Math.sin(w * t),
    r * w * Math.cos(w * t),
    0.01 * r * w * Math.cos(w * t),
  ];
}

const unq = (v: string): string => v.replace(/^'|'$/g, "");

function fakeBody(params: Record<string, string>, refuse: (id: number, start: string) => boolean): string {
  const command = unq(params.COMMAND!);
  const id = DESIGNATIONS[command] ?? Number(command);
  const center = Number(unq(params.CENTER!).split("@")[1]);
  const start = unq(params.START_TIME!);
  if (refuse(id, start)) {
    return JSON.stringify({
      signature: { source: "NASA/JPL Horizons API", version: "1.2" },
      error: `\nNo ephemeris for target "${ORBITS[id]!.name}" prior to A.D. ${start}\n`,
    });
  }
  const t0 = yearStart(Number(start.slice(0, 4)));
  const t1 = yearStart(Number(unq(params.STOP_TIME!).slice(0, 4)));
  const step = Number(unq(params.STEP_SIZE!).split(" ")[0]) * 60;
  const lines: string[] = [];
  for (let t = t0; t <= t1; t += step) {
    const v = truth(id, t).map((x) => x.toExponential(15));
    lines.push(`${(J2000_JD + t / DAY).toFixed(9)}, A.D. calendar, ${v.join(", ")},`);
  }
  const o = ORBITS[id]!;
  const result = [
    "*******************************************************************************",
    Object.values(DESIGNATIONS).includes(id)
      ? `Target body name: ${o.name}                       {source: ${o.source}}`
      : `Target body name: ${o.name} (${id})                     {source: ${o.source}}`,
    `Center body name: ${NAMES[center]} (${center})          {source: DE441}`,
    "Reference frame : Ecliptic of J2000.0",
    "            JDTDB,            Calendar Date (TDB),   X,   Y,   Z,  VX,  VY,  VZ,",
    "$$SOE",
    ...lines,
    "$$EOE",
  ].join("\n");
  return JSON.stringify({ signature: { source: "NASA/JPL Horizons API", version: "1.2" }, result });
}

class FakeClient implements Fetcher {
  queries: string[] = [];
  constructor(private readonly refuse: (id: number, start: string) => boolean = () => false) {}
  async get(params: Record<string, string>): Promise<CachedResponse> {
    const query = canonicalQuery(params);
    this.queries.push(query);
    return { body: fakeBody(params, this.refuse), retrieved: "2026-11-26", fromCache: true, query };
  }
}

// Short coverage keeps the test fast; the pipeline is the same for 1900..2100 in decades.
const SMALL: BodiesFile = { ...BODIES_JSON, coverage: { from_year: 2000, to_year: 2002 }, chunk_years: 1 };
const ONLY = [10, 301, 399];

interface Manifest {
  format_version: number;
  credit: string;
  chunk_years: number;
  objects: Array<{
    id: number;
    name: string;
    origin?: boolean;
    center?: number;
    query?: Record<string, string>;
    retrieved?: string;
    source?: string;
    coverage?: { start: number; end: number; start_tdb: string; end_tdb: string };
    chunks?: Array<{
      file: string;
      coverage: { start: number; end: number };
      bytes: number;
      sha256: string;
      max_error_km: number;
      target: number;
    }>;
    tolerance_km?: number;
    max_error_km?: { km: number; epoch: number; jd_tdb: string };
    misses?: unknown[];
    fallbacks?: Array<{ file: string; target: number }>;
  }>;
}

const manifestOf = (files: Map<string, Uint8Array>): Manifest =>
  JSON.parse(new TextDecoder().decode(files.get("manifest.json"))) as Manifest;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("npm run ephem (T-018)", () => {
  it("VN-EPH-010: data/bodies.json lists the Sun as origin, the planets heliocentric, the Moon geocentric, by decade", () => {
    expect(BODIES_JSON.coverage).toEqual({ from_year: 1900, to_year: 2100 });
    expect(BODIES_JSON.chunk_years).toBe(10);
    const by = new Map(BODIES_JSON.bodies.map((b) => [b.id, b]));
    const comets = [1000012, 1000025, 1000036, 1000068, 1000093, 1000107, 1000132, 1003667, 1003913]; // T-107
    const dwarfs = [999, 20000001, 20136108, 20136199, 20136472]; // T-084
    expect([...by.keys()].sort((a, b) => a - b)).toEqual(
      [10, 199, 299, 301, 399, 499, 599, 699, 799, 899, ...dwarfs, ...comets].sort((a, b) => a - b),
    );
    for (const id of dwarfs)
      expect(by.get(id)).toMatchObject({ center: 10, tolerance: "planet", initial_intervals: 512 });
    expect(by.get(999)).toMatchObject({ barycenter: 9, step_hours: 6 }); // Charon swings Pluto round the barycentre
    for (const id of comets)
      expect(by.get(id)).toMatchObject({ center: 10, tolerance: "planet", initial_intervals: 512 });
    // Wild 2 passed 0.006 au from Jupiter in 1974: 2 h samples follow it.
    expect(by.get(1000107)!.step_hours).toBe(2);
    for (const id of dwarfs.slice(1)) expect(by.get(id)!.designation).toBe(String(id - 20_000_000));
    for (const id of comets) expect(by.get(id)!.designation).toMatch(/^(\d+P|C\/\d{4} [A-Z]\d+)$/);
    expect(by.get(10)!.origin).toBe(true);
    expect(by.get(301)).toMatchObject({ center: 399, tolerance: "moon" });
    for (const id of [199, 299, 399, 499, 599, 699, 799, 899])
      expect(by.get(id)).toMatchObject({ center: 10, tolerance: "planet" });
    for (const b of BODIES_JSON.bodies) if (!b.origin) expect(Number.isInteger(12 / b.step_hours!)).toBe(true);
  });

  it("VN-EPH-010: one file per body and chunk; chunks tile the coverage and evaluate to the truth within tolerance", async () => {
    const files = await generate({ bodies: SMALL, client: new FakeClient(), only: ONLY });
    expect([...files.keys()].sort()).toEqual([
      "301/2000.bin",
      "301/2001.bin",
      "399/2000.bin",
      "399/2001.bin",
      "manifest.json",
    ]);
    const out = new Float64Array(6);
    for (const id of [301, 399]) {
      const chunks = [2000, 2001].map((y) => {
        const b = files.get(`${id}/${y}.bin`)!;
        return readEphemeris(b.buffer, b.byteOffset, b.byteLength);
      });
      expect(chunks[0]!.start).toBe(yearStart(2000));
      expect(chunks[0]!.end).toBe(chunks[1]!.start);
      expect(chunks[1]!.end).toBe(yearStart(2002));
      expect(chunks[0]!.objectId).toBe(id);
      expect(chunks[0]!.centerId).toBe(id === 301 ? 399 : 10);
      for (let k = 0; k <= 400; k++) {
        const t = yearStart(2000) + ((yearStart(2002) - yearStart(2000)) * k) / 400;
        const f = t < chunks[0]!.end ? chunks[0]! : chunks[1]!;
        const i = findSegment(f, t);
        const n = f.degree + 1;
        evaluateSegment(f.coeffs, i * 3 * n, n, f.t0[i]!, f.t1[i]!, t, out, 0);
        const [x, y, z] = truth(id, t);
        expect(Math.hypot(out[0]! - x, out[1]! - y, out[2]! - z)).toBeLessThan(10); // VN-EPH-003
      }
    }
  });

  it("VN-DAT-005: the manifest carries query, retrieval date, header source, coverage, hashes and achieved error", async () => {
    const client = new FakeClient();
    const files = await generate({ bodies: SMALL, client, only: ONLY });
    const m = manifestOf(files);
    expect(m.format_version).toBe(1);
    expect(m.credit).toBe(CREDIT);
    expect(m.objects.map((o) => o.id)).toEqual([10, 301, 399]);
    expect(m.objects[0]).toEqual({ id: 10, name: "Sun", origin: true });
    const moon = m.objects[1]!;
    expect(moon.center).toBe(399);
    expect(moon.query).toMatchObject({
      COMMAND: "'301'",
      CENTER: "'500@399'",
      STEP_SIZE: "'360 m'",
      TIME_TYPE: "'TDB'",
    });
    expect(Object.keys(moon.query!)).toEqual(Object.keys(moon.query!).sort());
    expect(moon.retrieved).toBe("2026-11-26");
    expect(moon.source).toBe("DE441");
    expect(moon.coverage).toEqual({
      start: yearStart(2000),
      end: yearStart(2002),
      start_tdb: "2000-01-01",
      end_tdb: "2002-01-01",
    });
    expect(moon.tolerance_km).toBe(10);
    expect(moon.max_error_km!.km).toBeGreaterThan(0);
    expect(moon.max_error_km!.km).toBeLessThanOrEqual(10);
    expect(moon.misses).toEqual([]);
    expect(moon.fallbacks).toEqual([]);
    for (const c of moon.chunks!) {
      const bytes = files.get(c.file)!;
      expect(c.bytes).toBe(bytes.byteLength);
      expect(c.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    // One request per body and chunk, each a vector query the parser and header check accepted.
    expect(client.queries).toHaveLength(4);
  });

  it("VN-GEN-010: two runs on the same cache give byte-identical files; the manifest has sorted keys and LF", async () => {
    const a = await generate({ bodies: SMALL, client: new FakeClient(), only: ONLY });
    const b = await generate({ bodies: SMALL, client: new FakeClient(), only: ONLY });
    expect([...a.keys()]).toEqual([...b.keys()]);
    for (const [k, v] of a) expect(Buffer.from(b.get(k)!).equals(Buffer.from(v))).toBe(true);
    const text = new TextDecoder().decode(a.get("manifest.json"));
    expect(text).toBe(stableStringify(JSON.parse(text)));
    expect(text).not.toMatch(/\r/);
    expect(text.endsWith("}\n")).toBe(true);
    expect(stableStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{\n  "a": {\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
    );
  });

  it("VN-DAT-005: a planet centre Horizons refuses for a chunk falls back to the barycentre, recorded", async () => {
    const client = new FakeClient((id, start) => id === 499 && start.startsWith("2000"));
    const files = await generate({ bodies: SMALL, client, only: [499] });
    const mars = manifestOf(files).objects[0]!;
    expect(mars.fallbacks).toEqual([{ file: "499/2000.bin", target: 4 }]);
    expect(mars.chunks!.map((c) => c.target)).toEqual([4, 499]);
    expect(mars.source).toBe("DE441; mar099");
    expect(client.queries.some((q) => q.includes("COMMAND='4'"))).toBe(true);
  });

  it("VN-DAT-004: a response for a different target or centre than asked stops the run", async () => {
    const wrong: Fetcher = {
      async get(params) {
        const swapped = { ...params, COMMAND: "'399'" };
        return {
          body: fakeBody(swapped, () => false),
          retrieved: "2026-11-26",
          fromCache: true,
          query: canonicalQuery(params),
        };
      },
    };
    await expect(generate({ bodies: SMALL, client: wrong, only: [301] })).rejects.toThrow(/target is not 301/);
  });

  it("T-107, VN-EXT-015: a comet is asked for by designation (apparition closest to now, no fragments) and checked by name", async () => {
    const comet = {
      id: 1000036,
      name: "Halley",
      designation: "1P",
      center: 10,
      step_hours: 12,
      tolerance: "planet" as const,
    };
    const client = new FakeClient();
    const files = await generate({ bodies: { ...SMALL, bodies: [comet] }, client });
    expect(client.queries.every((q) => q.includes("COMMAND='DES%3D1P%3BCAP%3BNOFRAG'"))).toBe(true);
    const o = manifestOf(files).objects[0]! as Manifest["objects"][number] & { kind?: string; designation?: string };
    expect(o).toMatchObject({ id: 1000036, name: "Halley", kind: "comet", designation: "1P", source: "JPL#75" });
    expect(o.query!.COMMAND).toBe("'DES=1P;CAP;NOFRAG'");
    expect(o.chunks!.every((c) => c.target === 1000036)).toBe(true);
    const f = readEphemeris(files.get("1000036/2000.bin")!.buffer as ArrayBuffer);
    expect(f.objectId).toBe(1000036);
    // A header naming another comet stops the run.
    await expect(
      generate({ bodies: { ...SMALL, bodies: [{ ...comet, name: "Encke", designation: "1P" }] }, client }),
    ).rejects.toThrow(/target is not 1P \(Encke\)/);
  });

  it("T-084, VN-SCN-008: a dwarf planet with a minor-planet number is asked for as '<number>;'", () => {
    expect(horizonsCommand({ id: 20000001, designation: "1" })).toBe("1;");
    expect(horizonsCommand({ id: 20136199, designation: "136199" })).toBe("136199;");
    expect(horizonsCommand({ id: 1000036, designation: "1P" })).toBe("DES=1P;CAP;NOFRAG");
    expect(horizonsCommand({ id: 999 })).toBe("999");
  });

  it("VN-GEN-010: writeOutputs writes every file and removes stale chunks", () => {
    const dir = mkdtempSync(join(tmpdir(), "vastness-ephem-"));
    dirs.push(dir);
    mkdirSync(join(dir, "399"), { recursive: true });
    writeFileSync(join(dir, "399", "1890.bin"), "old");
    writeOutputs(
      dir,
      new Map([
        ["399/2000.bin", new Uint8Array([1, 2])],
        ["manifest.json", new Uint8Array([123, 125])],
      ]),
    );
    expect(existsSync(join(dir, "399", "1890.bin"))).toBe(false);
    expect([...readFileSync(join(dir, "399", "2000.bin"))]).toEqual([1, 2]);
    expect(readdirSync(dir).sort()).toEqual(["399", "manifest.json"]);
  });
});
