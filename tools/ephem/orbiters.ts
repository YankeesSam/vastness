// VN-EPH-003, VN-EPH-009, VN-EPH-011: orbiters (Juno at Jupiter, LRO and CAPSTONE at the Moon), stored relative to
// their parent. The mission span comes from Horizons' refusals (as for heliocentric spacecraft). Each year is sampled
// at BASE_STEP_MIN and split where the orbiter is captured: before it the states are not bound to the parent (the
// transfer, or Juno's cruise) and only position segments fit; after it both position and element segments are
// fitted, segments still over the tolerance are fitted again from FINE_STEP_MIN samples, and the kind with fewer
// misses, then fewer bytes, is kept. Every sample fetched is checked against the written file: that whole-mission
// size and worst error decide (OI-6) between the whole mission, when it fits the budget, and the segments within
// WINDOW_DAYS of the build date. Deterministic on a warm cache (VN-GEN-010).

import { createHash } from "node:crypto";
import { BODIES, type BodyId } from "../../src/core/constants.ts";
import { evaluateFile } from "../../src/core/ephem/ephemeris.ts";
import { fitSegment } from "../../src/core/ephem/chebyshev.ts";
import { elementSeries, fitElementSegment } from "../../src/core/ephem/elements.ts";
import {
  KIND_ELEMENTS,
  KIND_POSITION,
  findSegment,
  readEphemeris,
  writeEphemeris,
  type EphemerisFile,
  type SegmentInput,
} from "../../src/core/ephem/format.ts";
import { J2000_JD, SECONDS_PER_DAY, calendarToJd } from "../../src/core/time/scales.ts";
import { TOLERANCE_KM, fitAdaptive, type FitOptions, type FitResult, type Miss, type Sample } from "./fit.ts";
import { vectorParams } from "./horizons.ts";
import type { Fetcher } from "./main.ts";
import {
  JUMP_KM,
  chunkBounds,
  discoverCoverage,
  fetchGap,
  fetchSamples,
  missRuns,
  tdbText,
  type Fetched,
  type Seam,
} from "./spacecraft.ts";

export interface OrbiterSpec {
  id: number;
  name: string;
  /** The parent body (599 Jupiter, 301 the Moon). */
  center: number;
  tolerance: keyof typeof TOLERANCE_KM;
}

export interface OrbitersFile {
  /** The build date (UTC calendar date) the window is centred on; fixed in data so output stays deterministic. */
  build_date: string;
  window_days: number;
  budget_bytes: number;
  orbiters: OrbiterSpec[];
}

export const BASE_STEP_MIN = 5;
export const FINE_STEP_MIN = 1;
/** Sample intervals per segment before halving: 14 days at 5 min, halved down to what the orbit needs. */
export const INITIAL_INTERVALS = 4096;

/** Most separate fine refits one kind may ask for in one round of one part. */
export const MAX_RUNS = 48;
/** After capture, element misses within this span are taken as the end of the insertion burn. */
export const SETTLE_S = 2 * 86400;
/** A fine refit covers at least this span, so both sides of a seam inside it have enough points. */
export const MIN_RUN_S = 2 * 3600;

const MIN = 60;
const DAY = SECONDS_PER_DAY;
const round = (x: number, digits: number): number => Number(x.toFixed(digits));

export interface OrbiterOptions {
  client: Fetcher;
  orbiters: OrbitersFile;
  fromYear: number;
  toYear: number;
  /** Fit target as a fraction of the tolerance (the pipeline's FIT_TARGET_FRACTION). */
  targetFraction: number;
  baseStepMin?: number;
  fineStepMin?: number;
  initialIntervals?: number;
  maxIntervals?: number;
  log?: (line: string) => void;
}

/** Index of the first sample from which every later sample is bound to the centre (negative energy); -1 if none. */
export function captureIndex(samples: readonly Sample[], mu: number): number {
  for (let i = samples.length - 1; i >= 0; i--) {
    const p = samples[i]!;
    const energy = (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) / 2 - mu / Math.hypot(p.x, p.y, p.z);
    if (!(energy < 0)) return i === samples.length - 1 ? -1 : i + 1;
  }
  return 0;
}

