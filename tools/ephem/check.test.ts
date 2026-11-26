import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeEphemeris } from "../../src/core/ephem/format.ts";
import type { CachedResponse } from "./client.ts";
import {
  REFERENCE_EPOCHS,
  TLIST_BATCH,
  checkEphemerides,
  formatTable,
  recordReferences,
  referenceEpochs,
  type Manifest,
  type ReferenceFile,
} from "./check.ts";
import { fitAdaptive, type Sample } from "./fit.ts";
import { canonicalQuery, secondsFromJdText } from "./horizons.ts";
import { yearStart, type BodiesFile } from "./main.ts";

const DAY = 86400;
const AU = 149_597_870.7;
const W = (2 * Math.PI) / (365.25 * DAY);
// Closed-form truth for the synthetic ephemeris and its references.
const truth = (t: number): [number, number, number, number, number, number] => [
  AU * Math.cos(W * t),
  AU * Math.sin(W * t),
  0,
  -AU * W * Math.sin(W * t),
  AU * W * Math.cos(W * t),
  0,
];

const T0 = yearStart(2000);
const T1 = yearStart(2001);
const samples: Sample[] = [];
for (let t = T0; t <= T1; t += DAY / 2) {
  const [x, y, z, vx, vy, vz] = truth(t);
  samples.push({ t, x, y, z, vx, vy, vz });
}
const fit = fitAdaptive(samples, { toleranceKm: 10, targetKm: 5 });
const CHUNK = writeEphemeris({ objectId: 399, centerId: 10, degree: fit.degree, segments: fit.segments });

const MANIFEST: Manifest = {
  objects: [
    { id: 10, name: "Sun", origin: true },
    {
      id: 399,
      name: "Earth",
      center: 10,
      tolerance_km: 10,
      chunks: [{ file: "399/2000.bin", coverage: { start: T0, end: T1 } }],
    },
  ],
};
const load = (file: string): Uint8Array => {
  if (file !== "399/2000.bin") throw new Error(file);
  return CHUNK;
};

function reference(jds: string[], offsetKm = 0): ReferenceFile {
  return {
    id: 399,
    center: 10,
    query: "q",
    retrieved: "2026-11-26",
    source: "DE441",
    samples: jds.map((jd) => {
      const t = secondsFromJdText(jd);
      const [x, y, z] = truth(t);
      return { jd, t, x: x + offsetKm, y, z };
    }),
  };
}
const INSIDE = ["2451600.123457", "2451700.654321", "2451800.987654"];

