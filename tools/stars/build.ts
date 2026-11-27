// VN-SCN-007, T-064: builds public/stars.bin from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit and
// Warren 1991), as NASA HEASARC serves it (table heasarc_bsc5p, a .tdat dump). Keeps stars with a V magnitude of 6.5
// or brighter, turns J2000 right ascension and declination into unit vectors in the ecliptic J2000 frame the scene
// uses (the obliquity Horizons uses, src/core/frames.ts) and writes them brightest first (ties by HR number), so the
// output is deterministic. Proper motion is not applied: over 1900-2100 the largest in the catalogue (61 Cyg, 5.2"/yr)
// moves a star under 0.3 degrees, and nearly all move under an arcminute.
// Run: `npm run stars` (reads .cache/stars/heasarc_bsc5p.tdat.gz; `--fetch` downloads it once, politely).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { eclipticFromEquatorial } from "../../src/core/frames.ts";
import { STAR_MAG_LIMIT, STAR_STRIDE, encodeStars, unitFromRaDec } from "../../src/core/sky/stars.ts";

export const BSC5P_URL = "https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/dump/heasarc_bsc5p.tdat.gz";
export const USER_AGENT = "vastness-stars-pipeline (+https://github.com/YankeesSam/vastness)";

export interface CatalogStar {
  hr: number;
  name: string;
  raDeg: number;
  decDeg: number;
  vmag: number;
  /** NaN when the catalogue has none. */
  bv: number;
}

/** Parses a HEASARC .tdat dump: the field order from `line[1] = ...`, then `|`-separated rows between <DATA> and <END>. */
export function parseTdat(text: string): CatalogStar[] {
  const lines = text.split(/\r?\n/);
  const fieldLine = lines.find((l) => l.startsWith("line[1] = "));
  if (!fieldLine) throw new Error("tdat: no line[1] field list");
  const fields = fieldLine.slice("line[1] = ".length).trim().split(/\s+/);
  const col = (name: string) => {
    const i = fields.indexOf(name);
    if (i < 0) throw new Error(`tdat: no field ${name}`);
    return i;
  };
  const iHr = col("hr");
  const iName = col("name");
  const iRa = col("ra");
  const iDec = col("dec");
  const iV = col("vmag");
  const iBv = col("bv_color");
  const start = lines.indexOf("<DATA>");
  if (start < 0) throw new Error("tdat: no <DATA>");
  const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? NaN : Number(s));
  const out: CatalogStar[] = [];
  for (let k = start + 1; k < lines.length; k++) {
    const line = lines[k]!;
    if (line.startsWith("<END>")) break;
    if (line.trim() === "") continue;
    const v = line.split("|");
    out.push({
      hr: num(v[iHr]),
      name: (v[iName] ?? "").trim(),
      raDeg: num(v[iRa]),
      decDeg: num(v[iDec]),
      vmag: num(v[iV]),
      bv: num(v[iBv]),
    });
  }
  return out;
}

/** The stars kept (V <= 6.5 with a position), brightest first, ties by HR number. */
export function selectStars(stars: readonly CatalogStar[]): CatalogStar[] {
  return stars
    .filter((s) => Number.isFinite(s.raDeg) && Number.isFinite(s.decDeg) && s.vmag <= STAR_MAG_LIMIT)
    .sort((a, b) => a.vmag - b.vmag || a.hr - b.hr);
}

/** STAR_STRIDE floats per star: ecliptic J2000 unit vector, V, B-V. */
export function starData(stars: readonly CatalogStar[]): Float32Array {
  const out = new Float32Array(STAR_STRIDE * stars.length);
  const eq = new Float64Array(3);
  const ecl = new Float64Array(3);
  stars.forEach((s, i) => {
    eclipticFromEquatorial(unitFromRaDec(s.raDeg, s.decDeg, eq), ecl);
    out.set([ecl[0]!, ecl[1]!, ecl[2]!, s.vmag, s.bv], STAR_STRIDE * i);
  });
  return out;
}

export function buildStars(tdat: string): { buffer: ArrayBuffer; count: number } {
  const kept = selectStars(parseTdat(tdat));
  return { buffer: encodeStars(starData(kept)), count: kept.length };
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const cacheDir = `${root}.cache/stars/`;
  const raw = `${cacheDir}heasarc_bsc5p.tdat.gz`;
  if (process.argv.includes("--fetch") || !existsSync(raw)) {
    if (!process.argv.includes("--fetch")) throw new Error(`${raw} is missing; run with --fetch to download it once`);
    const res = await fetch(BSC5P_URL, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${BSC5P_URL}: HTTP ${res.status}`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  const { buffer, count } = buildStars(gunzipSync(readFileSync(raw)).toString("latin1"));
  writeFileSync(`${root}public/stars.bin`, Buffer.from(buffer));
  process.stdout.write(
    `stars: ${count} stars to V ${STAR_MAG_LIMIT}, ${buffer.byteLength} bytes -> public/stars.bin\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    process.stderr.write(`stars: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
