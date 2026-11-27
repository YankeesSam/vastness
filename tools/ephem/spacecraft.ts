// VN-EPH-003, VN-EPH-007: heliocentric spacecraft ephemerides from launch (or Horizons' first epoch) to the end of
// Horizons' predictions. Coverage is found by asking Horizons for a day it cannot serve on each side and reading the
// edge from its refusal ("No ephemeris for target ... prior to A.D. 1977-SEP-05 13:59:24.3830 TDB"). Each decade
// chunk is sampled at 1 day and fitted; segments that miss the cruise tolerance (launch, flybys, perihelia) are
// fetched again at 4 h, 30 min, 5 min and 1 min and refitted at the chunk's degree until they pass; what still misses at
// 1 min is listed. Seams in Horizons' merged trajectories get a segment boundary. Deterministic on a warm cache (VN-GEN-010).

import { createHash } from "node:crypto";
import { evaluateSegment, fitSegment } from "../../src/core/ephem/chebyshev.ts";
import { writeEphemeris, type SegmentInput } from "../../src/core/ephem/format.ts";
import { J2000_JD, SECONDS_PER_DAY, calendarToJd } from "../../src/core/time/scales.ts";
import { DEGREES, TOLERANCE_KM, fitAdaptive, type FitResult, type Miss, type Sample } from "./fit.ts";
import { HorizonsError, parseVectors, vectorParams } from "./horizons.ts";
import type { Fetcher } from "./main.ts";

export interface SpacecraftSpec {
  id: number;
  name: string;
  /** Centre the states are relative to (default 10, the Sun); orbiters use their parent (VN-EPH-009). */
  center?: number;
}

/** Sample steps in minutes, coarse to fine; each divides the one before. The last is the step limit. */
export const STEP_LADDER_MIN = [1440, 240, 30, 5, 1] as const;
/** Coverage edges are rounded inwards to this grid (minutes), so every window is a whole number of 5 min steps. */
export const GRID_MIN = 10;
/** Most intervals in one request (Horizons returns at most about 90,000 lines). */
export const MAX_INTERVALS = 20_000;
/** A base window needs at least this many 2-day pairs (degree 13 with velocities needs 7 fitted samples). */
const MIN_BASE_PAIRS = 6;

const MIN = 60;
const DAY = SECONDS_PER_DAY;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const round = (x: number, digits: number): number => Number(x.toFixed(digits));

/** TDB seconds since J2000 at 0h TDB on 1 January of `year`. */
const yearStart = (year: number): number => (calendarToJd(year, 1, 1, 0) - J2000_JD) * DAY;

/** "YYYY-MM-DD HH:MM" (TDB) for a time on the minute grid; J2000 is 2000-01-01 12:00 TDB. */
export function tdbText(t: number): string {
  if (!Number.isInteger(t / MIN)) throw new RangeError(`${t} is not on the minute grid`);
  return new Date(Date.UTC(2000, 0, 1, 12) + t * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export interface CoverageEdge {
  side: "prior" | "after";
  /** TDB seconds since J2000. */
  t: number;
}

/** Reads the coverage edge from a Horizons refusal; undefined when the text is not one. */
export function parseCoverageEdge(text: string): CoverageEdge | undefined {
  const m =
    /No ephemeris for target "[^"]*" (prior to|after) A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?) TDB/.exec(
      text,
    );
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[3]!) + 1;
  if (month < 1) return undefined;
  const sec = Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]);
  const t = (calendarToJd(Number(m[2]), month, Number(m[4]), 0) - J2000_JD) * DAY + sec;
  return { side: m[1] === "prior to" ? "prior" : "after", t };
}

export interface Coverage {
  /** Horizons' own first and last epochs (null when it serves the whole probe span). */
  first: number | null;
  last: number | null;
  /** Rounded inwards to the grid and clamped to the app's span: what the pipeline generates. */
  start: number;
  end: number;
}

