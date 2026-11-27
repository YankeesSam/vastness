import { tdbFromUtc, utcFromTdb } from "../../core/time/scales";

// VN-TIM-001: the picker in UTC (default) or local time. UTC is the only zone inside the app (ADR-0003); local time
// is a wall-clock offset applied here at the edge. The offset function is injectable so tests do not depend on
// the machine's zone.

export type Zone = "utc" | "local";

/** Minutes east of UTC at the UTC instant `ms` (Unix ms). */
export type OffsetFn = (ms: number) => number;

export const browserOffset: OffsetFn = (ms) => -new Date(ms).getTimezoneOffset();

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** UTC civil fields of tdb, with a leap second folded into :59 and the Unix ms of that civil time. */
function civil(tdb: number): { ms: number } {
  const u = utcFromTdb(tdb);
  const s = Math.min(Math.floor(u.seconds), 86399);
  return { ms: Date.UTC(u.year, u.month - 1, u.day) + s * 1000 };
}

/** "YYYY-MM-DDTHH:MM:SS" wall-clock fields of Unix ms shifted by `offsetMin`. */
function fields(ms: number, offsetMin: number): string {
  const d = new Date(ms + offsetMin * 60_000);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** The `datetime-local` value showing tdb in the zone, whole seconds. */
export function inputValue(tdb: number, zone: Zone, offset: OffsetFn = browserOffset): string {
  const { ms } = civil(tdb);
  return fields(ms, zone === "utc" ? 0 : offset(ms));
}

const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** TDB seconds for a `datetime-local` value read in the zone, or null when it is not a real date and time. */
export function tdbFromInput(value: string, zone: Zone, offset: OffsetFn = browserOffset): number | null {
  const m = INPUT.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) => Number(v ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d);
  naive.setUTCHours(h, mi, s, 0);
  if (naive.getUTCMonth() !== mo - 1 || naive.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  let ms = naive.getTime();
  if (zone === "local") {
    // The offset at the wall time's own instant (two passes settle across a DST change).
    const guess = ms - offset(ms) * 60_000;
    ms = ms - offset(guess) * 60_000;
  }
  const u = new Date(ms);
  return tdbFromUtc(
    u.getUTCFullYear(),
    u.getUTCMonth() + 1,
    u.getUTCDate(),
    (ms - Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())) / 1000,
  );
}

/** "UTC", or for local time "UTC−05:00", "UTC+05:30", "UTC+00:00". */
function zoneName(offsetMin: number, zone: Zone): string {
  if (zone === "utc") return "UTC";
  const a = Math.abs(offsetMin);
  return `UTC${offsetMin < 0 ? "−" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** "2026-01-01 12:00:00 UTC" or the local wall time with its offset. */
export function formatTimeLabel(tdb: number, zone: Zone, offset: OffsetFn = browserOffset): string {
  const { ms } = civil(tdb);
  const off = zone === "utc" ? 0 : offset(ms);
  const leap = zone === "utc" && utcFromTdb(tdb).seconds >= 86400;
  const text = fields(ms, off).replace("T", " ");
  return `${leap ? text.replace(/:59$/, ":60") : text} ${zoneName(off, zone)}`;
}