describe("ephem:check (T-019)", () => {
  it("VN-EPH-008: an ephemeris within tolerance at held-out reference epochs passes, one row per object", () => {
    const rows = checkEphemerides(MANIFEST, load, [reference(INSIDE)]);
    expect(rows).toHaveLength(1); // the origin has no file to check
    expect(rows[0]).toMatchObject({ id: 399, name: "Earth", checked: 3, uncovered: 0, toleranceKm: 10, pass: true });
    expect(rows[0]!.maxErrorKm).toBeLessThan(10);
    expect(INSIDE).toContain(rows[0]!.worstJd);
    const table = formatTable(rows);
    expect(table.split("\n")[0]).toBe(
      "| Object | ID | Samples | Max error (km) | At JD TDB | Tolerance (km) | Result |",
    );
    expect(table).toMatch(/\| Earth \| 399 \| 3 \| \d+\.\d{3} \| 2451\d{3}\.\d{6} \| 10 \| pass \|/);
  });

  it("VN-EPH-008: an object over tolerance fails with its max error and epoch", () => {
    const rows = checkEphemerides(MANIFEST, load, [reference(INSIDE, 25)]);
    expect(rows[0]!.pass).toBe(false);
    expect(rows[0]!.maxErrorKm).toBeGreaterThan(20);
    expect(formatTable(rows)).toContain("FAIL: over tolerance");
  });

  it("VN-EPH-008: every ephemeris must have references, inside its coverage unless --partial", () => {
    expect(checkEphemerides(MANIFEST, load, [])[0]).toMatchObject({ pass: false, note: "no reference samples" });
    const some = reference([...INSIDE, "2415100.250000", "2488000.300000"]);
    expect(checkEphemerides(MANIFEST, load, [some])[0]).toMatchObject({
      pass: false,
      checked: 3,
      uncovered: 2,
      note: "2 reference epochs outside coverage",
    });
    expect(checkEphemerides(MANIFEST, load, [some], { partial: true })[0]!.pass).toBe(true);
    const outside = reference(["2415100.250000"]);
    expect(checkEphemerides(MANIFEST, load, [outside], { partial: true })[0]!.pass).toBe(false);
    const wrongCentre = { ...reference(INSIDE), center: 0 };
    expect(checkEphemerides(MANIFEST, load, [wrongCentre])[0]!.note).toMatch(/centre 0 is not 10/);
  });

  it("VN-EPH-008: reference epochs are seeded, span the coverage and avoid the fitting grid", () => {
    const a = referenceEpochs(599, 1900, 2100, REFERENCE_EPOCHS);
    expect(referenceEpochs(599, 1900, 2100, REFERENCE_EPOCHS)).toEqual(a);
    expect(referenceEpochs(499, 1900, 2100, REFERENCE_EPOCHS)).not.toEqual(a);
    const t = a.map(secondsFromJdText);
    expect(t.every((x) => x >= yearStart(1900) && x < yearStart(2100))).toBe(true);
    // Stratified: one epoch in each of the 100 equal slices.
    const slice = (yearStart(2100) - yearStart(1900)) / REFERENCE_EPOCHS;
    t.forEach((x, k) => expect(Math.floor((x - yearStart(1900)) / slice)).toBe(k));
    // Not on the 3 h grid that any sample step in data/bodies.json lands on.
    for (const jd of a) expect(Math.abs(Number(jd) * 8 - Math.round(Number(jd) * 8))).toBeGreaterThan(1e-4);
  });

  it("VN-EPH-008: F2 holds the seeded epochs for every body in data/bodies.json, relative to its centre", () => {
    const bodies = JSON.parse(readFileSync(new URL("../../data/bodies.json", import.meta.url), "utf8")) as BodiesFile;
    const dir = new URL("../../testdata/reference/", import.meta.url);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const expected = bodies.bodies
      .filter((b) => !b.origin)
      .map((b) => `${b.id}.json`)
      .sort();
    expect(files).toEqual(expected);
    for (const b of bodies.bodies.filter((x) => !x.origin)) {
      const ref = JSON.parse(readFileSync(new URL(`${b.id}.json`, dir), "utf8")) as ReferenceFile;
      expect(ref.id).toBe(b.id);
      expect(ref.center).toBe(b.center);
      expect(ref.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ref.source).not.toBe("");
      const jds = referenceEpochs(b.id, bodies.coverage.from_year, bodies.coverage.to_year, REFERENCE_EPOCHS);
      expect(ref.samples.map((s) => s.jd)).toEqual(jds.map((j) => `${j}000`));
      for (const s of ref.samples) expect(s.t).toBe(secondsFromJdText(s.jd));
    }
  });

  it("VN-EPH-008: recording asks Horizons for the listed epochs in batches and keeps them in order", async () => {
    const asked: string[][] = [];
    const client = {
      async get(params: Record<string, string>): Promise<CachedResponse> {
        const jds = params.TLIST!.split(" ").map((s) => s.replace(/'/g, ""));
        asked.push(jds);
        const rows = jds.map((jd) => `${jd}000, A.D. x, ${truth(secondsFromJdText(jd)).join(", ")},`);
        const result = [
          "Target body name: Earth (399)    {source: DE441}",
          "Center body name: Sun (10)       {source: DE441}",
          "Reference frame : Ecliptic of J2000.0",
          " JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ,",
          "$$SOE",
          ...rows,
          "$$EOE",
        ].join("\n");
        return {
          body: JSON.stringify({ result }),
          retrieved: "2026-11-26",
          fromCache: false,
          query: canonicalQuery(params),
        };
      },
    };
    const bodies: BodiesFile = {
      coverage: { from_year: 1900, to_year: 2100 },
      chunk_years: 10,
      bodies: [
        { id: 10, name: "Sun", origin: true },
        { id: 399, name: "Earth", center: 10, step_hours: 12, tolerance: "planet" },
      ],
    };
    const files = await recordReferences(bodies, client, 100);
    expect([...files.keys()]).toEqual(["399.json"]);
    expect(asked.map((a) => a.length)).toEqual([TLIST_BATCH, TLIST_BATCH, 100 - 2 * TLIST_BATCH]);
    const ref = JSON.parse(files.get("399.json")!) as ReferenceFile;
    expect(ref.samples.map((s) => s.jd)).toEqual(asked.flat().map((j) => `${j}000`));
    expect(ref.query).toContain("TLIST=(100%20epochs");
  });
});
