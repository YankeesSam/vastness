// VN-DAT-009, VN-CAT-007, ADR-0007: build-time GP elements for the catalog's Earth satellites. The catalog's
// `satellite` entries name the NORAD numbers; each is fetched from CelesTrak (OMM JSON) through the polite client,
// checked (one record, the right NORAD number, an object name the catalog knows), and written with provenance to
// data/satellites.json: element epoch, element set number, retrieval instant, source URL. `issCheck` compares SGP4
// (src/core/sgp4) through TEME -> J2000 ecliptic with Horizons' ISS trajectory (-125544), an independent check of
// propagator, frames and time arguments. Run: `npm run gp` (`--offline`, `--refresh`, `--check-iss`).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fold } from "../../src/app/objects/search.ts";
import { fromOmm, initialize, propagate, type Omm } from "../../src/core/sgp4/sgp4.ts";
import { temeToJ2000 } from "../../src/core/sgp4/teme.ts";
import { SECONDS_PER_DAY, parseUtc, ttFromTdb } from "../../src/core/time/scales.ts";
import type { VectorRecord } from "../ephem/horizons.ts";
import { stableStringify } from "../ephem/main.ts";
import { GpClient, GpError, type GpResponse } from "./client.ts";

export const GP_CREDIT = "Orbital elements from CelesTrak (celestrak.org)";

/** The OMM keywords kept per satellite: what SGP4 needs plus identification (CCSDS 502.0-B-3 names). */
export interface GpElements extends Omm {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export interface SatelliteRecord {
  id: number;
  norad: number;
  name: string;
  /** Element epoch, ISO UTC with Z. */
  epoch: string;
  /** UTC instant of retrieval (ISO with Z). */
  retrieved: string;
  source: string;
  omm: GpElements;
}

export interface SatellitesFile {
  credit: string;
  frame: "TEME";
  theory: "SGP4";
  satellites: SatelliteRecord[];
}

const NUMBERS = [
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "BSTAR",
  "MEAN_MOTION_DOT",
  "MEAN_MOTION_DDOT",
  "NORAD_CAT_ID",
  "ELEMENT_SET_NO",
  "REV_AT_EPOCH",
] as const;
const EPOCH = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/;

/** One satellite's OMM record from a CelesTrak JSON body; throws GpError naming the NORAD number on any fault. */
export function parseGp(body: string, norad: number): GpElements {
  const at = `NORAD ${norad}`;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    // CelesTrak answers an unknown or decayed number with plain text ("No GP data found").
    throw new GpError(`${at}: CelesTrak returned no elements: ${body.trim().split("\n")[0]!.slice(0, 80)}`);
  }
  if (!Array.isArray(json) || json.length !== 1) {
    throw new GpError(`${at}: expected one OMM record, got ${Array.isArray(json) ? json.length : typeof json}`);
  }
  const r = json[0] as Record<string, unknown>;
  for (const k of NUMBERS) {
    if (typeof r[k] !== "number" || !Number.isFinite(r[k])) throw new GpError(`${at}: ${k} missing or not a number`);
  }
  if (typeof r.EPOCH !== "string" || !EPOCH.test(r.EPOCH)) throw new GpError(`${at}: bad EPOCH`);
  if (typeof r.OBJECT_NAME !== "string" || typeof r.OBJECT_ID !== "string") throw new GpError(`${at}: no name`);
  if (r.NORAD_CAT_ID !== norad) throw new GpError(`${at}: record is for NORAD ${String(r.NORAD_CAT_ID)}`);
  if ((r.ECCENTRICITY as number) < 0 || (r.ECCENTRICITY as number) >= 1 || (r.MEAN_MOTION as number) <= 0) {
    throw new GpError(`${at}: not a closed orbit`);
  }
  const out: Record<string, unknown> = { EPOCH: r.EPOCH, OBJECT_NAME: r.OBJECT_NAME, OBJECT_ID: r.OBJECT_ID };
  for (const k of NUMBERS) out[k] = r[k];
  return out as unknown as GpElements;
}

export interface SatelliteEntry {
  id: number;
  norad?: number;
  name: string;
  aliases: string[];
  type: string;
}

/** The catalog's satellites, by NORAD number. */
export function catalogSatellites(catalog: { objects: SatelliteEntry[] }): SatelliteEntry[] {
  return catalog.objects.filter((o) => o.type === "satellite").sort((a, b) => a.norad! - b.norad!);
}

/** The record for one satellite; the OMM name must be the catalog's name or an alias (a wrong NORAD number fails). */
export function satelliteRecord(entry: SatelliteEntry, omm: GpElements, res: GpResponse): SatelliteRecord {
  const names = [entry.name, ...entry.aliases].map(fold);
  if (!names.includes(fold(omm.OBJECT_NAME))) {
    throw new GpError(
      `NORAD ${entry.norad}: CelesTrak names it "${omm.OBJECT_NAME}", the catalog "${entry.name}" (add the name as an alias if it is the same object)`,
    );
  }
  return {
    id: entry.id,
    norad: entry.norad!,
    name: entry.name,
    epoch: `${omm.EPOCH}Z`,
    retrieved: res.retrieved,
    source: res.url,
    omm,
  };
}

export function satellitesFile(records: readonly SatelliteRecord[]): string {
  const file: SatellitesFile = {
    credit: GP_CREDIT,
    frame: "TEME",
    theory: "SGP4",
    satellites: [...records].sort((a, b) => a.norad - b.norad),
  };
  return stableStringify(file);
}

