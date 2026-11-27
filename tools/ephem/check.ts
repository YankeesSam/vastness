// VN-EPH-008: `npm run ephem:check`. Compares every generated ephemeris with Horizons reference samples (F2,
// testdata/reference) at epochs the fit never saw (scattered, not on the 6 h sample grid), prints one row per object
// (max error, its epoch, tolerance, pass) and exits non-zero when any object is over tolerance, has no reference,
// or has reference epochs outside its coverage (unless --partial).
//
//   npm run ephem:check [-- --partial] [--dir=public/ephem]
//   npm run ephem:check -- --record      (records F2 through the polite client; the only live step)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFile } from "../../src/core/ephem/ephemeris.ts";
import { findSegment, readEphemeris, type EphemerisFile } from "../../src/core/ephem/format.ts";
import { J2000_JD } from "../../src/core/time/scales.ts";
import { HorizonsClient } from "./client.ts";
import { canonicalQuery, parseVectors, vectorParamsAt, type VectorRecord } from "./horizons.ts";
import { stableStringify, yearStart, type BodiesFile, type Fetcher } from "./main.ts";

/** F2 epochs per body over 1900-2100: about five per decade chunk. */
export const REFERENCE_EPOCHS = 100;
export const TLIST_BATCH = 40;

export interface ReferenceSample {
  /** JD TDB text as Horizons printed it. */
  jd: string;
  /** TDB seconds since J2000. */
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface ReferenceFile {
  id: number;
  center: number;
  query: string;
  retrieved: string;
  source: string;
  samples: ReferenceSample[];
}

interface ManifestObject {
  id: number;
  name: string;
  origin?: boolean;
  center?: number;
  tolerance_km?: number;
  chunks?: Array<{ file: string; coverage: { start: number; end: number } }>;
}

export interface Manifest {
  objects: ManifestObject[];
}

export interface CheckRow {
  id: number;
  name: string;
  /** Reference samples compared. */
  checked: number;
  /** Reference samples outside the generated coverage. */
  uncovered: number;
  maxErrorKm: number;
  /** JD TDB text of the worst sample. */
  worstJd: string;
  toleranceKm: number;
  pass: boolean;
  note: string;
}

/** Compares each non-origin object in the manifest with its reference samples. */
export function checkEphemerides(
  manifest: Manifest,
  loadChunk: (file: string) => Uint8Array,
  references: readonly ReferenceFile[],
  options: { partial?: boolean } = {},
): CheckRow[] {
  const refs = new Map(references.map((r) => [r.id, r]));
  const out = new Float64Array(6);
  const rows: CheckRow[] = [];
  for (const o of [...manifest.objects].sort((a, b) => a.id - b.id)) {
    if (o.origin) continue;
    const row: CheckRow = {
      id: o.id,
      name: o.name,
      checked: 0,
      uncovered: 0,
      maxErrorKm: 0,
      worstJd: "",
      toleranceKm: o.tolerance_km ?? 0,
      pass: false,
      note: "",
    };
    rows.push(row);
    const ref = refs.get(o.id);
    if (!ref) {
      row.note = "no reference samples";
      continue;
    }
    if (ref.center !== o.center) {
      row.note = `reference centre ${ref.center} is not ${o.center}`;
      continue;
    }
    const files: EphemerisFile[] = (o.chunks ?? []).map((c) => {
      const b = loadChunk(c.file);
      return readEphemeris(b.buffer, b.byteOffset, b.byteLength);
    });
    for (const s of ref.samples) {
      const f = files.find((x) => findSegment(x, s.t) >= 0);
      if (!f) {
        row.uncovered++;
        continue;
      }
      evaluateFile(f, s.t, out, 0);
      const e = Math.hypot(out[0]! - s.x, out[1]! - s.y, out[2]! - s.z);
      row.checked++;
      if (e > row.maxErrorKm || row.worstJd === "") {
        row.maxErrorKm = Math.max(e, row.maxErrorKm);
        row.worstJd = s.jd;
      }
    }
    const within = row.maxErrorKm <= row.toleranceKm;
    if (row.checked === 0) row.note = "no reference epoch inside coverage";
    else if (row.uncovered > 0 && !options.partial) row.note = `${row.uncovered} reference epochs outside coverage`;
    else if (!within) row.note = "over tolerance";
    row.pass = row.checked > 0 && within && (row.uncovered === 0 || options.partial === true);
  }
  return rows;
}

/** The accuracy table (Markdown, so the release notes can quote it, VN-EPH-008). */
export function formatTable(rows: readonly CheckRow[]): string {
  const lines = [
    "| Object | ID | Samples | Max error (km) | At JD TDB | Tolerance (km) | Result |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.id} | ${r.checked}${r.uncovered ? ` (+${r.uncovered} outside)` : ""} | ` +
        `${r.checked ? r.maxErrorKm.toFixed(3) : "-"} | ${r.worstJd || "-"} | ${r.toleranceKm} | ` +
        `${r.pass ? "pass" : `FAIL${r.note ? `: ${r.note}` : ""}`} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

/** Deterministic reference epochs for one body: scattered over the coverage, off the fitting grid. */
export function referenceEpochs(id: number, fromYear: number, toYear: number, count: number): string[] {
  let state = (Math.abs(id) * 2654435761) >>> 0 || 1;
  const next = (): number => {
    // xorshift32: seeded, reproducible (VN-GEN-010)
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 2 ** 32;
  };
  const a = J2000_JD + yearStart(fromYear) / 86400;
  const b = J2000_JD + yearStart(toYear) / 86400;
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    // Stratified so the whole span is covered; 1e-6 day resolution; nudged off the 6 h grid.
    let jd = a + ((b - a) * (k + next())) / count;
    jd = Math.round(jd * 1e6) / 1e6;
    if (Math.abs(jd * 8 - Math.round(jd * 8)) < 1e-3) jd += 0.013;
    if (jd >= b) jd = b - 0.37;
    out.push(jd.toFixed(6));
  }
  return out;
}

/** F2 epochs per heliocentric spacecraft scattered over its coverage, plus this many around refined windows. */
export const SPACECRAFT_EPOCHS = 60;
export const SPACECRAFT_FLYBY_EPOCHS = 60;

interface SpacecraftObject {
  id: number;
  kind?: string;
  center?: number;
  coverage?: { start: number; end: number };
  refined?: Array<{ t0: number; t1: number; step_minutes: number }>;
}

/**
 * Reference epochs for a spacecraft (VN-EPH-008): stratified over its coverage like the bodies', plus epochs inside
 * the windows the fit refined (launch, flybys, perihelia), where an error is most likely. Deterministic, sorted,
 * off the sampling grids, strictly inside the coverage.
 */
export function spacecraftEpochs(o: SpacecraftObject, scattered: number, flyby: number): string[] {
  const a = J2000_JD + o.coverage!.start / 86400;
  const b = J2000_JD + o.coverage!.end / 86400;
  const out = new Set<string>();
  const add = (jd: number): void => {
    let x = Math.round(jd * 1e6) / 1e6;
    if (Math.abs(x * 288 - Math.round(x * 288)) < 1e-2) x += 0.000731; // off the 5 min grid
    if (x > a && x < b) out.add(x.toFixed(6));
  };
  const span = b - a;
  for (let k = 0; k < scattered; k++) add(a + (span * (k + 0.5 + 0.37 * Math.sin(o.id * 7.1 + k))) / scattered);
  // The finest windows first: they are where the trajectory bends most.
  const windows = [...(o.refined ?? [])].sort((x, y) => x.step_minutes - y.step_minutes || x.t0 - y.t0);
  const per = Math.max(1, Math.floor(flyby / Math.max(1, windows.length)));
  let left = flyby;
  for (const w of windows) {
    for (let k = 0; k < per && left > 0; k++, left--) {
      add(J2000_JD + (w.t0 + ((w.t1 - w.t0) * (k + 0.5)) / per + 97) / 86400);
    }
    if (left <= 0) break;
  }
  return [...out].sort();
}

/** Fetches F2 for heliocentric spacecraft named in the manifest. */
export async function recordSpacecraftReferences(
  manifest: { objects: SpacecraftObject[] },
  client: Fetcher,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const o of [...manifest.objects].sort((x, y) => x.id - y.id)) {
    if (o.kind !== "spacecraft" || !o.coverage) continue;
    const jds = spacecraftEpochs(o, SPACECRAFT_EPOCHS, SPACECRAFT_FLYBY_EPOCHS);
    files.set(`${o.id}.json`, await recordOne(o.id, o.center ?? 10, jds, client));
  }
  return files;
}

async function recordOne(id: number, center: number, jds: readonly string[], client: Fetcher): Promise<string> {
  const params = vectorParamsAt(String(id), `500@${center}`, jds);
  const records: VectorRecord[] = [];
  const retrieved: string[] = [];
  const sources = new Set<string>();
  for (let k = 0; k < jds.length; k += TLIST_BATCH) {
    const batch = jds.slice(k, k + TLIST_BATCH);
    const res = await client.get(vectorParamsAt(String(id), `500@${center}`, batch));
    const v = parseVectors(res.body, res.query);
    if (v.records.length !== batch.length || v.records.some((r, i) => r.jd !== `${batch[i]}000`)) {
      throw new Error(
        `reference records for ${id} do not match the ${batch.length} epochs asked (query: ${res.query})`,
      );
    }
    records.push(...v.records);
    retrieved.push(res.retrieved);
    sources.add(v.header.source);
  }
  const ref: ReferenceFile = {
    id,
    center,
    query: canonicalQuery({ ...params, TLIST: `(${jds.length} epochs in requests of ${TLIST_BATCH}, listed below)` }),
    retrieved: retrieved.sort().at(-1)!,
    source: [...sources].sort().join("; "),
    samples: records.map((r) => ({ jd: r.jd, t: r.t, x: r.x, y: r.y, z: r.z })),
  };
  return stableStringify(ref);
}

/** Fetches F2 for every non-origin body: one listed-epoch query each. */
export async function recordReferences(
  bodies: BodiesFile,
  client: Fetcher,
  count: number,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const b of [...bodies.bodies].sort((x, y) => x.id - y.id)) {
    if (b.origin) continue;
    const jds = referenceEpochs(b.id, bodies.coverage.from_year, bodies.coverage.to_year, count);
    // At most TLIST_BATCH epochs per request: a longer GET URL is refused (HTTP 502).
    files.set(`${b.id}.json`, await recordOne(b.id, b.center!, jds, client));
  }
  return files;
}

async function main(): Promise<number> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const refDir = join(root, "testdata/reference");
  if (process.argv.includes("--record")) {
    const bodies = JSON.parse(readFileSync(join(root, "data/bodies.json"), "utf8")) as BodiesFile;
    const client = new HorizonsClient({ cacheDir: join(root, ".cache/horizons"), budget: 80 });
    const files = await recordReferences(bodies, client, REFERENCE_EPOCHS);
    const manifestFile = join(root, "public/ephem/manifest.json");
    if (existsSync(manifestFile)) {
      const sc = await recordSpacecraftReferences(JSON.parse(readFileSync(manifestFile, "utf8")), client);
      for (const [k, v] of sc) files.set(k, v);
    }
    mkdirSync(refDir, { recursive: true });
    for (const [name, text] of files) writeFileSync(join(refDir, name), text);
    console.error(
      `recorded ${files.size} reference files; ${client.requests} requests, ${client.cacheHits} cache hits`,
    );
    return 0;
  }
  const dirArg = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
  const dir = resolve(root, dirArg ?? "public/ephem");
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`ephem:check: no ${manifestPath}; run npm run ephem first`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const refs = existsSync(refDir)
    ? readdirSync(refDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(refDir, f), "utf8")) as ReferenceFile)
    : [];
  const rows = checkEphemerides(manifest, (f) => readFileSync(join(dir, f)), refs, {
    partial: process.argv.includes("--partial"),
  });
  process.stdout.write(formatTable(rows));
  const failed = rows.filter((r) => !r.pass);
  console.error(
    failed.length
      ? `ephem:check: ${failed.length} of ${rows.length} objects FAIL`
      : `ephem:check: all ${rows.length} objects pass`,
  );
  return failed.length || rows.length === 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`ephem:check: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