/** Reference mean motion for an element file: the mean rate of the unwrapped mean anomaly over the samples. */
export function referenceMeanMotion(samples: readonly Sample[], mu: number): number {
  const cols = elementSeries(
    samples.map((p) => p.t),
    samples.map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz]),
    mu,
    0,
  );
  const m = cols[5]!;
  return (m[m.length - 1]! - m[0]!) / (samples.at(-1)!.t - samples[0]!.t);
}

interface Piece {
  kind: typeof KIND_POSITION | typeof KIND_ELEMENTS;
  degree: number;
  segments: SegmentInput[];
  meanMotion: number;
  misses: Miss[];
  refined: { t0: number; t1: number; step_minutes: number }[];
  /** Segments already refitted from fine samples: what is over there is a miss. */
  fine: Set<SegmentInput>;
  /** Position jumps between Horizons' trajectory arcs, where a segment boundary was put. */
  seams: Seam[];
  opts: (n: number, degrees?: readonly number[]) => FitOptions;
}

const fileOf = (o: OrbiterSpec, p: Piece, mu: number, segments = p.segments): Uint8Array =>
  writeEphemeris({
    objectId: o.id,
    centerId: o.center,
    degree: p.degree,
    segments,
    ...(p.kind === KIND_ELEMENTS ? { kind: KIND_ELEMENTS, mu, meanMotion: p.meanMotion } : {}),
  });

const parse = (b: Uint8Array): EphemerisFile => readEphemeris(b.buffer, b.byteOffset, b.byteLength);

/**
 * Error of the file at every sample, per segment, and the overall worst with its epoch. With `hermite`, also at the
 * cubic Hermite midpoint of consecutive samples in the same segment (positions and velocities of both): a fit can pass
 * at every sample and still swing between them. Only with `hermiteJumpKm` > 0 (samples sorted), and not across a
 * pair that is itself a seam (jumping more than that).
 */
export function fileErrors(f: EphemerisFile, samples: readonly Sample[], hermiteJumpKm = 0) {
  const out = new Float64Array(6);
  const perSegment = new Float64Array(f.segmentCount);
  let km = 0;
  let epoch = f.start;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const s = findSegment(f, p.t);
    if (s < 0) continue;
    evaluateFile(f, p.t, out);
    const e = Math.hypot(out[0]! - p.x, out[1]! - p.y, out[2]! - p.z);
    const err = Number.isFinite(e) ? e : Infinity;
    if (err > perSegment[s]!) perSegment[s] = err;
    if (err > km) {
      km = err;
      epoch = p.t;
    }
    const q = hermiteJumpKm > 0 ? samples[i + 1] : undefined;
    if (q && q.t <= f.t1[s]! && jumpIndices([p, q], hermiteJumpKm).length === 0) {
      const h = q.t - p.t;
      evaluateFile(f, p.t + h / 2, out);
      const hx = (p.x + q.x) / 2 + (h / 8) * (p.vx - q.vx);
      const hy = (p.y + q.y) / 2 + (h / 8) * (p.vy - q.vy);
      const hz = (p.z + q.z) / 2 + (h / 8) * (p.vz - q.vz);
      const m = Math.hypot(out[0]! - hx, out[1]! - hy, out[2]! - hz);
      const me = Number.isFinite(m) ? m : Infinity;
      if (me > perSegment[s]!) perSegment[s] = me;
    }
  }
  return { km, epoch, perSegment };
}

const perSegmentMax = (e: { perSegment: Float64Array }): number => Math.max(0, ...e.perSegment);

/**
 * Indices j where the step from sample j - 1 to j disagrees with the trapezoid of their velocities by more than
 * `km`: a seam between trajectory arcs (smooth lunar or Jovian motion stays well under 1 km at 1 min).
 */
export function jumpIndices(s: readonly Sample[], km: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    const h = (b.t - a.t) / 2;
    const e = Math.hypot(b.x - a.x - h * (a.vx + b.vx), b.y - a.y - h * (a.vy + b.vy), b.z - a.z - h * (a.vz + b.vz));
    if (e > km) out.push(i);
  }
  return out;
}

