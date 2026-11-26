import { LEAP_SECONDS } from "./leap-seconds.ts";

// VN-EPH-001, ADR-0003: the one place UTC, TAI, TT and TDB meet. Inside the core time is TDB seconds since J2000
// (JD 2451545.0 TDB); TT values here are TT seconds since J2000 (JD 2451545.0 TT). UTC exists as calendar fields
// (seconds of day may reach 86400.x inside a leap second) and as ISO strings.
//
// Before 1972 UTC used rubber seconds and steps; this module takes TAI-UTC = 10 s there, an approximation of a few
// seconds that callers must present as such (UTC_EXACT_FROM).

export const J2000_JD = 2451545.0;
export const SECONDS_PER_DAY = 86400;
export const TT_MINUS_TAI = 32.184;
/** First UTC date with an exact TAI-UTC. */
export const UTC_EXACT_FROM = "1972-01-01";

export interface UtcFields {
  year: number;
  month: number;
  day: number;
  /** Seconds since 00:00 UTC of the day, 86400 <= s < 86401 inside a leap second. */
  seconds: number;
}

/** Days from 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's days_from_civil). */
function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): [number, number, number] {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const DAY_2000 = daysFromCivil(2000, 1, 1);
const PRE_1972_TAI_MINUS_UTC = 10;

/** Leap-table switch days (days since 2000-01-01) with their TAI-UTC. */
const SWITCH_DAYS = LEAP_SECONDS.map((l) => daysFromCivil(l.year, l.month, 1) - DAY_2000);

export function daysInMonth(year: number, month: number): number {
  return daysFromCivil(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) - daysFromCivil(year, month, 1);
}

/** Julian date of a calendar date plus seconds of day (in whatever scale the caller means). */
export function calendarToJd(year: number, month: number, day: number, seconds: number): number {
  return daysFromCivil(year, month, day) + 2440587.5 + seconds / SECONDS_PER_DAY;
}

/** TAI-UTC in seconds for a UTC month (table entries start on the 1st). */
export function taiMinusUtc(year: number, month: number): number {
  let value = PRE_1972_TAI_MINUS_UTC;
  for (const l of LEAP_SECONDS) {
    if (l.year < year || (l.year === year && l.month <= month)) value = l.taiMinusUtc;
    else break;
  }
  return value;
}

/** True when the UTC day ends with a leap second (23:59:60). */
export function endsWithLeapSecond(year: number, month: number, day: number): boolean {
  if (day !== daysInMonth(year, month)) return false;
  const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1];
  return taiMinusUtc(ny, nm) > taiMinusUtc(year, month);
}

export function ttFromUtc(year: number, month: number, day: number, seconds: number): number {
  const days = daysFromCivil(year, month, day) - DAY_2000;
  return days * SECONDS_PER_DAY + seconds - 43200 + taiMinusUtc(year, month) + TT_MINUS_TAI;
}

export function utcFromTt(tt: number): UtcFields {
  // TAI count in seconds from the 2000-01-01T00:00:00 label.
  const x = tt - TT_MINUS_TAI + 43200;
  let i = -1;
  while (i + 1 < LEAP_SECONDS.length && SWITCH_DAYS[i + 1]! * SECONDS_PER_DAY + LEAP_SECONDS[i + 1]!.taiMinusUtc <= x) {
    i++;
  }
  const dat = i < 0 ? PRE_1972_TAI_MINUS_UTC : LEAP_SECONDS[i]!.taiMinusUtc;
  const u = x - dat;
  let days: number;
  if (i + 1 < LEAP_SECONDS.length && i >= 0 && u >= SWITCH_DAYS[i + 1]! * SECONDS_PER_DAY) {
    days = SWITCH_DAYS[i + 1]! - 1; // inside the inserted second
  } else {
    days = Math.floor(u / SECONDS_PER_DAY);
  }
  const [year, month, day] = civilFromDays(days + DAY_2000);
  return { year, month, day, seconds: u - days * SECONDS_PER_DAY };
}

/**
 * TDB - TT in seconds from TT seconds since J2000: USNO Circular 179 (Kaplan 2005) eq. 2.6, a truncation of
 * Fairhead and Bretagnon (1990) good to about 10 microseconds over 1600-2200. The Almanac's two-term formula is up to
 * about 40 microseconds off over 1900-2100, outside VN-EPH-001's 30.
 */
export function tdbMinusTt(tt: number): number {
  const T = tt / SECONDS_PER_DAY / 36525;
  return (
    0.001657 * Math.sin(628.3076 * T + 6.2401) +
    0.000022 * Math.sin(575.3385 * T + 4.297) +
    0.000014 * Math.sin(1256.6152 * T + 6.1969) +
    0.000005 * Math.sin(606.9777 * T + 4.0212) +
    0.000005 * Math.sin(52.9691 * T + 0.4444) +
    0.000002 * Math.sin(21.3299 * T + 5.5431) +
    0.00001 * T * Math.sin(628.3076 * T + 4.249)
  );
}

export function tdbFromTt(tt: number): number {
  return tt + tdbMinusTt(tt);
}

export function ttFromTdb(tdb: number): number {
  let tt = tdb - tdbMinusTt(tdb);
  tt = tdb - tdbMinusTt(tt);
  return tt;
}

export function tdbFromUtc(year: number, month: number, day: number, seconds: number): number {
  return tdbFromTt(ttFromUtc(year, month, day, seconds));
}

export function utcFromTdb(tdb: number): UtcFields {
  return utcFromTt(ttFromTdb(tdb));
}

/** JD(TDB) of TDB seconds since J2000. Keep seconds wherever arithmetic happens; JD resolves only ~40 us. */
export function jdTdb(tdb: number): number {
  return J2000_JD + tdb / SECONDS_PER_DAY;
}

export function tdbFromJd(jd: number): number {
  return (jd - J2000_JD) * SECONDS_PER_DAY;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?Z?)?$/;

/** ISO 8601 UTC (`YYYY-MM-DD[THH:MM[:SS[.fff]]][Z]`) to TDB seconds since J2000. Throws RangeError. */
export function parseUtc(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new RangeError(`not an ISO UTC time: "${iso}"`);
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) => Number(v ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const frac = m[7] ? Number(m[7]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59) {
    throw new RangeError(`no such UTC date: "${iso}"`);
  }
  if (second > 60 || (second === 60 && !(hour === 23 && minute === 59 && endsWithLeapSecond(year, month, day)))) {
    throw new RangeError(`no such UTC second: "${iso}"`);
  }
  return tdbFromUtc(year, month, day, hour * 3600 + minute * 60 + second + frac);
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** TDB seconds since J2000 to ISO 8601 UTC with `digits` fraction digits (0..6); the leap second shows as :60. */
export function formatUtc(tdb: number, digits = 3): string {
  const u = utcFromTdb(tdb);
  const scale = 10 ** digits;
  let n = Math.round(u.seconds * scale);
  let { year, month, day } = u;
  const dayLength = (SECONDS_PER_DAY + (endsWithLeapSecond(year, month, day) ? 1 : 0)) * scale;
  if (n >= dayLength) {
    n -= dayLength;
    [year, month, day] = civilFromDays(daysFromCivil(year, month, day) + 1);
  }
  const whole = Math.floor(n / scale);
  const fracPart = n - whole * scale;
  const [h, mi, s] =
    whole >= SECONDS_PER_DAY
      ? [23, 59, whole - 86340]
      : [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const fraction = digits > 0 ? `.${pad(fracPart, digits)}` : "";
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(mi)}:${pad(s)}${fraction}Z`;
}
