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
 * Refinement test: an interval is halved while its quarter points or midpoint lie farther than this fraction of the
 * chord from the chord (about 0.1 degree of bend); a smooth curve is then within a pixel at any zoom that shows the whole interval.
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

// D-004: refinement is worst-first, so a budget that cannot reach the tolerance everywhere is spread over the whole
// range instead of being spent on the first intervals. Each interval is tested at its quarter points and midpoint,
// so one whose length is near a whole number of periods (midpoint on the chord) is still seen to bend.
//
// Pool: point p has a time pt[p] and a position pp[3p..3p+2]. Interval i runs from point ia[i] to point ib[i] and
// holds its quarter points and midpoint (q1, m, q3, already evaluated) and its bend. The emitted points form a
// time-ordered linked list through `next`. Grown only when a larger budget is first seen.
let pt = new Float64Array(0);
let pp = new Float64Array(0);
let next = new Int32Array(0);
let ia = new Int32Array(0);
let ib = new Int32Array(0);
let iq1 = new Int32Array(0);
let im = new Int32Array(0);
let iq3 = new Int32Array(0);
let bend = new Float64Array(0);
/** Max-heap of interval indices by bend. */
let heap = new Int32Array(0);
let points = 0;
let intervals = 0;
let heapSize = 0;

function grow(capacity: number): void {
  // The base intervals hold three points each; each split adds two intervals and two new quarter points each.
  const nPoints = 1 + 4 * TRAIL_BASE_INTERVALS + 4 * capacity;
  const nIntervals = TRAIL_BASE_INTERVALS + 2 * capacity;
  if (pt.length >= nPoints) return;
  pt = new Float64Array(nPoints);
  pp = new Float64Array(3 * nPoints);
  next = new Int32Array(nPoints);
  ia = new Int32Array(nIntervals);
  ib = new Int32Array(nIntervals);
  iq1 = new Int32Array(nIntervals);
  im = new Int32Array(nIntervals);
  iq3 = new Int32Array(nIntervals);
  bend = new Float64Array(nIntervals);
  heap = new Int32Array(nIntervals);
}

/** Evaluates a new pool point at t; -1 when the evaluator has no position. */
function point(evaluate: Evaluate, s: TrailSamples, t: number): number {
  const p = points;
  if (!evaluate(t, pp, 3 * p)) {
    s.missing++;
    return -1;
  }
  pt[p] = t;
  next[p] = -1;
  points = p + 1;
  return p;
}

/** Distance of pool point q from the point at fraction f along the chord a..b. */
function off(q: number, a: number, b: number, f: number): number {
  let d2 = 0;
  for (let k = 0; k < 3; k++) {
    const l = pp[3 * a + k]! + f * (pp[3 * b + k]! - pp[3 * a + k]!);
    d2 += (pp[3 * q + k]! - l) ** 2;
  }
  return Math.sqrt(d2);
}

function push(i: number): void {
  let k = heapSize++;
  heap[k] = i;
  while (k > 0) {
    const up = (k - 1) >> 1;
    if (!(bend[heap[up]!]! < bend[i]!)) break;
    heap[k] = heap[up]!;
    heap[up] = i;
    k = up;
  }
}

function pop(): number {
  const top = heap[0]!;
  const last = heap[--heapSize]!;
  let k = 0;
  heap[0] = last;
  for (;;) {
    const l = 2 * k + 1;
    if (l >= heapSize) break;
    const c = l + 1 < heapSize && bend[heap[l + 1]!]! > bend[heap[l]!]! ? l + 1 : l;
    if (!(bend[heap[c]!]! > bend[last]!)) break;
    heap[k] = heap[c]!;
    heap[c] = last;
    k = c;
  }
  return top;
}

/**
 * Opens the interval a..b whose midpoint m (or -1) is known, evaluating its quarter points, and queues it when it
 * bends more than the tolerance and is longer than `shortest`.
 */
