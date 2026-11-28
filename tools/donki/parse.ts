// T-086 (VN-EXT-001): NASA DONKI (CCMC Space Weather Database Of Notifications, Knowledge, Information) responses
// to the compact public/spaceweather/donki.json. Pure: tools/donki/build.ts does the fetching.
//
// DONKI's CME records carry their analyses and, on each analysis, the WSA-Enlil runs made from it, so the CME list,
// the storm list (GST) and the measured shock list (IPS) are all we need. The flare list (FLR) answers 404 on
// api.nasa.gov as of 2026-11-27; flares are taken from the CME records' linked flare IDs (time and source, no class).

import type { Cme, DonkiFile, EnlilPrediction, Flare, GeoStorm, Shock } from "../../src/core/spaceweather/types.ts";

export const ANALYSIS_RULE =
  "per CME, the analysis DONKI marks most accurate; when several are, the leading edge (LE) before the shock (SH); when none is, the latest submitted";
export const ENLIL_RULE = "the WSA-Enlil run on the kept analysis with the latest model completion time";
export const CREDIT = "Space weather events from NASA DONKI (Community Coordinated Modeling Center, NASA GSFC)";
export const SOURCE = "https://api.nasa.gov/DONKI (CME, GST, IPS)";

type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v !== "null" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "2024-05-08T04:37:00-FLR-001" -> "2024-05-08T04:37Z". */
export function idTime(id: string): string {
  return `${id.slice(0, 16)}Z`;
}

function linked(o: Obj, kind: string): string[] {
  return arr(o.linkedEvents)
    .map((e) => str(e.activityID))
    .filter((id): id is string => id !== null && id.includes(`-${kind}-`))
    .sort();
}

function keptAnalysis(analyses: Obj[]): Obj | null {
  if (analyses.length === 0) return null;
  const most = analyses.filter((a) => a.isMostAccurate === true);
  if (most.length > 0) return most.find((a) => a.featureCode === "LE") ?? most[0]!;
  return [...analyses].sort((a, b) => String(a.submissionTime).localeCompare(String(b.submissionTime))).at(-1)!;
}

function enlil(runs: Obj[]): EnlilPrediction | null {
  if (runs.length === 0) return null;
  const r = [...runs]
    .sort((a, b) => String(a.modelCompletionTime).localeCompare(String(b.modelCompletionTime)))
    .at(-1)!;
  return {
    modelCompletion: String(r.modelCompletionTime),
    earthArrival: str(r.estimatedShockArrivalTime),
    earthGlancing: r.isEarthGB === true,
    kp90: num(r.kp_90),
    kp180: num(r.kp_180),
    impacts: arr(r.impactList)
      .map((i) => ({
        location: String(i.location),
        arrival: String(i.arrivalTime),
        glancing: i.isGlancingBlow === true,
      }))
      .sort((a, b) => a.location.localeCompare(b.location) || a.arrival.localeCompare(b.arrival)),
    link: String(r.link ?? ""),
  };
}

/** CMEs with a usable analysis (direction, half-angle and speed), and the flares they link. */
export function parseCmes(raw: unknown): { cmes: Cme[]; flares: Flare[]; skipped: string[] } {
  const cmes: Cme[] = [];
  const skipped: string[] = [];
  const flares: Flare[] = [];
  for (const c of arr(raw)) {
    const a = keptAnalysis(arr(c.cmeAnalyses));
    const id = str(c.activityID);
    if (!a || !id) continue;
    const lat = num(a.latitude);
    const lon = num(a.longitude);
    const halfAngle = num(a.halfAngle);
    const speed = num(a.speed);
    const t21 = str(a.time21_5);
    if (lat === null || lon === null || halfAngle === null || speed === null || t21 === null) {
      skipped.push(id);
      continue;
    }
    const source = str(c.sourceLocation);
    const flareIds = linked(c, "FLR");
    for (const f of flareIds) flares.push({ id: f, begin: idTime(f), class: null, source });
    cmes.push({
      id,
      start: String(c.startTime),
      t21,
      lat,
      lon,
      halfAngle,
      speed,
      type: String(a.type ?? ""),
      feature: str(a.featureCode) ?? "",
      source,
      activeRegion: num(c.activeRegionNum),
      flares: flareIds,
      enlil: enlil(arr(a.enlilList)),
      storms: linked(c, "GST"),
      shocks: linked(c, "IPS"),
      link: String(c.link ?? ""),
    });
  }
  return { cmes, flares, skipped };
}

export function parseStorms(raw: unknown): GeoStorm[] {
  return arr(raw).map((g) => {
    const kp = arr(g.allKpIndex)
      .map((k): [string, number] => [String(k.observedTime), num(k.kpIndex) ?? 0])
      .sort((a, b) => a[0].localeCompare(b[0]));
    return {
      id: String(g.gstID),
      start: String(g.startTime),
      kpMax: Math.max(0, ...kp.map((k) => k[1])),
      kp,
      cmes: linked(g, "CME"),
    };
  });
}

export function parseShocks(raw: unknown): Shock[] {
  return arr(raw).map((s) => ({
    id: String(s.activityID),
    location: String(s.location),
    time: String(s.eventTime),
    cmes: linked(s, "CME"),
  }));
}

function byIdUnique<T extends { id: string }>(items: T[], key: (t: T) => string): T[] {
  const m = new Map<string, T>();
  for (const t of items) m.set(t.id, t);
  return [...m.values()].sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

export interface BuildMeta {
  start: string;
  end: string;
  retrieved: string;
  flareNote: string | null;
}

/** The data file from every chunk's raw response (months may overlap at their edges: deduplicated by ID). */
export function buildDonki(raw: { cme: unknown[]; gst: unknown[]; ips: unknown[] }, meta: BuildMeta): DonkiFile {
  const parsed = raw.cme.map(parseCmes);
  return {
    source: SOURCE,
    credit: CREDIT,
    retrieved: meta.retrieved,
    span: { start: meta.start, end: meta.end },
    rules: { analysis: ANALYSIS_RULE, enlil: ENLIL_RULE },
    flareNote: meta.flareNote,
    skipped: [...new Set(parsed.flatMap((p) => p.skipped))].sort(),
    cmes: byIdUnique(
      parsed.flatMap((p) => p.cmes),
      (c) => c.start,
    ),
    flares: byIdUnique(
      parsed.flatMap((p) => p.flares),
      (f) => f.begin,
    ),
    storms: byIdUnique(raw.gst.flatMap(parseStorms), (g) => g.start),
    shocks: byIdUnique(raw.ips.flatMap(parseShocks), (s) => s.time),
  };
}

/** Calendar-month [start, end] date pairs covering start..end inclusive. */
export function monthChunks(start: string, end: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  let first = start;
  for (;;) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push([first, last < end ? last : end]);
    if (last >= end) return out;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    first = `${y}-${String(m).padStart(2, "0")}-01`;
  }
}