/** One least-squares segment of the piece's kind and degree over [t0, t1] from all of `pts` (no held-out points). */
function fitOne(piece: Piece, pts: readonly Sample[], t0: number, t1: number, mu: number): SegmentInput {
  const times = pts.map((p) => p.t);
  if (piece.kind === KIND_ELEMENTS) {
    const series = elementSeries(
      times,
      pts.map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz]),
      mu,
      piece.meanMotion,
    );
    if (pts.length < piece.degree + 1) throw new RangeError(`too few points (${pts.length}) for a segment`);
    return { t0, t1, coeffs: fitElementSegment(t0, t1, times, series, piece.degree) };
  }
  if (2 * pts.length < piece.degree + 1) throw new RangeError(`too few points (${pts.length}) for a segment`);
  return {
    t0,
    t1,
    coeffs: fitSegment(
      t0,
      t1,
      times,
      pts.map((p) => [p.x, p.y, p.z]),
      pts.map((p) => [p.vx, p.vy, p.vz]),
      piece.degree,
    ),
  };
}

/**
 * Fine samples with seams before the given indices: each side is fitted on its own points, the boundary at the first
 * sample after the seam, and halved while over `targetKm` at its points and both halves keep enough points.
 */
function fitAcrossSeams(
  piece: Piece,
  pts: readonly Sample[],
  jumps: readonly number[],
  mu: number,
  targetKm: number,
): SegmentInput[] {
  // Points a segment needs: elements have no velocity rows, so twice the coefficients for a well-posed fit (with only
  // degree + 1 the polynomial interpolates and swings between them: 1,600 km in LRO's 2026 seams).
  const need = piece.kind === KIND_ELEMENTS ? 2 * (piece.degree + 1) : piece.degree + 1;
  const out: SegmentInput[] = [];
  const work = (side: readonly Sample[], a: number, b: number): void => {
    const seg = fitOne(piece, side, a, b, mu);
    const m = (a + b) / 2;
    const left = side.filter((p) => p.t <= m);
    const right = side.filter((p) => p.t >= m);
    const f = parse(
      writeEphemeris({
        objectId: 0,
        centerId: 0,
        degree: piece.degree,
        segments: [seg],
        ...(piece.kind === KIND_ELEMENTS ? { kind: KIND_ELEMENTS, mu, meanMotion: piece.meanMotion } : {}),
      }),
    );
    if (perSegmentMax(fileErrors(f, side, Infinity)) > targetKm && left.length >= need && right.length >= need) {
      work(left, a, m);
      work(right, m, b);
    } else out.push(seg);
  };
  // Sides between seams; one too short for the degree (a lone sample between two arcs) is dropped and the next side
  // starts where the last kept one ended.
  const cuts = [0, ...jumps, pts.length];
  const sides: Sample[][] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const side = pts.slice(cuts[k]!, cuts[k + 1]!);
    if (side.length >= need) sides.push(side);
  }
  if (sides.length === 0) throw new RangeError("no side of the seams has enough points");
  // The boundary is the first sample after the seam: a lookup at it finds the later segment, whose data it is.
  let a = pts[0]!.t;
  sides.forEach((side, k) => {
    const b = k === sides.length - 1 ? pts.at(-1)!.t : sides[k + 1]![0]!.t;
    work(side, a, b);
    a = b;
  });
  return out;
}

async function fitKind(
  oo: OrbiterOptions,
  o: OrbiterSpec,
  kind: Piece["kind"],
  samples: Sample[],
  acc: Fetched,
): Promise<Piece | undefined> {
  const mu = BODIES[o.center as BodyId].gmKm3S2;
  const tol = TOLERANCE_KM[o.tolerance];
  const target = tol * oo.targetFraction;
  const base = oo.initialIntervals ?? INITIAL_INTERVALS;
  const meanMotion = kind === KIND_ELEMENTS ? referenceMeanMotion(samples, mu) : 0;
  const elements = kind === KIND_ELEMENTS ? { mu, meanMotion } : undefined;
  const opts = (n: number, degrees?: readonly number[]) => ({
    toleranceKm: tol,
    targetKm: target,
    joinShortTail: true,
    initialIntervals: Math.max(4, Math.min(base, n - (n % 2))),
    ...(degrees ? { degrees } : {}),
    ...(elements ? { elements } : {}),
  });
  let fit: FitResult;
  try {
    fit = fitAdaptive(samples, opts(samples.length - 1));
  } catch (e) {
    if (e instanceof RangeError) return undefined; // too short for any degree
    throw e;
  }
  const piece: Piece = {
    kind,
    degree: fit.degree,
    segments: fit.segments,
    meanMotion,
    misses: [],
    refined: [],
    fine: new Set(),
    seams: [],
    opts,
  };
  return (await refine(oo, o, piece, acc)) ? piece : undefined;
}

