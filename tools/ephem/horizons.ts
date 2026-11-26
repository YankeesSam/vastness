// VN-DAT-001, VN-DAT-004: Horizons query builder and response parser. Pure: no network, no file system. The polite
// client (client.ts) does the fetching; this module turns a query into a URL and a response body into records.

import { SECONDS_PER_DAY, J2000_JD } from "../../src/core/time/scales.ts";

export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";

/** A state-vector query: geometric, ecliptic J2000 (ICRF), km and km/s, TDB (ADR-0003). */
export interface VectorQuery {
  /** Horizons COMMAND, e.g. "399" or "-31". */
  command: string;
  /** Horizons CENTER, e.g. "500@10" (Sun centre) or "500@399" (Earth centre). */
  center: string;
  /** START_TIME / STOP_TIME in TDB, e.g. "2000-01-01" or "2000-01-01 12:00". */
  start: string;
  stop: string;
  /** STEP_SIZE, e.g. "1 d" or "60 m". */
  step: string;
}

/** The full parameter set of a vector query with sorted keys; values carry Horizons' single quotes. */
export function vectorParams(q: VectorQuery): Record<string, string> {
  const p: Record<string, string> = {
    CENTER: q.center,
    COMMAND: q.command,
    CSV_FORMAT: "YES",
    EPHEM_TYPE: "VECTORS",
    MAKE_EPHEM: "YES",
    OBJ_DATA: "NO",
    OUT_UNITS: "KM-S",
    REF_PLANE: "ECLIPTIC",
    REF_SYSTEM: "ICRF",
    START_TIME: q.start,
    STEP_SIZE: q.step,
    STOP_TIME: q.stop,
    TIME_TYPE: "TDB",
    VEC_CORR: "NONE",
    VEC_TABLE: "2",
    format: "json",
  };
  const out: Record<string, string> = {};
  for (const k of Object.keys(p).sort()) out[k] = k === "format" ? p[k]! : `'${p[k]!}'`;
  return out;
}

/** A state-vector query at listed epochs (JD TDB texts) instead of a start, stop and step: F2 reference samples. */
export function vectorParamsAt(command: string, center: string, jds: readonly string[]): Record<string, string> {
  const p = vectorParams({ command, center, start: "", stop: "", step: "" });
  delete p.START_TIME;
  delete p.STOP_TIME;
  delete p.STEP_SIZE;
  p.TLIST = jds.map((jd) => `'${jd}'`).join(" ");
  p.TLIST_TYPE = "'JD'";
  const out: Record<string, string> = {};
  for (const k of Object.keys(p).sort()) out[k] = p[k]!;
  return out;
}

