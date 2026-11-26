// VN-EPH-002, VN-EPH-003: adaptive Chebyshev segment fitting. Samples come at a fixed step; even-indexed samples
// are fitted (positions, and velocities as derivative rows) and odd-indexed ones, the midpoints between fitted
// samples, are held out. A segment whose held-out error exceeds the object's tolerance is halved, down to the step
// limit; one that still misses is listed. Every candidate degree is tried and the smallest passing file wins, since
// format v1 has one degree per file.

import { evaluateSegment, fitSegment } from "../../src/core/ephem/chebyshev.ts";
import type { SegmentInput } from "../../src/core/ephem/format.ts";

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
  toleranceKm: number;
  /** Candidate degrees (default 7..13). */
  degrees?: readonly number[];
  /** Sample intervals per segment before any halving; even (default 64). */
  initialIntervals?: number;
  /** Use velocities as derivative rows (default true). */
  velocities?: boolean;
}

export interface Miss {
  t0: number;
  t1: number;
  errorKm: number;
}

export interface FitResult {
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

/** Fit the even samples in [i0, i1] and measure the odd ones. i0 and i1 are even. */
function fitPiece(s: readonly Sample[], i0: number, i1: number, degree: number, withVel: boolean): Piece | undefined {
  const fitted: Sample[] = [];
  for (let i = i0; i <= i1; i += 2) fitted.push(s[i]!);
  const rows = fitted.length * (withVel ? 2 : 1);
  if (rows < degree + 1) return undefined;
  const t0 = s[i0]!.t;
  const t1 = s[i1]!.t;
  const coeffs = fitSegment(
    t0,
    t1,
    fitted.map((p) => p.t),
    fitted.map((p) => [p.x, p.y, p.z]),
    withVel ? fitted.map((p) => [p.vx, p.vy, p.vz]) : undefined,
    degree,
  );
  const out = new Float64Array(6);
  let errorKm = 0;
  let errorEpoch = t0;
  for (let i = i0 + 1; i < i1; i += 2) {
    const p = s[i]!;
    evaluateSegment(coeffs, 0, degree + 1, t0, t1, p.t, out, 0);
    const e = Math.hypot(out[0]! - p.x, out[1]! - p.y, out[2]! - p.z);
    if (e > errorKm) {
      errorKm = e;
      errorEpoch = p.t;
    }
  }
  return { i0, i1, coeffs, errorKm, errorEpoch };
}

/** One degree: halve every piece over tolerance until it passes or cannot be halved. */
function fitDegree(s: readonly Sample[], degree: number, o: Required<FitOptions>): FitResult | undefined {
  const last = s.length - 1;
  const starts: number[] = [];
  for (let i = 0; i < last; i += o.initialIntervals) starts.push(i);
  const pieces: Piece[] = [];
  const misses: Miss[] = [];
  const work = (i0: number, i1: number): boolean => {
    const p = fitPiece(s, i0, i1, degree, o.velocities);
    const mid = i0 + 2 * Math.floor((i1 - i0) / 4);
    const canHalve = mid > i0 && mid < i1 && fitPiece(s, i0, mid, degree, o.velocities) !== undefined;
    if (p && (p.errorKm <= o.toleranceKm || !canHalve)) {
      pieces.push(p);
      if (p.errorKm > o.toleranceKm) misses.push({ t0: s[i0]!.t, t1: s[i1]!.t, errorKm: p.errorKm });
      return true;
    }
    if (!canHalve) return false; // too few samples for this degree at all
    return work(i0, mid) && work(mid, i1);
  };
  for (const i0 of starts) if (!work(i0, Math.min(i0 + o.initialIntervals, last))) return undefined;
  let maxErrorKm = 0;
  let maxErrorEpoch = s[0]!.t;
  for (const p of pieces) {
    if (p.errorKm > maxErrorKm) {
      maxErrorKm = p.errorKm;
      maxErrorEpoch = p.errorEpoch;
    }
  }
  return {
    degree,
    segments: pieces.map((p) => ({ t0: s[p.i0]!.t, t1: s[p.i1]!.t, coeffs: p.coeffs })),
    maxErrorKm,
    maxErrorEpoch,
    misses,
  };
}

const size = (r: FitResult): number => r.segments.length * (r.degree + 1);

/**
 * Adaptive fit of equally spaced samples (an odd count, so the span ends on a fitted sample). Returns the passing
 * fit with the fewest coefficients; if none passes, the one with the fewest misses, then the smallest error.
 */
export function fitAdaptive(samples: readonly Sample[], options: FitOptions): FitResult {
  const o: Required<FitOptions> = { degrees: DEGREES, initialIntervals: 64, velocities: true, ...options };
  if (!(o.toleranceKm > 0)) throw new RangeError("tolerance must be positive");
  if (o.initialIntervals < 4 || o.initialIntervals % 2 !== 0)
    throw new RangeError("initialIntervals must be even, >= 4");
  if (samples.length < 3 || samples.length % 2 === 0) {
    throw new RangeError(`need an odd number of samples (fitted ends, held-out midpoints), got ${samples.length}`);
  }
  for (let i = 1; i < samples.length; i++) {
    if (!(samples[i]!.t > samples[i - 1]!.t)) throw new RangeError(`samples not ascending at ${i}`);
  }
  let best: FitResult | undefined;
  for (const degree of o.degrees) {
    const r = fitDegree(samples, degree, o);
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
