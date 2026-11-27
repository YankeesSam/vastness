import { rateIndex, RATE_LADDER } from "../../core/time/clock";
import { ttFromTdb, utcFromTt } from "../../core/time/scales";
import type { ScaleMode } from "../../core/scale/mapping";

// VN-ACC-002: what screen readers hear. Selection changes and arrivals go to a polite live region, throttled so a
// burst (arrowing through the list, a flight that ends as another starts) says at most one message per interval,
// the latest winning. The 3D canvas gets a text alternative describing the view.

export const ANNOUNCE_INTERVAL_MS = 1500;

export interface Announcer {
  say(text: string): void;
  dispose(): void;
}

/** Calls emit with the first message at once, then at most one message per ANNOUNCE_INTERVAL_MS (the latest). */
export function createAnnouncer(emit: (text: string) => void, intervalMs = ANNOUNCE_INTERVAL_MS): Announcer {
  let last = -Infinity;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (pending === null) return;
    const text = pending;
    pending = null;
    last = Date.now();
    emit(text);
  };
  return {
    say(text) {
      pending = text;
      if (timer !== null) return;
      const wait = last + intervalMs - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

export type NameOf = (id: number) => string;

export function selectionMessage(id: number | null, name: NameOf): string {
  return id === null ? "Selection cleared." : `Selected ${name(id)}.`;
}

/** A change of the followed object: an arrival (a fly-to ended, a view placed) or a release. */
export function followMessage(now: number | null, before: number | null, name: NameOf): string | null {
  if (now !== null) return `Arrived at ${name(now)}, following it.`;
  if (before !== null) return `Stopped following ${name(before)}.`;
  return null;
}

const RATE_WORDS: Record<string, string> = {
  "1 s/s": "real time",
  "1 min/s": "1 minute per second",
  "1 h/s": "1 hour per second",
  "1 day/s": "1 day per second",
  "1 week/s": "1 week per second",
  "1 month/s": "1 month per second",
  "1 year/s": "1 year per second",
};

function rateWords(rate: number): string {
  const i = rateIndex(rate);
  const speed = i >= 0 ? RATE_WORDS[RATE_LADDER[i]!.name]! : `${Math.abs(rate)} seconds per second`;
  return rate < 0 ? `${speed}, backwards` : speed;
}

/** The UTC calendar date (YYYY-MM-DD) of a TDB instant. */
export function utcDate(tdb: number): string {
  const u = utcFromTt(ttFromTdb(tdb));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(u.year).padStart(4, "0")}-${p(u.month)}-${p(u.day)}`;
}

export interface ViewSummary {
  dateUtc: string;
  following: number | null;
  selection: number | null;
  scale: ScaleMode;
  rate: number;
  paused: boolean;
}

export function describeView(v: ViewSummary, name: NameOf): string {
  const centre = v.following === null ? "not following an object" : `following ${name(v.following)}`;
  const sel = v.selection === null ? "nothing selected" : `${name(v.selection)} selected`;
  const time = v.paused ? "time paused" : `time running at ${rateWords(v.rate)}`;
  return (
    `3D view of the solar system on ${v.dateUtc} UTC, ${centre}, ${sel}, ${v.scale} scale, ${time}. ` +
    "Use the object list or search to choose an object; arrow keys orbit, plus and minus zoom, question mark lists shortcuts."
  );
}