function open(evaluate: Evaluate, s: TrailSamples, a: number, b: number, m: number, shortest: number): void {
  const ta = pt[a]!;
  const tb = pt[b]!;
  if (!(tb - ta > shortest)) return;
  if (m < 0) m = point(evaluate, s, (ta + tb) / 2);
  if (m < 0) return;
  const q1 = point(evaluate, s, ta + (tb - ta) / 4);
  const q3 = point(evaluate, s, ta + (3 * (tb - ta)) / 4);
  let dev = off(m, a, b, 0.5);
  if (q1 >= 0) dev = Math.max(dev, off(q1, a, b, 0.25));
  if (q3 >= 0) dev = Math.max(dev, off(q3, a, b, 0.75));
  const chord = Math.hypot(pp[3 * b]! - pp[3 * a]!, pp[3 * b + 1]! - pp[3 * a + 1]!, pp[3 * b + 2]! - pp[3 * a + 2]!);
  // Relative bend, 1 at most (an interval that loops back has a chord near zero).
  const r = dev / Math.max(chord, dev);
  if (!(r > TRAIL_CHORD_TOLERANCE)) return;
  const i = intervals++;
  ia[i] = a;
  ib[i] = b;
  im[i] = m;
  iq1[i] = q1;
  iq3[i] = q3;
  bend[i] = r;
  push(i);
}

/**
 * Samples one side (ta, tb] into `s` with at most `budget` points: TRAIL_BASE_INTERVALS uniform intervals (fewer if
 * the budget is smaller), then the worst-bending interval halved until all are within tolerance or the budget is
 * spent. The point at ta is already in `s` (its last point).
 */
function side(evaluate: Evaluate, s: TrailSamples, ta: number, tb: number, budget: number): void {
  if (!(tb > ta) || budget < 1) return;
  grow(s.capacity);
  points = 0;
  intervals = 0;
  heapSize = 0;
  const last = 3 * (s.count - 1);
  const head = points++;
  pt[head] = ta;
  pp[0] = s.pos[last]!;
  pp[1] = s.pos[last + 1]!;
  pp[2] = s.pos[last + 2]!;
  next[head] = -1;
  const n = Math.min(TRAIL_BASE_INTERVALS, budget);
  const shortest = (tb - ta) / n / 2 ** TRAIL_MAX_DEPTH;
  let used = 0;
  let prev = head;
  for (let k = 1; k <= n; k++) {
    const p = point(evaluate, s, k === n ? tb : ta + ((tb - ta) * k) / n);
    if (p < 0) continue;
    next[prev] = p;
    prev = p;
    used++;
  }
  for (let a = head; next[a]! >= 0; a = next[a]!) open(evaluate, s, a, next[a]!, -1, shortest);
  while (heapSize > 0) {
    if (used >= budget) {
      s.truncated = true;
      break;
    }
    const i = pop();
    const a = ia[i]!;
    const m = im[i]!;
    const b = ib[i]!;
    next[a] = m;
    next[m] = b;
    used++;
    open(evaluate, s, a, m, iq1[i]!, shortest);
    open(evaluate, s, m, b, iq3[i]!, shortest);
  }
  for (let p = next[head]!; p >= 0; p = next[p]!) {
    const k = s.count++;
    s.t[k] = pt[p]!;
    s.pos[3 * k] = pp[3 * p]!;
    s.pos[3 * k + 1] = pp[3 * p + 1]!;
    s.pos[3 * k + 2] = pp[3 * p + 2]!;
  }
}

/**
 * Samples the trail over `r` into `s`: the point at r.now first splits the trail; each side is sampled at
 * TRAIL_BASE_INTERVALS and refined by curvature, worst bend first, within the point budget (half of it for the past). Positions the evaluator cannot give
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
  if (!evaluate(r.t0, s.pos, 0)) {
    s.missing++;
    s.split = 0;
    return;
  }
  s.t[0] = r.t0;
  s.count = 1;
  side(evaluate, s, r.t0, r.now, Math.floor((s.capacity - 1) / 2));
  s.split = s.count - 1;
  // The future side starts from the point at now (the last written).
  side(evaluate, s, r.now, r.t1, s.capacity - s.count);
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