async function probe(client: Fetcher, id: number, day: string, center: number): Promise<CoverageEdge | null> {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + DAY * 1000).toISOString().slice(0, 10);
  const res = await client.get(
    vectorParams({ command: String(id), center: `500@${center}`, start: day, stop: next, step: "1 d" }),
  );
  let body: { error?: unknown; result?: unknown };
  try {
    body = JSON.parse(res.body) as typeof body;
  } catch {
    throw new HorizonsError("format", "response is not JSON", res.query);
  }
  const text = typeof body.error === "string" ? body.error : typeof body.result === "string" ? body.result : "";
  const edge = parseCoverageEdge(text);
  if (edge) return edge;
  parseVectors(res.body, res.query); // throws on any other error
  return null;
}

/** Finds the span Horizons serves for `id`, by probing one day before `fromYear` and one after `toYear`. */
export async function discoverCoverage(
  client: Fetcher,
  id: number,
  fromYear: number,
  toYear: number,
  center = 10,
): Promise<Coverage> {
  const lo = yearStart(fromYear);
  const hi = yearStart(toYear);
  const before = await probe(client, id, `${fromYear - 50}-01-01`, center);
  const after = await probe(client, id, `${toYear + 99}-01-01`, center);
  if (before && before.side !== "prior") throw new RangeError(`object ${id}: early probe reports "${before.side}"`);
  if (after && after.side !== "after") throw new RangeError(`object ${id}: late probe reports "${after.side}"`);
  const g = GRID_MIN * MIN;
  const start = Math.max(lo, before ? Math.ceil(before.t / g) * g : lo);
  const end = Math.min(hi, after ? Math.floor(after.t / g) * g : hi);
  if (!(end > start)) throw new RangeError(`object ${id}: no coverage inside ${fromYear}..${toYear}`);
  return { first: before?.t ?? null, last: after?.t ?? null, start, end };
}

/** Decade-aligned chunk bounds over [start, end]. */
export function chunkBounds(start: number, end: number, chunkYears: number, fromYear: number): [number, number][] {
  const out: [number, number][] = [];
  let y = fromYear;
  while (yearStart(y + chunkYears) <= start) y += chunkYears;
  for (let a = start; a < end; y += chunkYears) {
    const b = Math.min(end, yearStart(y + chunkYears));
    out.push([a, b]);
    a = b;
  }
  return out;
}

export interface Window {
  t0: number;
  t1: number;
  /** Index into STEP_LADDER_MIN to start sampling at. */
  level: number;
}

/**
 * Splits a chunk into a base window at the coarsest step (a whole number of 2-day pairs from t0) and a fine tail of
 * 1 to 3 days (or the whole chunk when it is under 12 days) at the coarsest step that divides it into at least 16 even intervals.
 */
export function tile(t0: number, t1: number): Window[] {
  const base = STEP_LADDER_MIN[0] * MIN;
  let k = Math.floor((t1 - t0) / (2 * base));
  if (k > 0 && t1 - (t0 + 2 * k * base) > 0 && t1 - (t0 + 2 * k * base) < base) k--;
  if (k < MIN_BASE_PAIRS) k = 0; // too short for a degree-13 fit at 1 day: all fine tail
  const mid = t0 + 2 * k * base;
  const out: Window[] = [];
  if (k > 0) out.push({ t0, t1: mid, level: 0 });
  if (t1 > mid) {
    const rest = t1 - mid;
    let level = STEP_LADDER_MIN.length - 1;
    for (let l = 1; l < STEP_LADDER_MIN.length; l++) {
      const s = STEP_LADDER_MIN[l]! * MIN;
      if (rest % (2 * s) === 0 && rest / s >= 16) {
        level = l;
        break;
      }
    }
    if (rest % (2 * STEP_LADDER_MIN[level]! * MIN) !== 0) {
      throw new RangeError(`tail ${rest} s is not an even number of ${STEP_LADDER_MIN[level]} min steps`);
    }
    out.push({ t0: mid, t1, level });
  }
  return out;
}

export interface Fetched {
  samples: Sample[];
  seams: Seam[];
  retrieved: string[];
  sources: Set<string>;
  requests: number;
}

