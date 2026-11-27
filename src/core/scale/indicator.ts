import { AU_KM, C_KM_S } from "../constants";

// VN-SCL-004: the logarithmic scale indicator. It shows how wide the view is at the focus in km, AU and light-time,
// on a logarithmic bar from the camera's closest view of a spacecraft to beyond the heliopause, with marks for
// reference distances.

/** The bar's ends, km: 1 m to 10^12 km (6,700 AU). */
export const BAR_MIN_KM = 1e-3;
export const BAR_MAX_KM = 1e12;

export interface ReferenceMark {
  name: string;
  km: number;
}

/**
 * Fixed reference distances. Earth-Moon: mean distance 384 400 km (NASA Moon fact sheet). Earth-Sun: 1 AU (IAU 2012
 * B2). Sun-Neptune: Neptune's mean distance, semi-major axis 30.07 AU (NASA Neptune fact sheet). Voyager 1 is added at
 * its distance from the Sun at the current time (from the ephemeris).
 */
export const REFERENCE_MARKS: readonly ReferenceMark[] = [
  { name: "Earth–Moon", km: 384_400 },
  { name: "Earth–Sun", km: AU_KM },
  { name: "Sun–Neptune", km: 30.07 * AU_KM },
];

/** Width of the view at distance d from the camera, km: the horizontal field from the vertical one and the aspect. */
export function viewWidthKm(distanceKm: number, verticalFovRad: number, aspect: number): number {
  return 2 * distanceKm * Math.tan(verticalFovRad / 2) * aspect;
}

/** Where km falls on the bar, 0 (BAR_MIN_KM) to 1 (BAR_MAX_KM), clamped. */
export function barPosition(km: number): number {
  if (!(km > 0)) return 0;
  const p = (Math.log10(km) - Math.log10(BAR_MIN_KM)) / (Math.log10(BAR_MAX_KM) - Math.log10(BAR_MIN_KM));
  return Math.min(1, Math.max(0, p));
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** x in scientific notation with a superscript exponent, e.g. 6.7 × 10⁻⁶. */
function sci(x: number, digits: number): string {
  const [m, e] = x.toExponential(digits).split("e") as [string, string];
  const exp = String(Number(e))
    .split("")
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join("");
  return `${Number(m)} × 10${exp}`;
}

/** 3 significant digits, grouped in thousands below a million. */
function num(x: number): string {
  if (x >= 1e6) return sci(x, 2);
  return Number(x.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** A distance in km for people: m below 1 km, "million" and "billion" above. */
export function formatKm(km: number): string {
  if (km < 1) return `${num(km * 1000)} m`;
  if (km >= 1e9) return `${Number((km / 1e9).toPrecision(3))} billion km`;
  if (km >= 1e6) return `${Number((km / 1e6).toPrecision(3))} million km`;
  return `${num(km)} km`;
}

export function formatAu(km: number): string {
  const au = km / AU_KM;
  return `${au >= 1e-3 ? num(au) : sci(au, 1)} AU`;
}

const LIGHT_UNITS: readonly [number, string][] = [
  [365.25 * 86400, "year"],
  [86400, "day"],
  [3600, "hour"],
  [60, "minute"],
  [1, "second"],
];

/** The time light takes to cross the distance (Julian years for the longest). */
export function formatLightTime(km: number): string {
  const s = km / C_KM_S;
  for (const [unit, name] of LIGHT_UNITS) {
    if (s >= unit) {
      const v = Number((s / unit).toPrecision(3));
      return `${v} light-${name}${v === 1 ? "" : "s"}`;
    }
  }
  const ms = s * 1000;
  if (ms >= 1) return `${Number(ms.toPrecision(3))} light-milliseconds`;
  return `${Number((ms * 1000).toPrecision(3))} light-microseconds`;
}

export interface Indicator {
  /** Position of the view width on the bar, 0..1. */
  position: number;
  km: string;
  au: string;
  light: string;
  marks: { name: string; km: number; position: number }[];
}

/** Everything the indicator shows for a view width; Voyager 1's mark when its distance is known. */
export function indicator(widthKm: number, voyager1Km: number | null): Indicator {
  const marks = REFERENCE_MARKS.map((m) => ({ ...m, position: barPosition(m.km) }));
  if (voyager1Km !== null && voyager1Km > 0)
    marks.push({ name: "Voyager 1", km: voyager1Km, position: barPosition(voyager1Km) });
  return {
    position: barPosition(widthKm),
    km: formatKm(widthKm),
    au: formatAu(widthKm),
    light: formatLightTime(widthKm),
    marks,
  };
}
