// VN-EPH-002, VN-EPH-003: adaptive Chebyshev segment fitting. Samples come at a fixed step; even-indexed samples
// are fitted (positions, and velocities as derivative rows) and odd-indexed ones, the midpoints between fitted
// samples, are held out. A segment whose held-out error exceeds the object's tolerance is halved, down to the step
// limit; one that still misses is listed. Every candidate degree is tried and the smallest passing file wins, since
// format v1 has one degree per file.

import { evaluateSegment, fitSegment } from "../../src/core/ephem/chebyshev.ts";
import { elementSeries, evaluateElementSegment, fitElementSegment } from "../../src/core/ephem/elements.ts";
import { KIND_ELEMENTS, KIND_POSITION, type EphemerisFile, type SegmentInput } from "../../src/core/ephem/format.ts";

/** Position tolerances in km (VN-EPH-003). */
export const TOLERANCE_KM = { planet: 10, moon: 10, cruise: 50, lunarOrbit: 2 } as const;

export const DEGREES = [7, 8, 9, 10, 11, 12, 13] as const;

export interface Sample {
  /** TDB seconds since J2000. */
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface FitOptions {
  /** The object's tolerance (VN-EPH-003): a segment over it at the step limit is a miss. */
  toleranceKm: number;
  /**
   * Held-out error to subdivide down to (default toleranceKm). The pipeline uses half the tolerance, because the
   * error between samples can exceed the error at the midpoints (ephem:check found Jupiter 6 % over).
   */
  targetKm?: number;
  /** Candidate degrees (default 7..13). */
  degrees?: readonly number[];
  /** Sample intervals per segment before any halving; even (default 64). */
  initialIntervals?: number;
  /** Use velocities as derivative rows (default true). */
  velocities?: boolean;
  /** Join a too-short last piece to the one before instead of rejecting the degree (default false; spacecraft). */
  joinShortTail?: boolean;
  /**
   * Fit osculating-element segments about a centre of GM `mu` instead of positions (VN-EPH-011); the sixth
   * component is M - meanMotion t. The error is still measured in position. Throws on a non-elliptic sample.
   */
  elements?: { mu: number; meanMotion: number };
}

export interface Miss {
  t0: number;
  t1: number;
  errorKm: number;
}

export interface FitResult {
  /** KIND_POSITION (x, y, z) or KIND_ELEMENTS (six element components). */
  kind: typeof KIND_POSITION | typeof KIND_ELEMENTS;
  degree: number;
  segments: SegmentInput[];
  /** Largest error at held-out points, with its epoch. */
  maxErrorKm: number;
  maxErrorEpoch: number;
  /** Segments at the step limit that still exceed the tolerance. */
  misses: Miss[];
}

interface Piece {
  i0: number;
  i1: number;
  coeffs: Float64Array;
  errorKm: number;
  errorEpoch: number;
}

interface Ctx {
  s: readonly Sample[];
  withVel: boolean;
  /** Element series per component when fitting elements. */
  series?: Float64Array[];
  mu: number;
  meanMotion: number;
}

const clock = new Float64Array(1);

/** State at t from one segment's coefficients of either kind, into out[0..5]. */
function evaluatePiece(
  c: Ctx,
  coeffs: Float64Array,
  degree: number,
  t0: number,
  t1: number,
  t: number,
  out: Float64Array,
) {
  if (!c.series) {
    evaluateSegment(coeffs, 0, degree + 1, t0, t1, t, out, 0);
    return;
  }
  const f = { t0: [t0], t1: [t1], degree, coeffs, mu: c.mu, meanMotion: c.meanMotion } as unknown as EphemerisFile;
  clock[0] = t;
  evaluateElementSegment(f, 0, clock, out, 0);
}

/** Fit the even samples in [i0, i1] and measure the odd ones. i0 and i1 are even. */
function fitPiece(c: Ctx, i0: number, i1: number, degree: number): Piece | undefined {
  const s = c.s;
  const idx: number[] = [];
  for (let i = i0; i <= i1; i += 2) idx.push(i);
  const rows = idx.length * (c.withVel && !c.series ? 2 : 1);
  if (rows < degree + 1) return undefined;
  const t0 = s[i0]!.t;
  const t1 = s[i1]!.t;
  const times = idx.map((i) => s[i]!.t);
  const coeffs = c.series
    ? fitElementSegment(
        t0,
        t1,
        times,
        c.series.map((col) => idx.map((i) => col[i]!)),
        degree,
      )
    : fitSegment(
        t0,
        t1,
        times,
        idx.map((i) => [s[i]!.x, s[i]!.y, s[i]!.z]),
        c.withVel ? idx.map((i) => [s[i]!.vx, s[i]!.vy, s[i]!.vz]) : undefined,
        degree,
      );
  const out = new Float64Array(6);
  let errorKm = 0;
  let errorEpoch = t0;
  for (let i = i0 + 1; i < i1; i += 2) {
    const p = s[i]!;
    evaluatePiece(c, coeffs, degree, t0, t1, p.t, out);
    const e = Math.hypot(out[0]! - p.x, out[1]! - p.y, out[2]! - p.z);
    if (!(e <= errorKm)) {
      errorKm = Number.isFinite(e) ? e : Infinity;
      errorEpoch = p.t;
    }
  }
  return { i0, i1, coeffs, errorKm, errorEpoch };
}

/** One degree: halve every piece over tolerance until it passes or cannot be halved. */
function fitDegree(c: Ctx, degree: number, o: Required<Omit<FitOptions, "elements">>): FitResult | undefined {
  const s = c.s;
  const last = s.length - 1;
  const starts: number[] = [];
  for (let i = 0; i < last; i += o.initialIntervals) starts.push(i);
  // With joinShortTail, a last piece too short to fit at this degree joins the one before (work() halves it if it
  // then misses) instead of ruling the degree out. Off by default so the planets' files stay as they are.
  const rows = (intervals: number): number => (intervals / 2 + 1) * (c.withVel && !c.series ? 2 : 1);
  if (o.joinShortTail) while (starts.length > 1 && rows(last - starts.at(-1)!) < degree + 1) starts.pop();
  const pieces: Piece[] = [];
  const misses: Miss[] = [];
  const work = (i0: number, i1: number): boolean => {
    const p = fitPiece(c, i0, i1, degree);
    const mid = i0 + 2 * Math.floor((i1 - i0) / 4);
    const canHalve = mid > i0 && mid < i1 && fitPiece(c, i0, mid, degree) !== undefined;
    if (p && (p.errorKm <= o.targetKm || !canHalve)) {
      pieces.push(p);
      if (p.errorKm > o.toleranceKm) misses.push({ t0: s[i0]!.t, t1: s[i1]!.t, errorKm: p.errorKm });
      return true;
    }
    if (!canHalve) return false; // too few samples for this degree at all
    return work(i0, mid) && work(mid, i1);
  };
  for (let k = 0; k < starts.length; k++) {
    if (!work(starts[k]!, k + 1 < starts.length ? starts[k + 1]! : last)) return undefined;
  }
  let maxErrorKm = 0;
  let maxErrorEpoch = s[0]!.t;
  for (const p of pieces) {
    if (p.errorKm > maxErrorKm) {
      maxErrorKm = p.errorKm;
      maxErrorEpoch = p.errorEpoch;
    }
  }
  return {
    kind: c.series ? KIND_ELEMENTS : KIND_POSITION,
    degree,
    segments: pieces.map((p) => ({ t0: s[p.i0]!.t, t1: s[p.i1]!.t, coeffs: p.coeffs })),
    maxErrorKm,
    maxErrorEpoch,
    misses,
  };
}

/** Stored coefficients: segments x components x (degree + 1). */
export const fitSize = (r: FitResult): number =>
  r.segments.length * (r.kind === KIND_ELEMENTS ? 6 : 3) * (r.degree + 1);
const size = fitSize;

/**
 * Adaptive fit of equally spaced samples (an odd count, so the span ends on a fitted sample). Returns the passing
 * fit with the fewest coefficients; if none passes, the one with the fewest misses, then the smallest error.
 */
export function fitAdaptive(samples: readonly Sample[], options: FitOptions): FitResult {
  const { elements, ...rest } = options;
  const o: Required<Omit<FitOptions, "elements">> = {
    degrees: DEGREES,
    initialIntervals: 64,
    velocities: true,
    joinShortTail: false,
    targetKm: options.toleranceKm,
    ...rest,
  };
  if (!(o.toleranceKm > 0)) throw new RangeError("tolerance must be positive");
  if (!(o.targetKm > 0 && o.targetKm <= o.toleranceKm)) throw new RangeError("target must be in (0, tolerance]");
  if (o.initialIntervals < 4 || o.initialIntervals % 2 !== 0)
    throw new RangeError("initialIntervals must be even, >= 4");
  if (samples.length < 3 || samples.length % 2 === 0) {
    throw new RangeError(`need an odd number of samples (fitted ends, held-out midpoints), got ${samples.length}`);
  }
  for (let i = 1; i < samples.length; i++) {
    if (!(samples[i]!.t > samples[i - 1]!.t)) throw new RangeError(`samples not ascending at ${i}`);
  }
  const c: Ctx = { s: samples, withVel: o.velocities, mu: elements?.mu ?? 0, meanMotion: elements?.meanMotion ?? 0 };
  if (elements) {
    c.series = elementSeries(
      samples.map((p) => p.t),
      samples.map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz]),
      elements.mu,
      elements.meanMotion,
    );
  }
  let best: FitResult | undefined;
  for (const degree of o.degrees) {
    const r = fitDegree(c, degree, o);
    if (!r) continue;
    if (
      !best ||
      r.misses.length < best.misses.length ||
      (r.misses.length === best.misses.length &&
        (r.misses.length === 0 ? size(r) < size(best) : r.maxErrorKm < best.maxErrorKm))
    ) {
      best = r;
    }
  }
  if (!best) throw new RangeError("too few samples for any candidate degree");
  return best;
}