/** Samples [t0, t1] at `stepMin`, in requests of at most MAX_INTERVALS intervals stitched at shared epochs. */
export async function fetchSamples(
  client: Fetcher,
  sc: SpacecraftSpec,
  t0: number,
  t1: number,
  stepMin: number,
  maxIntervals: number,
  acc: Fetched,
): Promise<Sample[]> {
  const step = stepMin * MIN;
  const n = Math.round((t1 - t0) / step);
  if (n * step !== t1 - t0 || n % 2 !== 0) throw new RangeError(`window ${t0}..${t1} is not an even number of steps`);
  const out: Sample[] = [];
  for (let i = 0; i < n; i += maxIntervals) {
    const a = t0 + i * step;
    const b = t0 + Math.min(n, i + maxIntervals) * step;
    const res = await client.get(
      vectorParams({
        command: String(sc.id),
        center: `500@${sc.center ?? 10}`,
        start: tdbText(a),
        stop: tdbText(b),
        step: `${stepMin} m`,
      }),
    );
    acc.requests++;
    const v = parseVectors(res.body, res.query);
    const tid = /\((-?\d+)\)\s*$/.exec(v.header.target)?.[1];
    const cid = /\((-?\d+)\)\s*$/.exec(v.header.center)?.[1];
    if (Number(tid) !== sc.id || Number(cid) !== (sc.center ?? 10) || v.header.frame !== "Ecliptic of J2000.0") {
      throw new HorizonsError("format", `header target "${v.header.target}", centre "${v.header.center}"`, res.query);
    }
    const want = Math.round((b - a) / step) + 1;
    const recs = v.records;
    if (recs.length !== want || Math.abs(recs[0]!.t - a) > 1e-3 || Math.abs(recs.at(-1)!.t - b) > 1e-3) {
      throw new HorizonsError("format", `expected ${want} records from ${a} to ${b}, got ${recs.length}`, res.query);
    }
    acc.retrieved.push(res.retrieved);
    acc.sources.add(v.header.source);
    // Exact grid times (the JD text carries 1e-4 s rounding); the seam epoch is shared, keep the earlier copy.
    recs.forEach((r, j) => {
      if (out.length > 0 && j === 0) {
        const p = out.at(-1)!;
        if (Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) > 1e-3) {
          throw new HorizonsError("format", `seam at ${a} disagrees between requests`, res.query);
        }
        return;
      }
      out.push({ t: a + j * step, x: r.x, y: r.y, z: r.z, vx: r.vx, vy: r.vy, vz: r.vz });
    });
  }
  return out;
}

/**
 * A position jump between consecutive samples at the step limit: the step disagrees with the trapezoid of the two
 * velocities by more than JUMP_KM (smooth motion, even a 25 km Europa flyby, stays under 1 km at 1 min). Horizons' merged trajectories can carry such seams between their source files (psyche_merged has a
 * 1.97 million km one on 2027-03-01); no polynomial can fit across one, so a segment boundary goes there.
 */
export const JUMP_KM = 25;
/** More jumps than this in one window is not a seam but data no polynomial at the step limit follows: a miss. */
export const MAX_SEAMS_PER_WINDOW = 4;
/** Jumps are looked for at this step and finer (smooth motion stays under 1 km of the trapezoid at 5 min). */
export const JUMP_CHECK_MAX_STEP_MIN = 5;

export function findJumps(s: readonly Sample[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    const h = (b.t - a.t) / 2;
    const e = Math.hypot(b.x - a.x - h * (a.vx + b.vx), b.y - a.y - h * (a.vy + b.vy), b.z - a.z - h * (a.vz + b.vz));
    if (e > JUMP_KM) out.push(i);
  }
  return out;
}

/** Jump-probe resolution: the gap between the two samples around a jump is sampled at this many intervals. */
export const GAP_INTERVALS = 60;

/** Adjacent or overlapping misses merged into runs. */
export function missRuns(misses: readonly Miss[]): Miss[] {
  const out: Miss[] = [];
  for (const m of [...misses].sort((a, b) => a.t0 - b.t0)) {
    const last = out.at(-1);
    if (last && m.t0 <= last.t1) {
      last.t1 = Math.max(last.t1, m.t1);
      last.errorKm = Math.max(last.errorKm, m.errorKm);
    } else out.push({ ...m });
  }
  return out;
}