/** Canonical query string (sorted keys, URL-encoded values): the cache key source and the text quoted in errors. */
export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]!)}`)
    .join("&");
}

export function queryUrl(params: Record<string, string>): string {
  return `${HORIZONS_API}?${canonicalQuery(params)}`;
}

/** A Horizons error: the API's `error` field or an error text in the report, with the query that caused it. */
export class HorizonsError extends Error {
  readonly query: string;
  readonly kind: HorizonsErrorKind;
  constructor(kind: HorizonsErrorKind, detail: string, query: string) {
    super(`Horizons ${kind}: ${detail} (query: ${query})`);
    this.name = "HorizonsError";
    this.kind = kind;
    this.query = query;
  }
}

export type HorizonsErrorKind = "unknown-id" | "no-ephemeris" | "ambiguous" | "api" | "format";

/** Header fields that matter for provenance and for checking we got what we asked for (VN-DAT-004). */
export interface HorizonsHeader {
  /** e.g. "Earth (399)". */
  target: string;
  /** e.g. "Sun (10)". */
  center: string;
  /** The `{source: ...}` of the target line: the planetary solution (DE441) or trajectory file. */
  source: string;
  /** e.g. "Ecliptic of J2000.0" from "Reference frame" (Horizons ECLIPTIC with ICRF). */
  frame: string;
  /** Time scale of the epochs, "TDB". */
  timeScale: string;
  /** API version from the signature. */
  apiVersion: string;
}

export interface VectorRecord {
  /** TDB seconds since J2000, computed from the JD text without float JD round-off. */
  t: number;
  /** The JDTDB text as Horizons printed it. */
  jd: string;
  /** km */
  x: number;
  y: number;
  z: number;
  /** km/s */
  vx: number;
  vy: number;
  vz: number;
}

export interface VectorResponse {
  header: HorizonsHeader;
  records: VectorRecord[];
}

const ERROR_TEXTS: Array<[RegExp, HorizonsErrorKind]> = [
  [/No ephemeris for target[^\n]*/, "no-ephemeris"],
  [/No ephemeris (?:data )?available[^\n]*/i, "no-ephemeris"],
  [/Multiple major-bodies match[^\n]*/, "ambiguous"],
  [/Matching small-bodies[^\n]*/, "ambiguous"],
  [/No matches found[^\n]*/, "unknown-id"],
  [/requested IOBJ=\s*\S+ is out of bounds/, "unknown-id"],
  [/No such[^\n]*/i, "unknown-id"],
  [/Cannot [^\n]*/, "api"],
];

function classify(text: string): [HorizonsErrorKind, string] | undefined {
  for (const [re, kind] of ERROR_TEXTS) {
    const m = re.exec(text);
    if (m) return [kind, m[0].trim()];
  }
  return undefined;
}

/** TDB seconds since J2000 from a JD text like "2451545.000000000", exact to the printed digits. */
export function secondsFromJdText(jd: string): number {
  const m = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(jd);
  if (!m) throw new RangeError(`not a Julian date: "${jd}"`);
  const days = Number(m[1]) - J2000_JD;
  const frac = m[2] ? Number(`0.${m[2]}`) : 0;
  // Whole days and the fraction separately: the fraction times 86400 is exact to well under a microsecond.
  return days * SECONDS_PER_DAY + frac * SECONDS_PER_DAY;
}

function headerField(text: string, label: string): string | undefined {
  const re = new RegExp(`^${label}\\s*:\\s*(.+?)\\s*$`, "m");
  return re.exec(text)?.[1];
}

/** Parses a vector response body. Throws HorizonsError (with the query) on any API or report error. */
export function parseVectors(body: string, query: string): VectorResponse {
  let env: { result?: unknown; error?: unknown; signature?: { version?: unknown } };
  try {
    env = JSON.parse(body) as typeof env;
  } catch {
    throw new HorizonsError("format", "response is not JSON", query);
  }
  if (typeof env.error === "string") {
    const c = classify(env.error);
    throw new HorizonsError(c?.[0] ?? "api", c?.[1] ?? env.error.trim().split("\n")[0]!, query);
  }
  if (typeof env.result !== "string") throw new HorizonsError("format", "no result text", query);
  const text = env.result;
  const soe = text.indexOf("$$SOE");
  const eoe = text.indexOf("$$EOE");
  if (soe < 0 || eoe < soe) {
    const c = classify(text);
    throw new HorizonsError(c?.[0] ?? "format", c?.[1] ?? "no $$SOE/$$EOE vector table", query);
  }
  const head = text.slice(0, soe);
  const targetLine = headerField(head, "Target body name");
  const centerLine = headerField(head, "Center body name");
  if (!targetLine || !centerLine) throw new HorizonsError("format", "header lacks target or centre", query);
  const split = (line: string): [string, string] => {
    const m = /^(.*?)\s*\{source:\s*([^}]*)\}/.exec(line);
    return m ? [m[1]!.trim(), m[2]!.trim()] : [line.trim(), ""];
  };
  const [target, source] = split(targetLine);
  const [center] = split(centerLine);
  const frame = headerField(head, "Reference frame") ?? "";
  const timeScale = /JDTDB/.test(head) ? "TDB" : (headerField(head, "Time scale")?.split(/\s/)[0] ?? "");
  const header: HorizonsHeader = {
    target,
    center,
    source,
    frame,
    timeScale,
    apiVersion: typeof env.signature?.version === "string" ? env.signature.version : "",
  };

  const records: VectorRecord[] = [];
  for (const raw of text.slice(soe + 5, eoe).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(",").map((s) => s.trim());
    // JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ, (trailing comma)
    if (f.length < 8) throw new HorizonsError("format", `short vector record "${line}"`, query);
    const nums = f.slice(2, 8).map(Number);
    if (nums.some((v) => !Number.isFinite(v))) throw new HorizonsError("format", `bad number in "${line}"`, query);
    const [x, y, z, vx, vy, vz] = nums as [number, number, number, number, number, number];
    records.push({ t: secondsFromJdText(f[0]!), jd: f[0]!, x, y, z, vx, vy, vz });
  }
  if (records.length === 0) throw new HorizonsError("format", "empty vector table", query);
  return { header, records };
}
