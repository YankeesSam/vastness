import { AU_KM, BODIES, type BodyId } from "../constants";

// VN-SCL-001, VN-SCL-002 (ADR-0004): the scale mapping. A pure function from true positions and radii to drawn ones;
// the scene never scales anything on its own. True scale draws everything as it is. Exaggerated scale enlarges radii
// by a factor per class and stretches each moon's distance from its parent so it clears the enlarged parent; the
// factors are chosen so no body overlaps another at any time in the planets' coverage (property-tested against the
// ephemeris). `amount` runs from 0 (true) to 1 (exaggerated); a switch animates it (VN-SCL-003), and every factor is
// taken to the power `amount` so the change is even on a logarithmic view.

export type ScaleMode = "true" | "exaggerated";

export type BodyClass = "star" | "terrestrial" | "giant" | "moon";

/** Radius factor per class in exaggerated scale (shown on screen, VN-SCL-002). */
export const CLASS_FACTOR: Readonly<Record<BodyClass, number>> = {
  star: 40,
  terrestrial: 1000,
  giant: 300,
  moon: 1000,
};

const CLASS_OF: Readonly<Record<BodyId, BodyClass>> = {
  10: "star",
  199: "terrestrial",
  299: "terrestrial",
  399: "terrestrial",
  301: "moon",
  499: "terrestrial",
  599: "giant",
  699: "giant",
  799: "giant",
  899: "giant",
};

/**
 * The closest a moon comes to its parent, km. The Moon: perigee never below 356 355 km in 1500-2500 (Meeus,
 * Astronomical Algorithms, 2nd ed., ch. 50); rounded down.
 */
const MOON_MIN_DISTANCE_KM: Readonly<Partial<Record<BodyId, { parent: BodyId; km: number }>>> = {
  301: { parent: 399, km: 356_000 },
};

/** At its closest, a stretched moon's centre is this many times the sum of the two enlarged radii from its parent's. */
export const MOON_CLEARANCE = 1.5;

export interface ScaleTable {
  /** Number of bodies (the first entries of the position buffers). */
  readonly n: number;
  readonly radiusKm: Float64Array;
  /** Exaggerated radius factor per body. */
  readonly factor: Float64Array;
  /** Index of the parent body for a moon, -1 otherwise. */
  readonly parent: Int32Array;
  /** Exaggerated distance stretch of a moon about its parent, 1 otherwise. */
  readonly stretch: Float64Array;
  /**
   * D-002: the heliocentric distances, km, a point must lie between for the body to push it at any scale amount: the
   * body's own range in 1900-2100 widened by its exaggerated zone (enlarged radius plus the fade, pushWeight).
   */
  readonly reachMin: Float64Array;
  readonly reachMax: Float64Array;
}

/**
 * Heliocentric distance range of each body, AU: perihelion and aphelion from the NASA Planetary Fact Sheet
 * (nssdc.gsfc.nasa.gov/planetary/factsheet), widened by 2 % for the changes of the orbits over 1900-2100 (checked
 * against the ephemeris in mapping.test.ts); the Moon is Earth's range widened by its apogee (406 700 km).
 */
const HELIO_RANGE_AU: Readonly<Record<BodyId, readonly [number, number]>> = {
  10: [0, 0],
  199: [0.307, 0.467],
  299: [0.718, 0.728],
  399: [0.983, 1.017],
  301: [0.983 - 0.00272, 1.017 + 0.00272],
  499: [1.381, 1.666],
  599: [4.95, 5.459],
  699: [9.041, 10.124],
  799: [18.286, 20.097],
  899: [29.81, 30.33],
};
const RANGE_MARGIN = 0.02;