export interface Refined {
  t0: number;
  t1: number;
  step_minutes: number;
}

interface WindowFit {
  segments: SegmentInput[];
  misses: Miss[];
  refined: Refined[];
  degree: number;
}

export interface SpacecraftOptions {
  client: Fetcher;
  spacecraft: readonly SpacecraftSpec[];
  fromYear: number;
  toYear: number;
  chunkYears: number;
  /** Fit target as a fraction of the tolerance (the pipeline's FIT_TARGET_FRACTION). */
  targetFraction: number;
  maxIntervals?: number;
  log?: (line: string) => void;
}

async function fitWindow(
  o: SpacecraftOptions,
  sc: SpacecraftSpec,
  w: Window,
  degrees: readonly number[],
  acc: Fetched,
): Promise<WindowFit> {
  const stepMin = STEP_LADDER_MIN[w.level]!;
  const samples = await fetchSamples(o.client, sc, w.t0, w.t1, stepMin, o.maxIntervals ?? MAX_INTERVALS, acc);
  acc.samples.push(...samples);
  // Above the step limit a segment over the target (not only over the tolerance) is refined: the error between
  // samples can exceed the error at the held-out midpoints. At the limit, what is over the tolerance is a miss.
  const target = TOLERANCE_KM.cruise * o.targetFraction;
  const last = w.level === STEP_LADDER_MIN.length - 1;
  if (last) {
    const jumps = findJumps(samples);
    if (jumps.length > 0 && jumps.length <= MAX_SEAMS_PER_WINDOW)
      return fitAcrossJumps(o, sc, samples, jumps, degrees[0]!, acc, stepMin);
  }
  const fit: FitResult = fitAdaptive(samples, {
    toleranceKm: last ? TOLERANCE_KM.cruise : target,
    targetKm: target,
    joinShortTail: true,
    degrees,
    initialIntervals: Math.min(64, samples.length - 1 - ((samples.length - 1) % 2)),
  });
  const refined: Refined[] = w.level > 0 ? [{ t0: w.t0, t1: w.t1, step_minutes: stepMin }] : [];
  // The held-out midpoints miss the error at segment ends, which is often the largest: check every sample too.
  const over = segmentsOver(fit.segments, fit.degree, samples, last ? TOLERANCE_KM.cruise : target);
  // A seam smaller than the fit can see from either side: at 5 min a jump between two samples sends the segment
  // around it down to 1 min, where seams are cut (Parker has a 50 km one on 2025-10-08).
  const seamy: Miss[] = [];
  if (!last && stepMin <= JUMP_CHECK_MAX_STEP_MIN) {
    for (const j of findJumps(samples)) {
      const t = samples[j]!.t;
      const seg = fit.segments.find((x) => x.t0 < t && x.t1 >= t);
      if (seg) seamy.push({ t0: seg.t0, t1: seg.t1, errorKm: TOLERANCE_KM.cruise });
    }
  }
  const misses = missRuns([...fit.misses, ...over, ...seamy]);
  if (misses.length === 0 || last) {
    return { segments: fit.segments, misses, refined, degree: fit.degree };
  }
  // Refit each run of missing segments at the next step, at this window's degree.
  const runs = misses;
  const keep = fit.segments.filter((s) => !runs.some((r) => s.t0 >= r.t0 && s.t1 <= r.t1));
  const out: WindowFit = { segments: keep, misses: [], refined, degree: fit.degree };
  for (const r of runs) {
    const sub = await fitWindow(o, sc, { t0: r.t0, t1: r.t1, level: w.level + 1 }, [fit.degree], acc);
    out.segments.push(...sub.segments);
    out.misses.push(...sub.misses);
    out.refined.push(...sub.refined);
  }
  out.segments.sort((a, b) => a.t0 - b.t0);
  return out;
}

/**
 * Least-squares segments over [t0, t1] from the given points (no held-out points: both sides of a seam are short),
 * at most 64 sample intervals of `step` each, halved while a segment is over `targetKm` at its points and both halves
 * still have enough points for the degree.
 */