export async function fetchSatellites(
  entries: readonly SatelliteEntry[],
  client: Pick<GpClient, "get">,
): Promise<SatelliteRecord[]> {
  const out: SatelliteRecord[] = [];
  // Serial, and the first failure ends the run (CelesTrak's rule for machine clients).
  for (const e of entries) {
    const res = await client.get(e.norad!);
    out.push(satelliteRecord(e, parseGp(res.body, e.norad!), res));
  }
  return out;
}

export interface IssCheckRow {
  t: number;
  /** Hours from the element epoch. */
  hours: number;
  errKm: number;
  /** The difference SGP4 - Horizons along Horizons' radial, along-track and cross-track directions, km. */
  radialKm: number;
  alongKm: number;
  crossKm: number;
}

/**
 * SGP4 positions (TEME -> J2000 ecliptic, Earth-centred) against Horizons state vectors (Earth-centred, ecliptic
 * J2000, TDB) at the Horizons epochs. SGP4 counts minutes from the UTC element epoch; both instants are TDB here, so
 * their difference is the elapsed time (no leap second falls inside a day's check). The difference is split into
 * radial, along-track and cross-track parts: a frame error shows across the track, a time-scale error (leap seconds,
 * TT-UTC) as a large along-track offset; mean-element drift grows along the track.
 */
export function issCheck(omm: Omm, horizons: readonly VectorRecord[]): IssCheckRow[] {
  const sat = initialize(fromOmm(omm));
  const epoch = parseUtc(omm.EPOCH);
  const st = new Float64Array(6);
  return horizons.map((h) => {
    const err = propagate(sat, (h.t - epoch) / 60, st);
    if (err !== 0) throw new GpError(`SGP4 error ${err} at ${h.jd}`);
    temeToJ2000(st, ttFromTdb(h.t) / (36525 * SECONDS_PER_DAY));
    const dx = st[0]! - h.x;
    const dy = st[1]! - h.y;
    const dz = st[2]! - h.z;
    const r = Math.hypot(h.x, h.y, h.z);
    const [rx, ry, rz] = [h.x / r, h.y / r, h.z / r];
    let [wx, wy, wz] = [h.y * h.vz - h.z * h.vy, h.z * h.vx - h.x * h.vz, h.x * h.vy - h.y * h.vx];
    const w = Math.hypot(wx, wy, wz);
    [wx, wy, wz] = [wx / w, wy / w, wz / w];
    const [sx, sy, sz] = [wy * rz - wz * ry, wz * rx - wx * rz, wx * ry - wy * rx];
    return {
      t: h.t,
      hours: (h.t - epoch) / 3600,
      errKm: Math.hypot(dx, dy, dz),
      radialKm: dx * rx + dy * ry + dz * rz,
      alongKm: dx * sx + dy * sy + dz * sz,
      crossKm: dx * wx + dy * wy + dz * wz,
    };
  });
}

/** The largest absolute value of one column. */
export function worst(rows: readonly IssCheckRow[], k: "errKm" | "radialKm" | "alongKm" | "crossKm"): number {
  return rows.reduce((m, r) => Math.max(m, Math.abs(r[k])), 0);
}

/** Horizons query for the ISS check: Earth-centred, 10-minute steps over the day after the element epoch. */
export function issQuery(epochIso: string): {
  command: string;
  center: string;
  start: string;
  stop: string;
  step: string;
} {
  const t0 = new Date(`${epochIso.slice(0, 16)}Z`);
  t0.setUTCMinutes(Math.ceil(t0.getUTCMinutes() / 10) * 10);
  const t1 = new Date(t0.getTime() + SECONDS_PER_DAY * 1000);
  const f = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
  return { command: "-125544", center: "500@399", start: f(t0), stop: f(t1), step: "10 m" };
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const args = process.argv.slice(2);
  const catalog = JSON.parse(readFileSync(`${root}data/catalog.json`, "utf8")) as { objects: SatelliteEntry[] };
  const client = new GpClient({
    cacheDir: `${root}.cache/celestrak`,
    offline: args.includes("--offline"),
    refresh: args.includes("--refresh"),
    budget: 50,
  });
  const records = await fetchSatellites(catalogSatellites(catalog), client);
  writeFileSync(`${root}data/satellites.json`, satellitesFile(records));
  for (const r of records) process.stdout.write(`${String(r.norad).padStart(5)}  ${r.epoch}  ${r.name}\n`);
  process.stdout.write(
    `gp: ${records.length} satellites (${client.requests} requests, ${client.cacheHits} cached) -> data/satellites.json\n`,
  );
  if (args.includes("--check-iss")) {
    const { HorizonsClient } = await import("../ephem/client.ts");
    const { parseVectors, vectorParams } = await import("../ephem/horizons.ts");
    const iss = records.find((r) => r.norad === 25544);
    if (!iss) throw new GpError("no ISS in the catalog");
    const hc = new HorizonsClient({
      cacheDir: `${root}.cache/horizons`,
      offline: args.includes("--offline"),
      budget: 2,
    });
    const res = await hc.get(vectorParams(issQuery(iss.omm.EPOCH)));
    const rows = issCheck(iss.omm, parseVectors(res.body, res.query).records);
    const f = (k: Parameters<typeof worst>[1]) => worst(rows, k).toFixed(2);
    process.stdout.write(
      `ISS vs Horizons -125544 over ${rows.length} epochs: max ${f("errKm")} km (radial ${f("radialKm")}, along ${f("alongKm")}, cross ${f("crossKm")})\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    process.stderr.write(`gp: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
