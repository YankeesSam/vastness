// T-086, T-100, T-102 (VN-EXT-001, VN-EXT-006, VN-EXT-007): the shape of the space weather data files the pipeline
// writes to public/spaceweather and the app reads. Times are UTC ISO strings to the minute ("2024-05-08T05:36Z"), as
// DONKI gives them; the app converts them at the edge (ADR-0003). Angles in degrees, speeds in km/s.

/** One coronal mass ejection with the DONKI analysis we keep (rule in DonkiFile.rules.analysis). */
export interface Cme {
  /** DONKI activity ID, e.g. "2024-05-08T05:36:00-CME-001". */
  id: string;
  /** First seen in a coronagraph. */
  start: string;
  /** When the leading edge reached 21.5 solar radii. */
  t21: string;
  /** Stonyhurst heliographic latitude and longitude of the direction (longitude positive west, 0 toward Earth). */
  lat: number;
  lon: number;
  halfAngle: number;
  speed: number;
  /** DONKI speed class: S (under 500 km/s), C (500-999), O (1000-1999), R (2000-2999), ER (3000 and up). */
  type: string;
  /** "LE" leading edge or "SH" shock front, as measured. */
  feature: string;
  /** Source on the disk, "S22W10", when DONKI names one. */
  source: string | null;
  activeRegion: number | null;
  /** IDs of the flares DONKI links to this CME (DonkiFile.flares). */
  flares: string[];
  /** WSA-Enlil prediction from the latest model run on the kept analysis, or null. */
  enlil: EnlilPrediction | null;
  /** Geomagnetic storms (DonkiFile.storms) and measured shock arrivals (DonkiFile.shocks) DONKI links to it. */
  storms: string[];
  shocks: string[];
  link: string;
}

export interface EnlilPrediction {
  modelCompletion: string;
  /** Predicted shock arrival at Earth, or null when the model predicts none. */
  earthArrival: string | null;
  earthGlancing: boolean;
  /** Predicted Kp range at Earth for a 90 and 180 degree clock angle, when given. */
  kp90: number | null;
  kp180: number | null;
  /** Predicted arrivals at other places (spacecraft and planets, DONKI's own names). */
  impacts: Array<{ location: string; arrival: string; glancing: boolean }>;
  link: string;
}

export interface Flare {
  id: string;
  /** Begin time (from the DONKI activity ID). */
  begin: string;
  /** GOES class ("X1.0"), or null where DONKI's flare list was not available (DonkiFile.flareNote). */
  class: string | null;
  source: string | null;
}

export interface GeoStorm {
  id: string;
  start: string;
  kpMax: number;
  /** Observed 3-hourly Kp: [time, Kp]. */
  kp: Array<[string, number]>;
  cmes: string[];
}

/** An interplanetary shock measured in situ (DONKI IPS): the arrival that happened. */
export interface Shock {
  id: string;
  location: string;
  time: string;
  cmes: string[];
}

export interface DonkiFile {
  source: string;
  credit: string;
  /** UTC date of the latest response used. */
  retrieved: string;
  span: { start: string; end: string };
  rules: { analysis: string; enlil: string };
  flareNote: string | null;
  /** CMEs whose kept analysis lacks a direction, half-angle, speed or time: listed, not drawn. */
  skipped: string[];
  cmes: Cme[];
  flares: Flare[];
  storms: GeoStorm[];
  shocks: Shock[];
}

/** "S22W10" -> latitude -22, longitude +10 (west positive), or null. */
export function parseSourceLocation(s: string | null | undefined): { lat: number; lon: number } | null {
  const m = /^([NS])(\d{1,2})([EW])(\d{1,3})$/.exec((s ?? "").trim());
  if (!m) return null;
  const lat = Number(m[2]) * (m[1] === "S" ? -1 : 1);
  const lon = Number(m[4]) * (m[3] === "E" ? -1 : 1);
  return { lat, lon };
}

/** One hour of measured solar wind at L1 (means of the good 1-minute values; null where none). */
export interface SolarWindHour {
  /** Start of the hour, "2026-11-27T22:00Z". */
  t: string;
  /** Proton density (cm^-3), bulk speed (km/s), IMF Bz (GSM) and total field Bt (nT). */
  density: number | null;
  speed: number | null;
  bz: number | null;
  bt: number | null;
  /** Good minutes in the hour. */
  minutes: number;
  /** SWPC's name of the L1 spacecraft the values came from ("ACE", "DSCOVR", "SOLAR1"). */
  source: string;
}

export interface SolarWindFile {
  source: string;
  credit: string;
  retrieved: string;
  span: { start: string | null; end: string | null };
  kpSpan: { start: string | null; end: string | null };
  hours: SolarWindHour[];
  /** Planetary Kp, 3-hourly: [start of the interval, Kp]. */
  kp: Array<[string, number]>;
}
