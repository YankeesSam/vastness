import { AU_KM, C_KM_S } from "./constants.ts";

// VN-INF-001, VN-INF-002, VN-INF-004: the info panel's numbers from heliocentric states (km, km/s), and how they
// are written in the user's units. Pure; readouts writes into a caller-supplied object.

/** International mile, km (exact). */
export const MILE_KM = 1.609344;
/** Shortest interval between read-out updates, ms (at most 4 per second). */
export const READOUT_INTERVAL_MS = 250;

export type DistanceUnit = "km" | "au" | "mi";

export interface Readout {
  sunKm: number;
  earthKm: number;
  /** One-way light-time from Earth, s. */
  lightTimeS: number;
  helioSpeedKmS: number;
  earthSpeedKmS: number;
}

export function createReadout(): Readout {
  return { sunKm: 0, earthKm: 0, lightTimeS: 0, helioSpeedKmS: 0, earthSpeedKmS: 0 };
}

/** From the body's and Earth's heliocentric states (x, y, z km, vx, vy, vz km/s). */
export function readouts(body: ArrayLike<number>, earth: ArrayLike<number>, out: Readout): Readout {
  out.sunKm = Math.hypot(body[0]!, body[1]!, body[2]!);
  out.earthKm = Math.hypot(body[0]! - earth[0]!, body[1]! - earth[1]!, body[2]! - earth[2]!);
  out.lightTimeS = out.earthKm / C_KM_S;
  out.helioSpeedKmS = Math.hypot(body[3]!, body[4]!, body[5]!);
  out.earthSpeedKmS = Math.hypot(body[3]! - earth[3]!, body[4]! - earth[4]!, body[5]! - earth[5]!);
  return out;
}

const grouped = (x: number, decimals: number): string =>
  x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function formatDistance(km: number, unit: DistanceUnit): string {
  if (unit === "au") return `${(km / AU_KM).toPrecision(6)} AU`;
  const v = unit === "mi" ? km / MILE_KM : km;
  const text = v === 0 ? "0" : grouped(v, Math.abs(v) < 1e4 ? 1 : 0);
  return `${text} ${unit}`;
}

/** km/s, or mi/s when distances are in miles. */
export function formatSpeed(kmS: number, unit: DistanceUnit): string {
  return unit === "mi" ? `${(kmS / MILE_KM).toFixed(3)} mi/s` : `${kmS.toFixed(3)} km/s`;
}

/** Whole seconds as "h m s": "22 h 01 m 02 s", "8 m 19 s", "5 s". */
export function formatLightTime(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h} h ${two(m)} m ${two(s)} s`;
  if (m > 0) return `${m} m ${two(s)} s`;
  return `${s} s`;
}
