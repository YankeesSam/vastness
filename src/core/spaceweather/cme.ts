// T-101 (VN-EXT-005): CMEs as storms. Pure maths for the scene: how far a CME's front has travelled at a time, its
// direction in the scene, its colour class and brightness, and which CMEs are in flight. Kinematics: DONKI gives
// the time the leading edge reached 21.5 solar radii and a speed; before that the front is taken to rise linearly
// from the coronagraph occulter (2.5 Rs) at the start time; after it, constant speed (the cone model DONKI's
// analyses are made for). Drawn until it passes MAX_REACH_AU or MAX_FLIGHT_DAYS.

import { AU_KM, BODIES } from "../constants";
import { parseUtc } from "../time/scales";
import type { Cme } from "./types";

export const SUN_RADIUS_KM = BODIES[10]!.radiusKm;
export const START_RADII = 2.5;
export const T21_RADII = 21.5;
/** WSA-Enlil's domain reaches 2 AU; the shell is not drawn beyond. */
export const MAX_REACH_AU = 2;
export const MAX_FLIGHT_DAYS = 40;
const DAY = 86400;

/** "2024-05-08T05:36Z" to TDB seconds since J2000 (UTC at the edge, ADR-0003). */
export function tdbFromIso(iso: string): number {
  return parseUtc(iso.replace(/Z$/, ""));
}

export interface CmeTimes {
  start: number;
  t21: number;
}

export function cmeTimes(c: Pick<Cme, "start" | "t21">): CmeTimes {
  return { start: tdbFromIso(c.start), t21: tdbFromIso(c.t21) };
}

/** Distance (km) of the front from the Sun's centre at TDB t, or null before the start or after it is gone. */
export function frontKm(times: CmeTimes, speedKmS: number, t: number): number | null {
  if (t < times.start || t - times.start > MAX_FLIGHT_DAYS * DAY) return null;
  let r: number;
  if (t >= times.t21 || times.t21 <= times.start) r = T21_RADII * SUN_RADIUS_KM + speedKmS * (t - times.t21);
  else {
    const f = (t - times.start) / (times.t21 - times.start);
    r = (START_RADII + f * (T21_RADII - START_RADII)) * SUN_RADIUS_KM;
  }
  if (r < START_RADII * SUN_RADIUS_KM) r = START_RADII * SUN_RADIUS_KM;
  return r > MAX_REACH_AU * AU_KM ? null : r;
}

const RAD = Math.PI / 180;

/**
 * Unit direction of a Stonyhurst (HEEQ) latitude and longitude, given the Sun's north pole and the Sun-to-Earth
 * vector in the same right-handed frame (ecliptic or the scene's): x toward Earth in the solar equator, z the pole,
 * y = z x x, so positive (west) longitude points the way Earth moves. Into out[0..2]; false when degenerate.
 */
export function heeqDirection(
  latDeg: number,
  lonDeg: number,
  pole: ArrayLike<number>,
  sunToEarth: ArrayLike<number>,
  out: Float64Array,
): boolean {
  const pn = Math.hypot(pole[0]!, pole[1]!, pole[2]!);
  if (pn === 0) return false;
  const z0 = pole[0]! / pn;
  const z1 = pole[1]! / pn;
  const z2 = pole[2]! / pn;
  const dot = sunToEarth[0]! * z0 + sunToEarth[1]! * z1 + sunToEarth[2]! * z2;
  let x0 = sunToEarth[0]! - dot * z0;
  let x1 = sunToEarth[1]! - dot * z1;
  let x2 = sunToEarth[2]! - dot * z2;
  const xn = Math.hypot(x0, x1, x2);
  if (xn === 0) return false;
  x0 /= xn;
  x1 /= xn;
  x2 /= xn;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  const cl = Math.cos(latDeg * RAD);
  const a = cl * Math.cos(lonDeg * RAD);
  const b = cl * Math.sin(lonDeg * RAD);
  const c = Math.sin(latDeg * RAD);
  out[0] = a * x0 + b * y0 + c * z0;
  out[1] = a * x1 + b * y1 + c * z1;
  out[2] = a * x2 + b * y2 + c * z2;
  return true;
}

