// T-102 (VN-EXT-007): NOAA SWPC real-time solar wind at L1 (json/rtsw: plasma and magnetic field, 1-minute, the
// last day) and the planetary Kp index (products/noaa-planetary-k-index.json, 3-hourly, the last week), reduced to
// hourly means. Pure: tools/swpc/build.ts fetches. SWPC serves several L1 spacecraft at once and marks the one in
// operational use `active`; only active rows with overall_quality 0 are used.

import type { SolarWindFile, SolarWindHour } from "../../src/core/spaceweather/types.ts";

type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "2026-11-27T22:14:00" -> "2026-11-27T22:00Z". */
const hourOf = (tag: string): string => `${tag.slice(0, 13)}:00Z`;

interface Acc {
  n: number;
  sum: number;
}
const add = (m: Map<string, Acc>, k: string, v: number | null): void => {
  if (v === null) return;
  const a = m.get(k) ?? { n: 0, sum: 0 };
  a.n++;
  a.sum += v;
  m.set(k, a);
};
const mean = (m: Map<string, Acc>, k: string, digits: number): number | null => {
  const a = m.get(k);
  return a && a.n > 0 ? Number((a.sum / a.n).toFixed(digits)) : null;
};

/** Hourly means of the active, good-quality minutes; the spacecraft each hour came from. */
export function hourlySolarWind(wind: unknown, mag: unknown): SolarWindHour[] {
  const density = new Map<string, Acc>();
  const speed = new Map<string, Acc>();
  const bz = new Map<string, Acc>();
  const bt = new Map<string, Acc>();
  const src = new Map<string, Set<string>>();
  const good = (r: Obj): boolean =>
    r.active === true && (r.overall_quality ?? 0) === 0 && typeof r.time_tag === "string";
  for (const r of arr(wind).filter(good)) {
    const h = hourOf(r.time_tag as string);
    add(density, h, num(r.proton_density));
    add(speed, h, num(r.proton_speed));
    src.set(h, (src.get(h) ?? new Set()).add(String(r.source)));
  }
  for (const r of arr(mag).filter(good)) {
    const h = hourOf(r.time_tag as string);
    add(bz, h, num(r.bz_gsm));
    add(bt, h, num(r.bt));
    src.set(h, (src.get(h) ?? new Set()).add(String(r.source)));
  }
  return [...src.keys()].sort().map((t) => ({
    t,
    density: mean(density, t, 2),
    speed: mean(speed, t, 1),
    bz: mean(bz, t, 2),
    bt: mean(bt, t, 2),
    minutes: Math.max(density.get(t)?.n ?? 0, bz.get(t)?.n ?? 0),
    source: [...src.get(t)!].sort().join(","),
  }));
}

export function planetaryKp(raw: unknown): Array<[string, number]> {
  return arr(raw)
    .filter((r) => typeof r.time_tag === "string" && num(r.Kp) !== null)
    .map((r): [string, number] => [`${(r.time_tag as string).slice(0, 16)}Z`, num(r.Kp)!])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildSolarWind(
  raw: { wind: unknown; mag: unknown; kp: unknown },
  meta: { retrieved: string; source: string; credit: string },
): SolarWindFile {
  const hours = hourlySolarWind(raw.wind, raw.mag);
  const kp = planetaryKp(raw.kp);
  return {
    source: meta.source,
    credit: meta.credit,
    retrieved: meta.retrieved,
    span: { start: hours[0]?.t ?? null, end: hours.at(-1)?.t ?? null },
    kpSpan: { start: kp[0]?.[0] ?? null, end: kp.at(-1)?.[0] ?? null },
    hours,
    kp,
  };
}
