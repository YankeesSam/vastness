// VN-CAT-004: spacecraft trails. The past trajectory (before the simulation time) is drawn solid and the predicted
// one (after it) dashed, over an adjustable range (default 1 year back and 1 year ahead, up to the whole coverage),
// sampled adaptively by curvature so flybys stay smooth while straight cruise needs few points. Pure; the scene
// passes an evaluator. Allocates nothing per call.

import type { Evaluate } from "../orbits/sample";

const DAY = 86400;

/** Default range, days back and ahead (VN-CAT-004). */
export const TRAIL_DEFAULT_DAYS = 365;
/** The longest a trail may reach in either direction: the whole coverage. */
export const TRAIL_WHOLE = Infinity;
/** Choices offered for the range, days; TRAIL_WHOLE is "whole coverage". */
export const TRAIL_RANGES_DAYS = [30, 365, 5 * 365, TRAIL_WHOLE] as const;

/** Most points in one trail (past and future together). */
export const TRAIL_MAX_POINTS = 2049;
/** Uniform samples per side before refining. */
export const TRAIL_BASE_INTERVALS = 64;
/**
 * Refinement test: an interval is halved while its midpoint lies farther than this fraction of the chord from the
 * chord (about 0.1 degree of bend); a smooth curve is then within a pixel at any zoom that shows the whole interval.
 */
export const TRAIL_CHORD_TOLERANCE = 0.002;
/** Deepest halving of a base interval (2^-12 of it: under 2 hours for a 1-year trail). */
export const TRAIL_MAX_DEPTH = 12;

export interface TrailRange {
  /** Start, now and end, TDB s; t0 <= now <= t1. */
  t0: number;
  now: number;
  t1: number;
}

/**
 * The span to draw at time t: `backDays` before and `aheadDays` after, clipped to the coverage. False when t lies
 * outside the coverage (the spacecraft is not drawn, VN-EPH-007, and neither is its trail).
 */
export function trailRange(
  t: number,
  backDays: number,
  aheadDays: number,
  coverage: { start: number; end: number },
  out: TrailRange,
): boolean {
  if (!(t >= coverage.start && t <= coverage.end)) return false;
  out.now = t;
  out.t0 = Math.max(coverage.start, t - backDays * DAY);
  out.t1 = Math.min(coverage.end, t + aheadDays * DAY);
  return true;
}

export interface TrailSamples {
  readonly capacity: number;
  /** Positions, 3 per point, float64 km, in time order. */
  readonly pos: Float64Array;
  /** Time of each point, TDB s. */
  readonly t: Float64Array;
  /** Points written. */
  count: number;
  /** Index of the point at `now`: points before it are past (solid), from it on predicted (dashed). */
  split: number;
  /** Evaluations that gave no position (chunks still loading). */
  missing: number;
  /** True when the point budget cut refinement short. */
  truncated: boolean;
  /** The range the samples were taken for. */
  readonly range: TrailRange;
}

export function createTrailSamples(capacity = TRAIL_MAX_POINTS): TrailSamples {
  return {
    capacity,
    pos: new Float64Array(3 * capacity),
    t: new Float64Array(capacity),
    count: 0,
    split: 0,
    missing: 0,
    truncated: false,
    range: { t0: NaN, now: NaN, t1: NaN },
  };
}

// Scratch positions for the recursion: slots 0 and 1 hold a base interval's ends, slot d + 2 the midpoint at depth d.
const slots = new Float64Array(3 * (TRAIL_MAX_DEPTH + 3));

function emit(s: TrailSamples, t: number, o: number): void {
  const k = s.count;
  s.t[k] = t;
  s.pos[3 * k] = slots[o]!;
  s.pos[3 * k + 1] = slots[o + 1]!;
  s.pos[3 * k + 2] = slots[o + 2]!;
  s.count = k + 1;
}

