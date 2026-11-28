// T-101, T-102 (VN-EXT-005..007): the space weather files joined for the app: CMEs with their CDAW mass and energy,
// times as TDB seconds (converted once, at load), and the questions the scene and the panel ask at a time t: which
// CMEs are in flight, which flares are lit, which arrivals are near, the Kp of the storm under way, the L1 wind.

import { cmeTimes, inFlight, tdbFromIso, type InFlight } from "./cme";
import type { Cme, DonkiFile, Flare, GeoStorm, Shock, SolarWindFile, SolarWindHour } from "./types";

/** The CDAW values the app uses (public/spaceweather/cdaw.json `matches`). */
export interface CdawValues {
  id: string;
  cdaw: string;
  mass: number | null;
  energy: number | null;
  poor: boolean;
  remarks: string;
}

export interface CdawFile {
  credit: string;
  retrieved: string;
  rule: string;
  matches: CdawValues[];
}

export interface StormCme extends Cme {
  cdaw: CdawValues | null;
}

/** A predicted (WSA-Enlil) or measured (DONKI IPS) arrival. */
export interface Arrival {
  t: number;
  iso: string;
  /** DONKI's place name: "Earth", "STEREO A", "Parker Solar Probe", ... */
  location: string;
  kind: "predicted" | "measured";
  glancing: boolean;
  cme: string | null;
  /** Kp: predicted range for Earth (Enlil), or the observed maximum of a linked storm. */
  kp: string | null;
}

export interface SpaceWeather {
  cmes: StormCme[];
  starts: Float64Array;
  t21: Float64Array;
  speed: Float64Array;
  flares: Array<Flare & { t: number }>;
  storms: Array<GeoStorm & { t: number; kpT: Float64Array }>;
  arrivals: Arrival[];
  wind: Array<SolarWindHour & { t0: number }>;
  windSpan: { start: string | null; end: string | null };
  kp: Array<{ t: number; iso: string; kp: number }>;
  credits: string[];
  retrieved: { donki: string; cdaw: string | null; swpc: string | null };
  rules: { analysis: string; enlil: string; cdaw: string | null };
  flareNote: string | null;
}

const byT = <T extends { t: number }>(a: T, b: T): number => a.t - b.t;

export function buildSpaceWeather(donki: DonkiFile, cdaw: CdawFile | null, swpc: SolarWindFile | null): SpaceWeather {
  const mass = new Map((cdaw?.matches ?? []).map((m) => [m.id, m]));
  const cmes = donki.cmes.map((c) => ({ ...c, cdaw: mass.get(c.id) ?? null }));
  const times = cmes.map(cmeTimes);
  const stormKp = new Map(donki.storms.map((g) => [g.id, g.kpMax]));
  const arrivals: Arrival[] = [];
  for (const c of cmes) {
    const e = c.enlil;
    if (!e) continue;
    if (e.earthArrival)
      arrivals.push({
        t: tdbFromIso(e.earthArrival),
        iso: e.earthArrival,
        location: "Earth",
        kind: "predicted",
        glancing: e.earthGlancing,
        cme: c.id,
        kp: e.kp90 !== null || e.kp180 !== null ? `${e.kp90 ?? "?"} to ${e.kp180 ?? "?"}` : null,
      });
    for (const i of e.impacts)
      arrivals.push({
        t: tdbFromIso(i.arrival),
        iso: i.arrival,
        location: i.location,
        kind: "predicted",
        glancing: i.glancing,
        cme: c.id,
        kp: null,
      });
  }
  const stormT = donki.storms.map((g) => tdbFromIso(g.start));
  for (const s of donki.shocks as Shock[]) {
    // The storm a measured shock at Earth brought: one that shares a CME and starts from 6 h before to 24 h after.
    const ts = tdbFromIso(s.time);
    const g = donki.storms.find(
      (x, i) => stormT[i]! >= ts - 6 * 3600 && stormT[i]! <= ts + 86400 && x.cmes.some((id) => s.cmes.includes(id)),
    );
    arrivals.push({
      t: ts,
      iso: s.time,
      location: s.location,
      kind: "measured",
      glancing: false,
      cme: s.cmes[0] ?? null,
      kp: s.location === "Earth" && g ? `${stormKp.get(g.id)} observed` : null,
    });
  }
  arrivals.sort(byT);
  return {
    cmes,
    starts: Float64Array.from(times, (x) => x.start),
    t21: Float64Array.from(times, (x) => x.t21),
    speed: Float64Array.from(cmes, (c) => c.speed),
    flares: donki.flares.map((f) => ({ ...f, t: tdbFromIso(f.begin) })).sort(byT),
    storms: donki.storms
      .map((g) => ({ ...g, t: tdbFromIso(g.start), kpT: Float64Array.from(g.kp, (k) => tdbFromIso(k[0])) }))
      .sort(byT),
    arrivals,
    wind: (swpc?.hours ?? []).map((h) => ({ ...h, t0: tdbFromIso(h.t) })),
    windSpan: swpc?.span ?? { start: null, end: null },
    kp: (swpc?.kp ?? []).map(([iso, kp]) => ({ t: tdbFromIso(iso), iso, kp })),
    credits: [donki.credit, cdaw?.credit, swpc?.credit].filter((c): c is string => !!c),
    retrieved: { donki: donki.retrieved, cdaw: cdaw?.retrieved ?? null, swpc: swpc?.retrieved ?? null },
    rules: { ...donki.rules, cdaw: cdaw?.rule ?? null },
    flareNote: donki.flareNote,
  };
}

