// VN-TIM-002, VN-TIM-004: the simulation clock. Time is TDB seconds since J2000 (ADR-0003); the rate is simulation
// seconds per real second, negative running backwards. The frame clock advances by rate x the frame's real seconds,
// with one frame clamped so a hidden tab or a resume never jumps.

const DAY = 86400;

/** Longest real time one frame may advance the clock, seconds. */
export const MAX_FRAME_DT_S = 0.25;

export interface Rung {
  name: string;
  /** Simulation seconds per real second. */
  rate: number;
}

/** VN-TIM-002: the named rates, real time to one Julian year per second. A month is a twelfth of that year. */
export const RATE_LADDER: readonly Rung[] = [
  { name: "1 s/s", rate: 1 },
  { name: "1 min/s", rate: 60 },
  { name: "1 h/s", rate: 3600 },
  { name: "1 day/s", rate: DAY },
  { name: "1 week/s", rate: 7 * DAY },
  { name: "1 month/s", rate: (365.25 / 12) * DAY },
  { name: "1 year/s", rate: 365.25 * DAY },
];

/** The frame clock step: rate x dt, dt clamped to [0, MAX_FRAME_DT_S]; nothing while paused. */
export function advanceTime(t: number, rate: number, dtRealS: number, paused: boolean): number {
  if (paused || !(dtRealS > 0)) return t;
  return t + rate * Math.min(dtRealS, MAX_FRAME_DT_S);
}

/** Index of the rung with this speed (either direction), or -1. */
export function rateIndex(rate: number): number {
  return RATE_LADDER.findIndex((r) => r.rate === Math.abs(rate));
}

/** One rung faster (dir 1) or slower (dir -1), keeping the direction; a rate between rungs snaps to the next. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const sign = rate < 0 ? -1 : 1;
  const speed = Math.abs(rate);
  const speeds = RATE_LADDER.map((r) => r.rate);
  let next: number;
  if (dir > 0) next = speeds.find((s) => s > speed) ?? speeds[speeds.length - 1]!;
  else next = [...speeds].reverse().find((s) => s < speed) ?? speeds[0]!;
  return sign * next;
}

/** Same speed, the other way. */
export function reverse(rate: number): number {
  return -rate;
}

/** "1 day/s", "−1 day/s" backwards, or the plain number of seconds per second off the ladder. */
export function rateLabel(rate: number): string {
  const i = rateIndex(rate);
  const name = i >= 0 ? RATE_LADDER[i]!.name : `${Math.abs(rate)} s/s`;
  return rate < 0 ? `−${name}` : name;
}

/** Holds t inside [lo, hi]; atEdge when it had to (the clock then pauses). */
export function clampToRange(t: number, lo: number, hi: number): { t: number; atEdge: boolean } {
  if (t < lo) return { t: lo, atEdge: true };
  if (t > hi) return { t: hi, atEdge: true };
  return { t, atEdge: false };
}

/** VN-TIM-001: the planets' coverage, 1900-01-01 to 2100-01-01 TDB (OI-5), TDB seconds since J2000. */
export const PLANET_COVERAGE = { start: -3155716800, end: 3155716800 } as const;