/**
 * Refits, from FINE_STEP_MIN samples, every segment over the tolerance at any sample fetched so far or between two
 * of them (Hermite midpoints), until none is left that has not been refitted; what is still over is a miss. False
 * when this kind cannot follow a run at all.
 */
async function refine(oo: OrbiterOptions, o: OrbiterSpec, piece: Piece, acc: Fetched): Promise<boolean> {
  const mu = BODIES[o.center as BodyId].gmKm3S2;
  const tol = TOLERANCE_KM[o.tolerance];
  const fine = oo.fineStepMin ?? FINE_STEP_MIN;
  const errors = () => {
    const check = [...acc.samples].sort((x, y) => x.t - y.t);
    const e = fileErrors(parse(fileOf(o, piece, mu)), check, Math.min(JUMP_KM, tol / 2));
    return piece.segments.map((s, i) => ({ seg: s, t0: s.t0, t1: s.t1, errorKm: e.perSegment[i]! }));
  };
  for (let round = 0; round < 4; round++) {
    const over = errors().filter((m) => m.errorKm > tol && !piece.fine.has(m.seg));
    if (over.length === 0) break;
    // A kind that needs the fine step all over the part (positions through every perilune of an eccentric orbit)
    // is not the smaller one: it stops here, its misses listed, rather than fetching thousands of fine windows.
    if (missRuns(over).length > MAX_RUNS) break;
    // Segment bounds fall on even base samples, so each run is a whole even number of fine steps.
    // Grown to whole neighbouring segments until at least MIN_RUN_S long, so each side of a seam has the points
    // its degree needs.
    const segs = piece.segments;
    const runs = missRuns(
      missRuns(over).map((r) => {
        let i = segs.findIndex((x) => x.t0 === r.t0);
        let j = segs.findIndex((x) => x.t1 === r.t1);
        while (segs[j]!.t1 - segs[i]!.t0 < MIN_RUN_S && (i > 0 || j < segs.length - 1)) {
          if (i > 0) i--;
          if (j < segs.length - 1) j++;
        }
        return { t0: segs[i]!.t0, t1: segs[j]!.t1, errorKm: r.errorKm };
      }),
    );
    const out = segs.filter((s) => !runs.some((r) => s.t0 >= r.t0 && s.t1 <= r.t1));
    for (const r of runs) {
      const pts = await fetchSamples(oo.client, o, r.t0, r.t1, fine, oo.maxIntervals ?? 20_000, acc);
      acc.samples.push(...pts);
      piece.refined.push({ t0: r.t0, t1: r.t1, step_minutes: fine });
      let sub: SegmentInput[];
      try {
        const thr = Math.min(JUMP_KM, tol / 2);
        let jumps = jumpIndices(pts, thr);
        if (jumps.length === 0) sub = fitAdaptive(pts, piece.opts(pts.length - 1, [piece.degree])).segments;
        else {
          // Each seam placed to a second: the minute around it sampled at GAP_INTERVALS, so the boundary falls
          // where Horizons switches arcs and not up to a minute away (CAPSTONE's 65 km seam on 2024-04-25).
          const dense: Sample[] = [];
          let from = 0;
          for (const j of jumps) {
            dense.push(...pts.slice(from, j));
            const gap = await fetchGap(oo.client, o, pts[j - 1]!.t, pts[j]!.t, acc);
            acc.samples.push(...gap);
            dense.push(...gap.slice(1, -1));
            from = j;
          }
          dense.push(...pts.slice(from));
          jumps = jumpIndices(dense, thr);
          sub = fitAcrossSeams(piece, dense, jumps, mu, tol * oo.targetFraction);
          for (const j of jumps) {
            const a = dense[j - 1]!;
            const b = dense[j]!;
            if (!piece.seams.some((x) => x.t === a.t)) {
              // The jump beyond smooth motion: the step against the trapezoid of the two velocities.
              const h = (b.t - a.t) / 2;
              const jump = Math.hypot(
                b.x - a.x - h * (a.vx + b.vx),
                b.y - a.y - h * (a.vy + b.vy),
                b.z - a.z - h * (a.vz + b.vz),
              );
              piece.seams.push({ t: a.t, t_after: b.t, jump_km: jump });
            }
          }
        }
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        return false; // e.g. elements through an unbound state
      }
      for (const x of sub) piece.fine.add(x);
      out.push(...sub);
    }
    piece.segments = out.sort((a, b) => a.t0 - b.t0);
  }
  piece.misses = missRuns(errors().filter((m) => m.errorKm > tol));
  piece.refined = missRuns(piece.refined.map((r) => ({ t0: r.t0, t1: r.t1, errorKm: 0 }))).map((r) => ({
    t0: r.t0,
    t1: r.t1,
    step_minutes: fine,
  }));
  return true;
}