function fitPoints(
  points: readonly Sample[],
  t0: number,
  t1: number,
  degree: number,
  step: number,
  targetKm: number,
): SegmentInput[] {
  const enough = (n: number): boolean => 2 * n >= degree + 1;
  const one = (a: number, b: number, pts: readonly Sample[]): SegmentInput => ({
    t0: a,
    t1: b,
    coeffs: fitSegment(
      a,
      b,
      pts.map((p) => p.t),
      pts.map((p) => [p.x, p.y, p.z]),
      pts.map((p) => [p.vx, p.vy, p.vz]),
      degree,
    ),
  });
  const work = (a: number, b: number, out: SegmentInput[]): void => {
    const pts = points.filter((p) => p.t >= a && p.t <= b);
    if (!enough(pts.length)) throw new RangeError(`too few points (${pts.length}) for a segment ${a}..${b}`);
    const seg = one(a, b, pts);
    const m = (a + b) / 2;
    const left = pts.filter((p) => p.t <= m).length;
    const right = pts.filter((p) => p.t >= m).length;
    if (maxError([seg], degree, pts).km > targetKm && enough(left) && enough(right)) {
      work(a, m, out);
      work(m, b, out);
    } else out.push(seg);
  };
  const n = Math.max(1, Math.round((t1 - t0) / (64 * step)));
  const out: SegmentInput[] = [];
  for (let k = 0; k < n; k++) {
    work(k === 0 ? t0 : t0 + ((t1 - t0) * k) / n, k === n - 1 ? t1 : t0 + ((t1 - t0) * (k + 1)) / n, out);
  }
  return out;
}

/**
 * At the step limit, a window with position jumps: each gap around a jump is sampled at GAP_INTERVALS to place the
 * seam to a few seconds, then each side is fitted on its own points, the boundary at the last sample before the
 * seam. A side that still misses the tolerance is listed; the seams are listed too.
 */
async function fitAcrossJumps(
  o: SpacecraftOptions,
  sc: SpacecraftSpec,
  samples: Sample[],
  jumps: number[],
  degree: number,
  acc: Fetched,
  stepMin: number,
): Promise<WindowFit> {
  const pieces: Sample[][] = [];
  const bounds: number[] = [samples[0]!.t];
  const seams: Seam[] = [];
  let from = 0;
  let carry: Sample[] = [];
  for (const j of jumps) {
    const a = samples[j - 1]!.t;
    const b = samples[j]!.t;
    const gap = await fetchGap(o.client, sc, a, b, acc);
    acc.samples.push(...gap);
    const k = findJumps(gap)[0] ?? gap.length - 1;
    const before = gap.slice(1, k);
    const after = gap.slice(k, gap.length - 1);
    pieces.push([...carry, ...samples.slice(from, j), ...before]);
    const boundary = gap[k - 1]!.t;
    bounds.push(boundary);
    const p = gap[k - 1]!;
    const q = gap[k]!;
    seams.push({ t: boundary, t_after: q.t, jump_km: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) });
    carry = after;
    from = j;
  }
  pieces.push([...carry, ...samples.slice(from)]);
  bounds.push(samples.at(-1)!.t);
  const segments: SegmentInput[] = [];
  const misses: Miss[] = [];
  pieces.forEach((pts, i) => {
    // A seam on the window's first sample leaves an empty piece: the window before already ends there.
    if (!(bounds[i + 1]! > bounds[i]!)) return;
    const segs = fitPoints(
      pts,
      bounds[i]!,
      bounds[i + 1]!,
      degree,
      stepMin * MIN,
      TOLERANCE_KM.cruise * o.targetFraction,
    );
    const e = maxError(segs, degree, pts);
    if (e.km > TOLERANCE_KM.cruise) misses.push({ t0: bounds[i]!, t1: bounds[i + 1]!, errorKm: e.km });
    segments.push(...segs);
  });
  acc.seams.push(...seams);
  o.log?.(
    `${sc.name}: ${seams.length} trajectory seam(s) at ${seams.map((x) => tdbText(Math.round(x.t / 60) * 60)).join(", ")}`,
  );
  return {
    segments,
    misses,
    refined: [{ t0: samples[0]!.t, t1: samples.at(-1)!.t, step_minutes: stepMin }],
    degree,
  };
}