/** Angle (deg) between a CME's axis and a direction: within its half-angle the target lies inside the cone. */
export function angleBetween(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const n = Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!);
  return n === 0 ? NaN : Math.acos(Math.max(-1, Math.min(1, d / n))) / RAD;
}

/** DONKI's speed classes: colour per class, sRGB 0..1. */
export const SPEED_CLASSES: ReadonlyArray<{ type: string; name: string; min: number; rgb: [number, number, number] }> =
  [
    { type: "S", name: "S, under 500 km/s", min: 0, rgb: [0.85, 0.85, 0.9] },
    { type: "C", name: "C, 500 to 999 km/s", min: 500, rgb: [1, 0.85, 0.3] },
    { type: "O", name: "O, 1000 to 1999 km/s", min: 1000, rgb: [1, 0.55, 0.15] },
    { type: "R", name: "R, 2000 to 2999 km/s", min: 2000, rgb: [1, 0.25, 0.2] },
    { type: "ER", name: "ER, 3000 km/s and over", min: 3000, rgb: [0.8, 0.35, 1] },
  ];

/** The class for a speed (DONKI's own type when given and known, else from the speed). */
export function speedClass(speedKmS: number, type?: string) {
  const given = SPEED_CLASSES.find((c) => c.type === type);
  if (given) return given;
  let out = SPEED_CLASSES[0]!;
  for (const c of SPEED_CLASSES) if (speedKmS >= c.min) out = c;
  return out;
}

/** Mass below and above which the shell's opacity stops changing (g); typical CMEs are 1e14..1e16 g. */
export const MASS_RANGE_G: readonly [number, number] = [1e14, 1e17];
/** Opacity of a shell whose mass the catalog does not give (VN-EXT-005: the panel says it is unknown). */
export const UNKNOWN_MASS_OPACITY = 0.3;

/**
 * Shell opacity, 0..1: from the mass on a log scale (0.15 at 1e14 g, 0.8 at 1e17 g), the default when unknown,
 * thinning as the shell spreads (the same mass over a growing area, softened to r^-0.7 past 0.1 AU so a storm
 * stays visible at 1 AU), and fading out over the last half AU before MAX_REACH_AU. Kept low because shells add up:
 * at solar maximum a few dozen are in flight at once.
 */
export function shellOpacity(massG: number | null, rKm: number): number {
  const [lo, hi] = MASS_RANGE_G;
  const base =
    massG === null || !(massG > 0)
      ? UNKNOWN_MASS_OPACITY
      : 0.15 + 0.65 * Math.min(1, Math.max(0, Math.log10(massG / lo) / Math.log10(hi / lo)));
  const spread = Math.min(1, Math.pow((0.1 * AU_KM) / Math.max(rKm, 1), 0.7));
  const fade = Math.min(1, Math.max(0, (MAX_REACH_AU * AU_KM - rKm) / (0.5 * AU_KM)));
  return base * spread * fade;
}

export interface InFlight {
  index: number;
  rKm: number;
}

/**
 * Indices of the CMEs in flight at t (front between the start and MAX_REACH_AU), with their front distance. `starts`
 * are the CMEs' start times, sorted ascending (the data file's order); `t21` and `speed` per CME.
 */
export function inFlight(
  starts: Float64Array,
  t21: Float64Array,
  speed: Float64Array,
  t: number,
  out: InFlight[] = [],
): InFlight[] {
  out.length = 0;
  // the last CME that started by t
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  const earliest = t - MAX_FLIGHT_DAYS * DAY;
  for (let i = lo - 1; i >= 0 && starts[i]! >= earliest; i--) {
    const r = frontKm({ start: starts[i]!, t21: t21[i]! }, speed[i]!, t);
    if (r !== null) out.push({ index: i, rKm: r });
  }
  out.reverse();
  return out;
}
