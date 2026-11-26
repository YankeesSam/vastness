// VN-EPH-002, VN-EPH-005: Chebyshev segments. A segment over [t0, t1] stores, per axis, n = degree + 1 coefficients
// laid out x0..x(n-1), y0..y(n-1), z0..z(n-1). tau = (2t - t0 - t1) / (t1 - t0); position = sum c_k T_k(tau);
// velocity = d/dtau x 2 / (t1 - t0). Evaluation uses the Clenshaw recurrence and its derivative and writes into a
// caller-supplied array: no allocation per call.

/** n Chebyshev nodes of the first kind in (-1, 1), ascending. */
export function chebyshevNodes(n: number): Float64Array {
  const x = new Float64Array(n);
  for (let j = 0; j < n; j++) x[j] = -Math.cos(((2 * j + 1) * Math.PI) / (2 * n));
  return x;
}

/**
 * Position and velocity from one segment at `tau` in [-1, 1]. `velScale` is dtau/dt (2 / (t1 - t0)).
 * Writes x, y, z, vx, vy, vz to out[outOffset..outOffset+5].
 */
export function evaluatePosVel(
  coeffs: Float64Array,
  offset: number,
  n: number,
  tau: number,
  velScale: number,
  out: Float64Array,
  outOffset: number,
): void {
  const tau2 = 2 * tau;
  for (let axis = 0; axis < 3; axis++) {
    const base = offset + axis * n;
    let b1 = 0;
    let b2 = 0;
    let d1 = 0;
    let d2 = 0;
    for (let k = n - 1; k >= 1; k--) {
      const b0 = coeffs[base + k]! + tau2 * b1 - b2;
      const d0 = 2 * b1 + tau2 * d1 - d2;
      b2 = b1;
      b1 = b0;
      d2 = d1;
      d1 = d0;
    }
    out[outOffset + axis] = coeffs[base]! + tau * b1 - b2;
    out[outOffset + 3 + axis] = (b1 + tau * d1 - d2) * velScale;
  }
}

/** Position and velocity at TDB time t from the segment covering [t0, t1]. */
export function evaluateSegment(
  coeffs: Float64Array,
  offset: number,
  n: number,
  t0: number,
  t1: number,
  t: number,
  out: Float64Array,
  outOffset: number,
): void {
  const span = t1 - t0;
  evaluatePosVel(coeffs, offset, n, (2 * t - t0 - t1) / span, 2 / span, out, outOffset);
}

export interface DerivativeRows {
  /** d value / dt at the same tau as the values. */
  derivatives: ArrayLike<number>;
  /** dtau/dt, so that d/dt = d/dtau x scale. */
  scale: number;
  /** Row weight relative to the value rows (default: 1 / scale, putting both in value units over the segment). */
  weight?: number;
}

/** T_k(tau) and dT_k/dtau for k = 0..n-1 into the two arrays. */
function basis(tau: number, n: number, t: Float64Array, dt: Float64Array): void {
  t[0] = 1;
  dt[0] = 0;
  if (n > 1) {
    t[1] = tau;
    dt[1] = 1;
  }
  for (let k = 2; k < n; k++) {
    t[k] = 2 * tau * t[k - 1]! - t[k - 2]!;
    dt[k] = 2 * t[k - 1]! + 2 * tau * dt[k - 1]! - dt[k - 2]!;
  }
}

/**
 * Least-squares Chebyshev coefficients (degree + 1 of them) for samples at `tau`, optionally with derivative
 * samples as extra rows. Solved by Householder QR for stability. Throws RangeError when underdetermined.
 */
export function fitChebyshev(
  tau: ArrayLike<number>,
  values: ArrayLike<number>,
  degree: number,
  rows?: DerivativeRows,
): Float64Array {
  const n = degree + 1;
  const m = tau.length + (rows ? tau.length : 0);
  if (values.length !== tau.length || (rows && rows.derivatives.length !== tau.length)) {
    throw new RangeError("sample arrays differ in length");
  }
  if (m < n) throw new RangeError(`degree ${degree} needs at least ${n} rows, got ${m}`);
  const a = new Float64Array(m * n); // row-major
  const b = new Float64Array(m);
  const t = new Float64Array(n);
  const dt = new Float64Array(n);
  const w = rows ? (rows.weight ?? 1 / rows.scale) : 0;
  for (let i = 0; i < tau.length; i++) {
    basis(tau[i]!, n, t, dt);
    a.set(t, i * n);
    b[i] = values[i]!;
    if (rows) {
      const r = tau.length + i;
      for (let k = 0; k < n; k++) a[r * n + k] = dt[k]! * rows.scale * w;
      b[r] = rows.derivatives[i]! * w;
    }
  }
  return solveLeastSquares(a, b, m, n);
}

/** Householder QR least squares for a row-major m x n matrix (m >= n). Overwrites a and b. */
function solveLeastSquares(a: Float64Array, b: Float64Array, m: number, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm = Math.hypot(norm, a[i * n + j]!);
    if (norm === 0) throw new RangeError(`rank-deficient fit (column ${j})`);
    const alpha = a[j * n + j]! > 0 ? -norm : norm;
    // v = x - alpha e1, stored in column j from row j.
    a[j * n + j] = a[j * n + j]! - alpha;
    let vv = 0;
    for (let i = j; i < m; i++) vv += a[i * n + j]! ** 2;
    for (let k = j + 1; k < n; k++) {
      let s = 0;
      for (let i = j; i < m; i++) s += a[i * n + j]! * a[i * n + k]!;
      const f = (2 * s) / vv;
      for (let i = j; i < m; i++) a[i * n + k] = a[i * n + k]! - f * a[i * n + j]!;
    }
    let s = 0;
    for (let i = j; i < m; i++) s += a[i * n + j]! * b[i]!;
    const f = (2 * s) / vv;
    for (let i = j; i < m; i++) b[i] = b[i]! - f * a[i * n + j]!;
    a[j * n + j] = alpha; // R diagonal
  }
  const x = new Float64Array(n);
  for (let j = n - 1; j >= 0; j--) {
    let s = b[j]!;
    for (let k = j + 1; k < n; k++) s -= a[j * n + k]! * x[k]!;
    x[j] = s / a[j * n + j]!;
  }
  return x;
}

/**
 * Fits one segment over [t0, t1] to position (and velocity) samples at TDB times, returning 3 x (degree + 1)
 * coefficients in evaluator layout. Velocities, when given, enter as derivative rows.
 */
export function fitSegment(
  t0: number,
  t1: number,
  times: ArrayLike<number>,
  positions: ArrayLike<ArrayLike<number>>,
  velocities: ArrayLike<ArrayLike<number>> | undefined,
  degree: number,
): Float64Array {
  const span = t1 - t0;
  const tau = Float64Array.from(times, (t) => (2 * t - t0 - t1) / span);
  const n = degree + 1;
  const out = new Float64Array(3 * n);
  for (let axis = 0; axis < 3; axis++) {
    const values = Float64Array.from(positions, (p) => p[axis]!);
    const rows = velocities
      ? { derivatives: Float64Array.from(velocities, (v) => v[axis]!), scale: 2 / span }
      : undefined;
    out.set(fitChebyshev(tau, values, degree, rows), axis * n);
  }
  return out;
}