/** Samples (a, b) at GAP_INTERVALS equal intervals (Horizons STEP_SIZE as a count). */
export async function fetchGap(
  client: Fetcher,
  sc: SpacecraftSpec,
  a: number,
  b: number,
  acc: Fetched,
): Promise<Sample[]> {
  const res = await client.get(
    vectorParams({
      command: String(sc.id),
      center: `500@${sc.center ?? 10}`,
      start: tdbText(a),
      stop: tdbText(b),
      step: String(GAP_INTERVALS),
    }),
  );
  acc.requests++;
  const v = parseVectors(res.body, res.query);
  if (v.records.length !== GAP_INTERVALS + 1) {
    throw new HorizonsError("format", `expected ${GAP_INTERVALS + 1} gap records, got ${v.records.length}`, res.query);
  }
  acc.retrieved.push(res.retrieved);
  acc.sources.add(v.header.source);
  const h = (b - a) / GAP_INTERVALS;
  return v.records.map((r, i) => ({ t: a + i * h, x: r.x, y: r.y, z: r.z, vx: r.vx, vy: r.vy, vz: r.vz }));
}

export interface Seam {
  /** Last sampled epoch before the jump (the segment boundary) and the first after it. */
  t: number;
  t_after: number;
  jump_km: number;
}

/**
 * Segments whose error exceeds `limitKm` at any sample inside them, or at the Hermite midpoint between two
 * consecutive samples, as misses.
 */
export function segmentsOver(
  segments: readonly SegmentInput[],
  degree: number,
  samples: readonly Sample[],
  limitKm: number,
): Miss[] {
  const out: Miss[] = [];
  const v = new Float64Array(6);
  let j = 0;
  for (const s of segments) {
    let e = 0;
    while (j < samples.length && samples[j]!.t < s.t0) j++;
    for (let i = j; i < samples.length && samples[i]!.t <= s.t1; i++) {
      const p = samples[i]!;
      evaluateSegment(s.coeffs as Float64Array, 0, degree + 1, s.t0, s.t1, p.t, v, 0);
      e = Math.max(e, Math.hypot(v[0]! - p.x, v[1]! - p.y, v[2]! - p.z));
      // Between samples: the cubic Hermite midpoint of this sample and the next (positions and velocities) stands in
      // for the trajectory there; a fit can pass at every sample and still swing between them (Parker at perihelion).
      const q = samples[i + 1];
      if (q && q.t <= s.t1) {
        const h = q.t - p.t;
        evaluateSegment(s.coeffs as Float64Array, 0, degree + 1, s.t0, s.t1, p.t + h / 2, v, 0);
        const hx = (p.x + q.x) / 2 + (h / 8) * (p.vx - q.vx);
        const hy = (p.y + q.y) / 2 + (h / 8) * (p.vy - q.vy);
        const hz = (p.z + q.z) / 2 + (h / 8) * (p.vz - q.vz);
        e = Math.max(e, Math.hypot(v[0]! - hx, v[1]! - hy, v[2]! - hz));
      }
    }
    if (e > limitKm) out.push({ t0: s.t0, t1: s.t1, errorKm: e });
  }
  return out;
}

/**
 * Largest distance between the assembled segments and every sample fetched for them (fitted and held out, at every
 * step), with its epoch: the honest measure once refits have replaced parts of a window.
 */
export function maxError(segments: readonly SegmentInput[], degree: number, samples: readonly Sample[]) {
  const out = new Float64Array(6);
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  let km = 0;
  let epoch = segments[0]?.t0 ?? 0;
  let j = 0;
  for (const p of sorted) {
    while (j < segments.length - 1 && p.t > segments[j]!.t1) j++;
    const s = segments[j]!;
    evaluateSegment(s.coeffs as Float64Array, 0, degree + 1, s.t0, s.t1, p.t, out, 0);
    const e = Math.hypot(out[0]! - p.x, out[1]! - p.y, out[2]! - p.z);
    if (e > km) {
      km = e;
      epoch = p.t;
    }
  }
  return { km, epoch };
}