/** TDB seconds since J2000 at 0h UTC of an ISO date, near enough (TDB - UTC is about a minute) to centre a window. */
const dateSeconds = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return (calendarToJd(y, m, d, 0) - J2000_JD) * DAY;
};

export interface OrbiterChunk {
  file: string;
  bytes: Uint8Array;
  kind: Piece["kind"];
  degree: number;
  segments: SegmentInput[];
  meanMotion: number;
}

/** Generates every orbiter's chunk files and manifest object. */
export async function generateOrbiters(
  oo: OrbiterOptions,
): Promise<{ files: Map<string, Uint8Array>; objects: unknown[] }> {
  const files = new Map<string, Uint8Array>();
  const objects: unknown[] = [];
  const stepMin = oo.baseStepMin ?? BASE_STEP_MIN;
  const cfg = oo.orbiters;
  for (const o of [...cfg.orbiters].sort((a, b) => a.id - b.id)) {
    const mu = BODIES[o.center as BodyId].gmKm3S2;
    const tol = TOLERANCE_KM[o.tolerance];
    const cov = await discoverCoverage(oo.client, o.id, oo.fromYear, oo.toYear, o.center);
    const acc: Fetched = { samples: [], seams: [], retrieved: [], sources: new Set(), requests: 0 };
    const pieces: (Piece & { t0: number; t1: number; candidates: unknown[] })[] = [];
    let allSamples: Sample[] = [];
    for (const [a, b] of chunkBounds(cov.start, cov.end, 1, oo.fromYear)) {
      acc.samples.length = 0;
      const samples = await fetchSamples(oo.client, o, a, b, stepMin, oo.maxIntervals ?? 20_000, acc);
      acc.samples.push(...samples);
      const k = captureIndex(samples, mu);
      // Split at the first even sample from which the orbiter stays bound; the parts need a few samples each.
      let split = k <= 0 ? k : k + (k % 2);
      if (split >= samples.length - 16) split = -1;
      if (split >= 0 && split <= 16) split = 0;
      const fitPart = async (part: Sample[], bound: boolean) => {
        const candidates: Piece[] = [];
        const pos = await fitKind(oo, o, KIND_POSITION, part, acc);
        if (pos) candidates.push(pos);
        if (bound) {
          const el = await fitKind(oo, o, KIND_ELEMENTS, part, acc).catch((e: unknown) => {
            if (e instanceof RangeError && /elliptic/.test(e.message)) return undefined;
            throw e;
          });
          if (el) candidates.push(el);
        }
        // Each kind against the fine samples the other fetched too.
        for (const c of candidates) await refine(oo, o, c, acc);
        const sized = candidates.map((c) => {
          const bytes = fileOf(o, c, mu);
          return { c, bytes: bytes.byteLength, err: fileErrors(parse(bytes), acc.samples) };
        });
        if (sized.length === 0) {
          throw new RangeError(`${o.name}: no fit for ${tdbText(part[0]!.t)}..${tdbText(part.at(-1)!.t)}`);
        }
        // The smaller of those within tolerance everywhere; when neither is, the one with the smaller worst error.
        const missing = (z: (typeof sized)[number]): number => (z.c.misses.length > 0 ? 1 : 0);
        sized.sort((x, y) => missing(x) - missing(y) || (missing(x) ? x.err.km - y.err.km : 0) || x.bytes - y.bytes);
        return { part, sized };
      };
      let fitted =
        split < 0
          ? [await fitPart(samples, false)]
          : split === 0
            ? [await fitPart(samples, true)]
            : [await fitPart(samples.slice(0, split + 1), false), await fitPart(samples.slice(split), true)];
      // Elements cannot follow the end of an insertion burn: when they lose to misses within SETTLE_S of capture,
      // the transfer is taken to end after the last of those and both parts are fitted again.
      for (let tries = 0; tries < 3 && fitted.length === 2; tries++) {
        const bound = fitted[1]!.sized;
        const el = bound.find((z) => z.c.kind === KIND_ELEMENTS);
        if (!el || bound[0]!.c.kind === KIND_ELEMENTS) break;
        const early = el.c.misses.filter((x) => x.t0 < samples[split]!.t + SETTLE_S);
        if (early.length === 0) break;
        const m = Math.max(...early.map((x) => x.t1));
        let idx = samples.findIndex((p) => p.t >= m);
        idx += idx % 2;
        if (idx <= split || idx >= samples.length - 16) break;
        split = idx;
        fitted = [await fitPart(samples.slice(0, split + 1), false), await fitPart(samples.slice(split), true)];
      }
      for (const { part: s, sized } of fitted) {
        const best = sized[0]!.c;
        pieces.push({
          ...best,
          t0: s[0]!.t,
          t1: s.at(-1)!.t,
          candidates: sized.map((z) => ({
            kind: z.c.kind === KIND_ELEMENTS ? "elements" : "position",
            bytes: z.bytes,
            degree: z.c.degree,
            segments: z.c.segments.length,
            max_error_km: round(z.err.km, 4),
            misses: z.c.misses.length,
          })),
        });
        oo.log?.(
          `${o.name} ${tdbText(s[0]!.t)}: ` +
            sized
              .map(
                (z) =>
                  `${z.c.kind === KIND_ELEMENTS ? "elements" : "position"} ${z.bytes} B, max ${z.err.km.toFixed(3)} km, ` +
                  `${z.c.misses.length} misses`,
              )
              .join("; ") +
            ` -> ${best.kind === KIND_ELEMENTS ? "elements" : "position"}`,
        );
      }
      allSamples = allSamples.concat(acc.samples.filter((p) => p.t >= a && p.t <= b));
    }
    allSamples.sort((x, y) => x.t - y.t);
    // Whole mission, measured: bytes and worst error at every sample fetched.
    const missionBytes = pieces.reduce((n, p) => n + fileOf(o, p, mu).byteLength, 0);
    let missionWorst = { km: 0, epoch: cov.start };
    for (const p of pieces) {
      const e = fileErrors(parse(fileOf(o, p, mu)), allSamples);
      if (e.km > missionWorst.km) missionWorst = { km: e.km, epoch: e.epoch };
    }
    const whole = missionBytes <= cfg.budget_bytes;
    // The window: segments overlapping build date +- window_days (clamped into the mission when it lies outside).
    let w0 = dateSeconds(cfg.build_date) - cfg.window_days * DAY;
    let w1 = dateSeconds(cfg.build_date) + cfg.window_days * DAY;
    if (w0 > cov.end) [w0, w1] = [cov.end - 2 * cfg.window_days * DAY, cov.end];
    if (w1 < cov.start) [w0, w1] = [cov.start, cov.start + 2 * cfg.window_days * DAY];
    const chunks: unknown[] = [];
    const stored: OrbiterChunk[] = [];
    for (const p of pieces) {
      const segs = whole ? p.segments : p.segments.filter((s) => s.t1 > w0 && s.t0 < w1);
      if (segs.length === 0) continue;
      const bytes = fileOf(o, p, mu, segs);
      // Named by start (TDB, to the minute): a transfer and the orbit after capture can start on the same day.
      const start = tdbText(Math.round(segs[0]!.t0 / MIN) * MIN);
      const file = `${o.id}/${start.slice(0, 10)}T${start.slice(11, 13)}${start.slice(14, 16)}.bin`;
      if (files.has(file)) throw new RangeError(`${o.name}: two chunks start at ${start}`);
      files.set(file, bytes);
      stored.push({ file, bytes, kind: p.kind, degree: p.degree, segments: segs, meanMotion: p.meanMotion });
      const e = fileErrors(parse(bytes), allSamples);
      chunks.push({
        file,
        coverage: {
          start: segs[0]!.t0,
          end: segs.at(-1)!.t1,
          start_tdb: tdbText(Math.round(segs[0]!.t0 / MIN) * MIN),
          end_tdb: tdbText(Math.round(segs.at(-1)!.t1 / MIN) * MIN),
        },
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        segment_kind: p.kind === KIND_ELEMENTS ? "elements" : "position",
        degree: p.degree,
        segments: segs.length,
        max_error_km: round(e.km, 4),
        target: o.id,
      });
    }
    const storedWorst = stored.reduce(
      (w, c) => {
        const e = fileErrors(parse(c.bytes), allSamples);
        return e.km > w.km ? { km: e.km, epoch: e.epoch } : w;
      },
      { km: 0, epoch: cov.start },
    );
    const first = stored[0]!.segments[0]!.t0;
    const last = stored.at(-1)!.segments.at(-1)!.t1;
    const template = Object.fromEntries(
      Object.entries(
        vectorParams({ command: String(o.id), center: `500@${o.center}`, start: "", stop: "", step: "" }),
      ).filter(([k]) => k !== "START_TIME" && k !== "STOP_TIME" && k !== "STEP_SIZE"),
    );
    const missed = pieces.flatMap((p) => p.misses).filter((m) => whole || (m.t1 > first && m.t0 < last));
    oo.log?.(
      `${o.name}: mission ${missionBytes} B, max ${missionWorst.km.toFixed(3)} km; ` +
        `${whole ? "whole mission" : `window ${tdbText(Math.round(first / MIN) * MIN)}..${tdbText(Math.round(last / MIN) * MIN)}`}; ` +
        `${acc.requests} requests`,
    );
    objects.push({
      id: o.id,
      name: o.name,
      kind: "spacecraft",
      center: o.center,
      query: { ...template, STEP_SIZE: `'${stepMin} m' | '${oo.fineStepMin ?? FINE_STEP_MIN} m'` },
      retrieved: [...acc.retrieved].sort().at(-1),
      source: [...acc.sources].sort().join("; "),
      horizons_coverage: {
        first: cov.first === null ? null : round(cov.first, 4),
        last: cov.last === null ? null : round(cov.last, 4),
      },
      mission: {
        coverage: { start: cov.start, end: cov.end, start_tdb: tdbText(cov.start), end_tdb: tdbText(cov.end) },
        bytes: missionBytes,
        budget_bytes: cfg.budget_bytes,
        max_error_km: {
          km: round(missionWorst.km, 4),
          epoch: missionWorst.epoch,
          jd_tdb: (J2000_JD + missionWorst.epoch / DAY).toFixed(6),
        },
        parts: pieces.map((p) => ({
          start_tdb: tdbText(Math.round(p.t0 / MIN) * MIN),
          end_tdb: tdbText(Math.round(p.t1 / MIN) * MIN),
          kept: p.kind === KIND_ELEMENTS ? "elements" : "position",
          candidates: p.candidates,
        })),
      },
      stored: whole ? "mission" : "window",
      ...(whole ? {} : { window: { build_date: cfg.build_date, days: cfg.window_days } }),
      coverage: {
        start: first,
        end: last,
        start_tdb: tdbText(Math.round(first / MIN) * MIN),
        end_tdb: tdbText(Math.round(last / MIN) * MIN),
      },
      chunks,
      tolerance_km: tol,
      max_error_km: {
        km: round(storedWorst.km, 4),
        epoch: storedWorst.epoch,
        jd_tdb: (J2000_JD + storedWorst.epoch / DAY).toFixed(6),
      },
      misses: missed.map((m) => ({ t0: m.t0, t1: m.t1, error_km: round(m.errorKm, 4) })),
      refined: pieces
        .flatMap((p) => p.refined)
        .filter((r) => whole || (r.t1 > first && r.t0 < last))
        .sort((x, y) => x.t0 - y.t0),
      seams: pieces
        .flatMap((p) => p.seams)
        .filter((x) => whole || (x.t > first && x.t < last))
        .sort((x, y) => x.t - y.t)
        .map((x) => ({ t: round(x.t, 3), t_after: round(x.t_after, 3), jump_km: round(x.jump_km, 3) })),
      fallbacks: [],
    });
  }
  return { files, objects };
}