/**
 * Emits the interior points of [ta, tb] (ends in slots a and b) in time order, halving while the midpoint bends away
 * from the chord. `reserve` points are kept free for what the caller still has to emit.
 */
function refine(
  evaluate: Evaluate,
  s: TrailSamples,
  ta: number,
  a: number,
  tb: number,
  b: number,
  depth: number,
  reserve: number,
): void {
  if (depth >= TRAIL_MAX_DEPTH) return;
  if (s.count + reserve + 1 > s.capacity) {
    s.truncated = true;
    return;
  }
  const m = 3 * (depth + 2);
  const tm = (ta + tb) / 2;
  if (!evaluate(tm, slots, m)) {
    s.missing++;
    return;
  }
  const chord = Math.hypot(slots[b]! - slots[a]!, slots[b + 1]! - slots[a + 1]!, slots[b + 2]! - slots[a + 2]!);
  const dev = Math.hypot(
    slots[m]! - (slots[a]! + slots[b]!) / 2,
    slots[m + 1]! - (slots[a + 1]! + slots[b + 1]!) / 2,
    slots[m + 2]! - (slots[a + 2]! + slots[b + 2]!) / 2,
  );
  if (!(dev > TRAIL_CHORD_TOLERANCE * chord)) return;
  // The left half uses deeper slots only, so slot m (and a, b) survive it.
  refine(evaluate, s, ta, a, tm, m, depth + 1, reserve + 1);
  emit(s, tm, m);
  refine(evaluate, s, tm, m, tb, b, depth + 1, reserve);
}

/** Samples one side [ta, tb] at TRAIL_BASE_INTERVALS and refines each interval; ta's point is in slot 0, emitted. */
function side(evaluate: Evaluate, s: TrailSamples, ta: number, tb: number, reserve: number): void {
  if (!(tb > ta)) return;
  const n = TRAIL_BASE_INTERVALS;
  let t0 = ta;
  for (let k = 1; k <= n; k++) {
    const t1 = k === n ? tb : ta + ((tb - ta) * k) / n;
    if (!evaluate(t1, slots, 3)) {
      s.missing++;
      continue;
    }
    refine(evaluate, s, t0, 0, t1, 3, 0, reserve + (n - k) + 1);
    emit(s, t1, 3);
    slots.copyWithin(0, 3, 6);
    t0 = t1;
  }
}

/**
 * Samples the trail over `r` into `s`: the point at r.now first splits the trail; each side is sampled at
 * TRAIL_BASE_INTERVALS and refined by curvature within the point budget. Positions the evaluator cannot give
 * (chunks loading) are counted in `missing` and skipped.
 */
export function sampleTrail(evaluate: Evaluate, r: TrailRange, s: TrailSamples): void {
  s.count = 0;
  s.missing = 0;
  s.truncated = false;
  s.range.t0 = r.t0;
  s.range.now = r.now;
  s.range.t1 = r.t1;
  // Past: from t0 up to now. The first point is t0 itself.
  if (evaluate(r.t0, slots, 0)) emit(s, r.t0, 0);
  else {
    s.missing++;
    s.split = 0;
    return;
  }
  const half = Math.floor((s.capacity - 1) / 2);
  side(evaluate, s, r.t0, r.now, half + TRAIL_BASE_INTERVALS);
  s.split = s.count - 1;
  // slot 0 now holds the point at now (the last emitted), which the future side starts from.
  side(evaluate, s, r.now, r.t1, 0);
}

/** True when the trail should be sampled again: time moved by 1/256 of the range, or a position was missing. */
export function trailStale(s: TrailSamples, r: TrailRange): boolean {
  if (s.missing > 0 || s.count === 0) return true;
  const span = r.t1 - r.t0;
  return (
    !(Math.abs(r.now - s.range.now) < span / 256) ||
    Math.abs(r.t0 - s.range.t0) > span / 256 ||
    Math.abs(r.t1 - s.range.t1) > span / 256
  );
}