/** The scale table for bodies in the given order (Horizons IDs from the constants table). */
export function scaleTable(ids: readonly BodyId[]): ScaleTable {
  const n = ids.length;
  const t = {
    n,
    radiusKm: new Float64Array(n),
    factor: new Float64Array(n),
    parent: new Int32Array(n).fill(-1),
    stretch: new Float64Array(n).fill(1),
    reachMin: new Float64Array(n),
    reachMax: new Float64Array(n),
  };
  ids.forEach((id, i) => {
    t.radiusKm[i] = BODIES[id].radiusKm;
    t.factor[i] = CLASS_FACTOR[CLASS_OF[id]];
    // The zone at amount 1 is the widest: the enlarged radius plus twice its growth.
    const r = t.radiusKm[i]!;
    const zone = r * t.factor[i]! + 2 * (r * t.factor[i]! - r);
    const [q, Q] = HELIO_RANGE_AU[id];
    t.reachMin[i] = Math.max(0, q * (1 - RANGE_MARGIN) * AU_KM - zone);
    t.reachMax[i] = Q * (1 + RANGE_MARGIN) * AU_KM + zone;
  });
  ids.forEach((id, i) => {
    const m = MOON_MIN_DISTANCE_KM[id];
    if (!m) return;
    const p = ids.indexOf(m.parent);
    if (p < 0) return;
    t.parent[i] = p;
    const clear = MOON_CLEARANCE * (t.radiusKm[p]! * t.factor[p]! + t.radiusKm[i]! * t.factor[i]!);
    t.stretch[i] = Math.max(1, clear / m.km);
  });
  return t;
}

/** The scale amount for a mode: 0 true, 1 exaggerated. */
export function amountFor(mode: ScaleMode): number {
  return mode === "exaggerated" ? 1 : 0;
}

/**
 * Drawn positions and radii of the table's bodies at a scale amount (0 true, 1 exaggerated). truePos and drawnPos
 * hold 3 numbers per body (more may follow; only the first n are touched); ok[i] 0 leaves body i as it is. Moons are
 * moved along the line from their parent, which itself stays where it is. Allocates nothing.
 */
export function mapBodies(
  table: ScaleTable,
  amount: number,
  truePos: Float64Array,
  ok: Uint8Array,
  drawnPos: Float64Array,
  drawnRadius: Float64Array,
): void {
  const a = Math.min(1, Math.max(0, amount));
  for (let i = 0; i < table.n; i++) {
    drawnRadius[i] = table.radiusKm[i]! * Math.pow(table.factor[i]!, a);
    const o = 3 * i;
    const p = table.parent[i]!;
    if (p >= 0 && ok[i] && ok[p]) {
      const s = Math.pow(table.stretch[i]!, a);
      const q = 3 * p;
      for (let k = 0; k < 3; k++) drawnPos[o + k] = truePos[q + k]! + s * (truePos[o + k]! - truePos[q + k]!);
    } else {
      drawnPos[o] = truePos[o]!;
      drawnPos[o + 1] = truePos[o + 1]!;
      drawnPos[o + 2] = truePos[o + 2]!;
    }
  }
}

/**
 * A small object (spacecraft, satellite) near an enlarged body is carried along with the body and pushed out by the
 * growth of its radius, so an orbiter stays outside its body at its altitude; the push fades to nothing by twice the
 * growth beyond the enlarged surface, so the map stays continuous and keeps order along each ray. Far from every body
 * the object stays where it is (between two zones it goes with the nearer body). Writes 3 numbers at out[o]; reads the point at truePos[o]. Allocates nothing.
 */
export function mapSmall(
  table: ScaleTable,
  truePos: Float64Array,
  ok: Uint8Array,
  drawnPos: Float64Array,
  drawnRadius: Float64Array,
  o: number,
  out: Float64Array,
): void {
  const x = truePos[o]!;
  const y = truePos[o + 1]!;
  const z = truePos[o + 2]!;
  // The nearest body (true distance) whose zone holds the point: an orbiter of the Moon goes with the Moon, though
  // the Moon lies inside Earth's zone.
  let best = -1;
  let bestW = 0;
  let bestD = 0;
  for (let j = 0; j < table.n; j++) {
    if (!ok[j]) continue;
    const grow = drawnRadius[j]! - table.radiusKm[j]!;
    if (!(grow > 0)) continue;
    const q = 3 * j;
    const d = Math.hypot(x - truePos[q]!, y - truePos[q + 1]!, z - truePos[q + 2]!);
    const w = pushWeight(d, drawnRadius[j]!, grow);
    if (w > 0 && (best < 0 || d < bestD)) {
      bestW = w;
      best = j;
      bestD = d;
    }
  }
  if (best < 0) {
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
    return;
  }
  const q = 3 * best;
  const push = (drawnRadius[best]! - table.radiusKm[best]!) * bestW;
  const k = bestD > 0 ? (bestD + push) / bestD : 1;
  for (let c = 0; c < 3; c++) {
    const rel = truePos[o + c]! - truePos[q + c]!;
    // carried with the body's own move (a stretched moon), then pushed out along the same ray
    out[o + c] = truePos[q + c]! + bestW * (drawnPos[q + c]! - truePos[q + c]!) + rel * k;
  }
}

