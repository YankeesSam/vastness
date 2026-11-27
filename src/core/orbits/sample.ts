// VN-SCN-002: orbit paths sampled from the ephemeris (not ellipses) over one period centred on the current time (slid
// to stay inside the data coverage), faded with distance (in time along the orbit) from the current position, and
// resampled as time moves. Pure: the scene passes an evaluator and a window. Allocates nothing per call when given a
// window.

/**
 * Sidereal orbital periods, days: NASA GSFC Planetary Fact Sheet (D. R. Williams), "Sidereal orbit period", and the
 * Moon Fact Sheet (sidereal month).
 */
export const ORBIT_PERIOD_DAYS: Readonly<Record<number, number>> = {
  199: 87.969,
  299: 224.701,
  399: 365.256,
  301: 27.3217,
  499: 686.98,
  599: 4332.589,
  699: 10_759.22,
  799: 30_685.4,
  899: 60_189,
};

/** Samples per orbit: odd, so the middle one is exactly the current position. */
export const ORBIT_SAMPLES = 513;

/** Writes the position (km) at TDB t into out[o..o+2]; false when there is none. */
export type Evaluate = (t: number, out: Float64Array, o: number) => boolean;

export interface OrbitSamples {
  readonly n: number;
  /** Positions, 3 per sample, float64 km. */
  readonly pos: Float64Array;
  /** 1 where the evaluator gave a position. */
  readonly ok: Uint8Array;
  /** Opacity per sample (orbitFade of its time distance from the centre). */
  readonly alpha: Float32Array;
  /** The time the samples are centred on, and the spacing, TDB s. */
  tCentre: number;
  step: number;
  missing: number;
}

export function createOrbitSamples(n = ORBIT_SAMPLES): OrbitSamples {
  return {
    n,
    pos: new Float64Array(3 * n),
    ok: new Uint8Array(n),
    alpha: new Float32Array(n),
    tCentre: NaN,
    step: 0,
    missing: n,
  };
}

/** Opacity at u = time distance from the current position over half a period, 0..1: 0.9 down to 0.12. */
export function orbitFade(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return 0.12 + 0.78 * (1 - c) * (1 - c);
}

export interface OrbitWindow {
  /** Start of the sampled span, TDB s. */
  t0: number;
  /** Length of the sampled span, s: one period, or the whole coverage when that is shorter. */
  span: number;
}

/**
 * VN-SCN-002, VN-EPH-006: the span to sample for an orbit of period P at time t, given the data coverage
 * [start, end]: one period centred on t, slid to stay inside the coverage (never extrapolated). False when t is
 * outside the coverage (no orbit is drawn).
 */
export function orbitWindow(t: number, periodS: number, start: number, end: number, out: OrbitWindow): boolean {
  if (!(t >= start && t <= end)) return false;
  const span = Math.min(periodS, end - start);
  let t0 = t - span / 2;
  if (t0 < start) t0 = start;
  if (t0 + span > end) t0 = end - span;
  out.t0 = t0;
  out.span = span;
  return true;
}

/**
 * Samples an orbit of period P (s) at time t over `range` (default: one period centred on t): n samples from t0 to
 * t0 + span, so for a full period the ends meet. The fade is measured from t in units of half a period.
 */
export function sampleOrbit(
  evaluate: Evaluate,
  t: number,
  periodS: number,
  s: OrbitSamples,
  range: OrbitWindow = { t0: t - periodS / 2, span: periodS },
): void {
  const step = range.span / (s.n - 1);
  let missing = 0;
  for (let i = 0; i < s.n; i++) {
    const ti = range.t0 + i * step;
    if (evaluate(ti, s.pos, 3 * i)) s.ok[i] = 1;
    else {
      s.ok[i] = 0;
      missing++;
    }
    s.alpha[i] = orbitFade(Math.abs(ti - t) / (periodS / 2));
  }
  s.tCentre = t;
  s.step = step;
  s.missing = missing;
}

/** True once time has moved a whole sample step from the centre, or while any sample is missing. */
export function needsResample(s: OrbitSamples, t: number): boolean {
  return s.missing > 0 || !(Math.abs(t - s.tCentre) < s.step);
}

/**
 * VN-SCN-004 (ADR-0004): relative-to-eye encoding. Splits x into a float32 high part and the float32 remainder, so
 * the GPU can subtract the camera's high and low parts separately without losing metres at tens of AU.
 */
export function splitDouble(x: number, out: Float32Array, o: number): void {
  const hi = Math.fround(x);
  out[o] = hi;
  out[o + 1] = x - hi;
}
