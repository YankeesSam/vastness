// T-100 (VN-EXT-006): the CDAW SOHO/LASCO CME catalog (NASA GSFC, univ_all.txt) and its match to DONKI's CMEs.
// Pure: tools/cdaw/build.ts fetches the catalog.
//
// The text catalog has one row per CME: date, time of first C2 appearance, central position angle (or "Halo"),
// angular width, linear speed, second-order speeds (initial, final, at 20 Rs), acceleration, mass (g), kinetic
// energy (erg), measurement position angle and remarks. A trailing asterisk marks a value the catalog calls
// uncertain; "-------" a value it does not have. Remarks such as "Poor Event" or "Very Poor Event" grade the event.

import type { Cme } from "../../src/core/spaceweather/types.ts";

export interface CdawRow {
  /** UTC ISO to the second, "2024-05-08T05:36:06Z". */
  time: string;
  /** Central position angle (deg from solar north toward east), null for a halo. */
  pa: number | null;
  width: number;
  linearSpeed: number | null;
  /** Grams and erg, null when the catalog has none. */
  mass: number | null;
  massUncertain: boolean;
  energy: number | null;
  energyUncertain: boolean;
  remarks: string;
}

export interface CdawMatch {
  /** DONKI CME ID. */
  id: string;
  cdaw: string;
  /** CDAW time minus DONKI start, minutes. */
  dtMin: number;
  pa: number | null;
  width: number;
  linearSpeed: number | null;
  mass: number | null;
  energy: number | null;
  /** The catalog marks the mass or energy uncertain, or grades the event poor. */
  poor: boolean;
  remarks: string;
}

export const MATCH_WINDOW_MIN = 45;
export const PA_MARGIN_DEG = 30;
export const MATCH_RULE = `a DONKI CME matches the CDAW row whose first C2 time is within ${MATCH_WINDOW_MIN} min of the DONKI start time and whose position angle agrees: a halo (width 360), a DONKI direction within 30 deg of disk centre, or a central PA within half the width plus ${PA_MARGIN_DEG} deg of the PA of the DONKI direction projected on the sky; among several, the nearest in time; each CDAW row matches at most one CME`;

function value(tok: string): { v: number | null; uncertain: boolean } {
  const uncertain = tok.endsWith("*");
  const t = uncertain ? tok.slice(0, -1) : tok;
  if (/^-+$/.test(t)) return { v: null, uncertain };
  const v = Number(t);
  return { v: Number.isFinite(v) ? v : null, uncertain };
}

/** Catalog rows, and the catalog's "LAST UPDATED" date (YYYY-MM-DD) when it states one. */
export function parseCatalog(text: string): { rows: CdawRow[]; updated: string | null } {
  const rows: CdawRow[] = [];
  const up = /LAST UPDATED:\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(text);
  for (const line of text.split("\n")) {
    if (!/^\d{4}\/\d{2}\/\d{2}\s/.test(line)) continue;
    const tok = line.trim().split(/\s+/);
    if (tok.length < 12) continue;
    const [date, time, cpa, width, linear, , , , , mass, energy] = tok;
    const m = value(mass!);
    const e = value(energy!);
    rows.push({
      time: `${date!.replaceAll("/", "-")}T${time}Z`,
      pa: cpa === "Halo" ? null : Number(cpa),
      width: Number(width),
      linearSpeed: value(linear!).v,
      mass: m.v,
      massUncertain: m.uncertain,
      energy: e.v,
      energyUncertain: e.uncertain,
      remarks: tok.slice(12).join(" "),
    });
  }
  return { rows, updated: up ? `${up[1]}-${up[2]}-${up[3]}` : null };
}

const RAD = Math.PI / 180;

/** Sky position angle (deg, north through east) of a Stonyhurst direction seen from Earth, and its distance from disk centre (0..1). */
export function skyPa(lat: number, lon: number): { pa: number; r: number } {
  const x = Math.cos(lat * RAD) * Math.sin(lon * RAD); // toward solar west
  const y = Math.sin(lat * RAD); // toward solar north
  const pa = (((Math.atan2(-x, y) / RAD) % 360) + 360) % 360;
  return { pa, r: Math.hypot(x, y) };
}

function paAgrees(c: Cme, row: CdawRow): boolean {
  if (row.pa === null || row.width >= 360) return true;
  const { pa, r } = skyPa(c.lat, c.lon);
  if (r < Math.sin(30 * RAD)) return true;
  const d = Math.abs(((pa - row.pa + 540) % 360) - 180);
  return d <= row.width / 2 + PA_MARGIN_DEG;
}

const minutes = (iso: string): number => Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`) / 60000;

export function isPoor(r: CdawRow): boolean {
  return r.massUncertain || r.energyUncertain || /poor/i.test(r.remarks);
}

/** Matches by the rule above; `unmatched` lists DONKI CMEs inside the catalog's span that found none. */
export function matchCatalog(cmes: Cme[], rows: CdawRow[]): { matches: CdawMatch[]; unmatched: string[] } {
  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
  const t = sorted.map((r) => minutes(r.time));
  const last = t.at(-1) ?? -Infinity;
  const used = new Set<number>();
  const matches: CdawMatch[] = [];
  const unmatched: string[] = [];
  for (const c of [...cmes].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))) {
    const tc = minutes(c.start);
    let best = -1;
    // binary search for the first row inside the window
    let lo = 0;
    let hi = t.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid]! < tc - MATCH_WINDOW_MIN) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < t.length && t[i]! <= tc + MATCH_WINDOW_MIN; i++) {
      if (used.has(i) || !paAgrees(c, sorted[i]!)) continue;
      if (best < 0 || Math.abs(t[i]! - tc) < Math.abs(t[best]! - tc)) best = i;
    }
    if (best < 0) {
      if (tc <= last + MATCH_WINDOW_MIN) unmatched.push(c.id);
      continue;
    }
    used.add(best);
    const r = sorted[best]!;
    matches.push({
      id: c.id,
      cdaw: r.time,
      dtMin: Math.round(t[best]! - tc),
      pa: r.pa,
      width: r.width,
      linearSpeed: r.linearSpeed,
      mass: r.mass,
      energy: r.energy,
      poor: isPoor(r),
      remarks: r.remarks,
    });
  }
  return { matches, unmatched };
}