/** Generates every spacecraft's chunk files and its manifest object. */
export async function generateSpacecraft(
  o: SpacecraftOptions,
): Promise<{ files: Map<string, Uint8Array>; objects: unknown[] }> {
  const files = new Map<string, Uint8Array>();
  const objects: unknown[] = [];
  const tol = TOLERANCE_KM.cruise;
  for (const sc of [...o.spacecraft].sort((a, b) => a.id - b.id)) {
    const cov = await discoverCoverage(o.client, sc.id, o.fromYear, o.toYear);
    const acc: Fetched = { samples: [], seams: [], retrieved: [], sources: new Set(), requests: 0 };
    const chunks: unknown[] = [];
    const misses: Miss[] = [];
    const refined: Refined[] = [];
    let worst = { km: 0, epoch: cov.start };
    for (const [a, b] of chunkBounds(cov.start, cov.end, o.chunkYears, o.fromYear)) {
      const before = acc.requests;
      const segments: SegmentInput[] = [];
      let degree: number | undefined;
      acc.samples.length = 0;
      for (const w of tile(a, b)) {
        // The base window picks the degree (format v1 has one per file); tails and refits use it.
        const f = await fitWindow(o, sc, w, degree === undefined ? DEGREES : [degree], acc);
        degree ??= f.degree;
        segments.push(...f.segments);
        misses.push(...f.misses);
        refined.push(...f.refined);
      }
      const chunkMax = maxError(segments, degree!, acc.samples);
      if (chunkMax.km > worst.km) worst = chunkMax;
      const bytes = writeEphemeris({ objectId: sc.id, centerId: 10, degree: degree!, segments });
      const year = new Date(Date.UTC(2000, 0, 1, 12) + a * 1000).getUTCFullYear();
      const file = `${sc.id}/${year}.bin`;
      files.set(file, bytes);
      chunks.push({
        file,
        coverage: { start: a, end: b, start_tdb: tdbText(a), end_tdb: tdbText(b) },
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        degree,
        segments: segments.length,
        max_error_km: round(chunkMax.km, 4),
        requests: acc.requests - before,
        target: sc.id,
      });
      o.log?.(
        `${sc.name} ${tdbText(a)}: degree ${degree}, ${segments.length} segments, max ${chunkMax.km.toFixed(3)} km at ` +
          `${tdbText(Math.round(chunkMax.epoch / 60) * 60)}, ${misses.length} misses so far, ${acc.requests - before} requests`,
      );
    }
    const template = Object.fromEntries(
      Object.entries(vectorParams({ command: String(sc.id), center: "500@10", start: "", stop: "", step: "" })).filter(
        ([k]) => k !== "START_TIME" && k !== "STOP_TIME" && k !== "STEP_SIZE",
      ),
    );
    objects.push({
      id: sc.id,
      name: sc.name,
      kind: "spacecraft",
      center: 10,
      query: { ...template, STEP_SIZE: STEP_LADDER_MIN.map((s) => `'${s} m'`).join(" | ") },
      retrieved: [...acc.retrieved].sort().at(-1),
      source: [...acc.sources].sort().join("; "),
      horizons_coverage: {
        first: cov.first === null ? null : round(cov.first, 4),
        last: cov.last === null ? null : round(cov.last, 4),
      },
      coverage: { start: cov.start, end: cov.end, start_tdb: tdbText(cov.start), end_tdb: tdbText(cov.end) },
      chunks,
      tolerance_km: tol,
      max_error_km: { km: round(worst.km, 4), epoch: worst.epoch, jd_tdb: (J2000_JD + worst.epoch / DAY).toFixed(6) },
      misses: misses.map((m) => ({ t0: m.t0, t1: m.t1, error_km: round(m.errorKm, 4) })),
      refined: refined.sort((x, y) => x.t0 - y.t0 || x.step_minutes - y.step_minutes),
      seams: acc.seams.map((x) => ({ t: round(x.t, 3), t_after: round(x.t_after, 3), jump_km: round(x.jump_km, 1) })),
      fallbacks: [],
    });
  }
  return { files, objects };
}