export function cmesInFlight(sw: SpaceWeather, t: number, out: InFlight[] = []): InFlight[] {
  return inFlight(sw.starts, sw.t21, sw.speed, t, out);
}

/** How long a flare mark stays lit after its begin time (DONKI's flare list, with peak and end, is not available). */
export const FLARE_SHOWN_S = 2 * 3600;
/** Arrival marks show this long either side of the arrival time. */
export const ARRIVAL_WINDOW_S = 12 * 3600;

/** Last index i with xs[i].t <= t, or -1. */
function lastAtOrBefore<T extends { t: number }>(xs: T[], t: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function flaresLit(sw: SpaceWeather, t: number): Array<Flare & { t: number }> {
  const out: Array<Flare & { t: number }> = [];
  for (let i = lastAtOrBefore(sw.flares, t); i >= 0 && t - sw.flares[i]!.t <= FLARE_SHOWN_S; i--)
    out.push(sw.flares[i]!);
  return out.reverse();
}

export function arrivalsNear(sw: SpaceWeather, t: number, spanS = ARRIVAL_WINDOW_S): Arrival[] {
  const out: Arrival[] = [];
  for (let i = Math.max(0, lastAtOrBefore(sw.arrivals, t - spanS)); i < sw.arrivals.length; i++) {
    const a = sw.arrivals[i]!;
    if (a.t > t + spanS) break;
    if (Math.abs(a.t - t) <= spanS) out.push(a);
  }
  return out;
}

/** The DONKI geomagnetic storm under way at t (between its start and its last observed Kp + 3 h) and the Kp then. */
export function stormAt(sw: SpaceWeather, t: number): { storm: GeoStorm; kp: number } | null {
  for (let i = lastAtOrBefore(sw.storms, t); i >= 0 && i >= lastAtOrBefore(sw.storms, t) - 3; i--) {
    const g = sw.storms[i]!;
    const end = (g.kpT.at(-1) ?? g.t) + 3 * 3600;
    if (t > end) continue;
    let kp = g.kp[0]?.[1] ?? g.kpMax;
    for (let k = 0; k < g.kpT.length; k++) if (g.kpT[k]! <= t) kp = g.kp[k]![1];
    return { storm: g, kp };
  }
  return null;
}

/** SWPC's measured hour at L1 containing t, or null outside the span SWPC served at build time. */
export function windAt(sw: SpaceWeather, t: number): (SolarWindHour & { t0: number }) | null {
  for (const h of sw.wind) if (t >= h.t0 && t < h.t0 + 3600) return h;
  return null;
}

/** SWPC's planetary Kp for the 3-hour interval containing t, or null outside its span. */
export function kpAt(sw: SpaceWeather, t: number): { iso: string; kp: number } | null {
  for (const k of sw.kp) if (t >= k.t && t < k.t + 3 * 3600) return k;
  return null;
}