/** 1 up to the enlarged radius, falling linearly to 0 over twice the growth beyond it. */
export function pushWeight(d: number, drawnRadius: number, grow: number): number {
  if (d <= drawnRadius) return 1;
  const fade = 2 * grow;
  return d >= drawnRadius + fade ? 0 : 1 - (d - drawnRadius) / fade;
}

/** VN-SCL-003: a switch between modes takes this long (real seconds). */
export const SWITCH_S = 1;

/** The scale amount after dtS real seconds moving toward target; at once with reduced motion. */
export function stepAmount(amount: number, target: number, dtS: number, reducedMotion: boolean): number {
  if (reducedMotion) return target;
  const step = Math.max(0, dtS) / SWITCH_S;
  return amount < target ? Math.min(target, amount + step) : Math.max(target, amount - step);
}

/** Within this many radii of the body it follows, the camera keeps the body's apparent size through a switch. */
export const FRAMED_RADII = 100;

/**
 * VN-SCL-003: the camera distance once the followed body's drawn radius goes from r0 to r1. Close in, the distance
 * changes with the radius, so the body stays framed as it is; farther out (a whole-system view) it stays.
 */
export function keepFramed(distance: number, r0: number, r1: number): number {
  if (!(r0 > 0) || !(r1 > 0) || r0 === r1 || distance > FRAMED_RADII * Math.max(r0, r1)) return distance;
  return (distance * r1) / r0;
}

// Scratch for mapTrail: the bodies and one point after them.
let mtTruth = new Float64Array(0);
let mtOk = new Uint8Array(0);
let mtDrawn = new Float64Array(0);
let mtRadius = new Float64Array(0);

/**
 * D-002: drawn positions of a small object's trail. Vertex i (pts[3i..]) is mapped as mapSmall maps the object's
 * marker, against the bodies at the vertex's own time: bodyTruth holds 3 numbers per body per vertex (true scene
 * positions, from 3 n i) and bodyOk 1 per body per vertex (0 where the body was not evaluated: too far to push it, see
 * reachMin and reachMax). At amount 0 the trail is drawn where it is. Allocates only when the table first grows.
 */
export function mapTrail(
  table: ScaleTable,
  amount: number,
  bodyTruth: Float64Array,
  bodyOk: Uint8Array,
  pts: Float64Array,
  count: number,
  out: Float64Array,
): void {
  const n = table.n;
  if (!(amount > 0)) {
    out.set(pts.subarray(0, 3 * count));
    return;
  }
  if (mtTruth.length < 3 * (n + 1)) {
    mtTruth = new Float64Array(3 * (n + 1));
    mtOk = new Uint8Array(n);
    mtDrawn = new Float64Array(3 * n);
    mtRadius = new Float64Array(n);
  }
  const o = 3 * n;
  for (let i = 0; i < count; i++) {
    let any = 0;
    for (let j = 0; j < n; j++) {
      const k = bodyOk[n * i + j]!;
      mtOk[j] = k;
      any |= k;
    }
    const p = 3 * i;
    if (!any) {
      out[p] = pts[p]!;
      out[p + 1] = pts[p + 1]!;
      out[p + 2] = pts[p + 2]!;
      continue;
    }
    for (let c = 0; c < 3 * n; c++) mtTruth[c] = bodyTruth[3 * n * i + c]!;
    mtTruth[o] = pts[p]!;
    mtTruth[o + 1] = pts[p + 1]!;
    mtTruth[o + 2] = pts[p + 2]!;
    mapBodies(table, amount, mtTruth, mtOk, mtDrawn, mtRadius);
    mapSmall(table, mtTruth, mtOk, mtDrawn, mtRadius, o, mtTruth);
    out[p] = mtTruth[o]!;
    out[p + 1] = mtTruth[o + 1]!;
    out[p + 2] = mtTruth[o + 2]!;
  }
}
