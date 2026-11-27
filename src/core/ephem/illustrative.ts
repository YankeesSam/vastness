import { elementsToState } from "./elements.ts";

// VN-EPH-011, VN-EPH-007: an orbiter outside its stored span is drawn on an illustrative orbit, never at an invented
// exact position. The orbit is the two-body (Kepler) ellipse of the osculating elements at the nearest edge of the
// stored span, written into the manifest by the pipeline; the marker moves along it at that orbit's period. Pure,
// no allocation per call.

/** Osculating elements at one edge of an orbiter's stored span, relative to its parent. */
export interface IllustrativeEdge {
  /** TDB seconds since J2000 of the edge. */
  t: number;
  /** GM of the parent, km^3/s^2. */
  mu: number;
  /** a (km), e, i, node, argument of periapsis, mean anomaly (rad), at t. */
  elements: readonly [number, number, number, number, number, number];
  /** A "before" edge applies only from this time (the mission's start): before launch nothing is drawn. */
  from?: number;
}

export interface Illustrative {
  /** Edge used before the stored span (only when the orbiter was already in orbit there) and after it. */
  before?: IllustrativeEdge;
  after?: IllustrativeEdge;
}

/** Period of the illustrative orbit, s. */
export function illustrativePeriod(edge: IllustrativeEdge): number {
  const a = edge.elements[0];
  return 2 * Math.PI * Math.sqrt((a * a * a) / edge.mu);
}

/** The edge that applies at t outside a stored span [start, end], or undefined (inside, or no edge on that side). */
export function edgeFor(
  ill: Illustrative | undefined,
  coverage: { start: number; end: number } | null,
  t: number,
): IllustrativeEdge | undefined {
  if (!ill || !coverage) return undefined;
  if (t > coverage.end) return ill.after;
  if (t < coverage.start) return ill.before && !(t < (ill.before.from ?? -Infinity)) ? ill.before : undefined;
  return undefined;
}

/**
 * State on the illustrative orbit at TDB time t relative to the parent (km, km/s) into out[o..o+5]: the edge's
 * ellipse with the mean anomaly advanced at its mean motion. Elliptic edges only (the pipeline writes no others).
 */
export function illustrativeState(edge: IllustrativeEdge, t: number, out: Float64Array, o = 0): void {
  const [a, e, i, node, peri, m0] = edge.elements;
  const n = Math.sqrt(edge.mu / (a * a * a));
  elementsToState(a, e, i, node, peri, m0 + n * (t - edge.t), edge.mu, out, o);
}
