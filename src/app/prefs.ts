// VN-GEN-008: preferences live in localStorage only (theme and distance units now; quality and last view later), nothing
// identifying, no cookies. Reset removes the key. Storage that throws or holds junk gives the defaults.

export const PREFS_KEY = "vastness.prefs";

import type { DistanceUnit } from "../core/readouts";

export type Theme = "dark" | "light";

export interface Prefs {
  theme: Theme;
  /** VN-INF-004: units for distances (and speeds, in miles). */
  units: DistanceUnit;
}

export const DEFAULT_PREFS: Prefs = { theme: "dark", units: "km" };

const UNITS: readonly DistanceUnit[] = ["km", "au", "mi"];

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    const p = parsed as { theme?: unknown; units?: unknown } | null;
    const theme = p?.theme;
    const units = UNITS.find((u) => u === p?.units);
    return {
      theme: theme === "light" || theme === "dark" ? theme : DEFAULT_PREFS.theme,
      units: units ?? DEFAULT_PREFS.units,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Stores only the values that differ from the defaults; nothing stored when all are default. */
export function savePrefs(prefs: Prefs): void {
  try {
    const diff: Partial<Prefs> = {};
    if (prefs.theme !== DEFAULT_PREFS.theme) diff.theme = prefs.theme;
    if (prefs.units !== DEFAULT_PREFS.units) diff.units = prefs.units;
    if (Object.keys(diff).length === 0) localStorage.removeItem(PREFS_KEY);
    else localStorage.setItem(PREFS_KEY, JSON.stringify(diff));
  } catch {
    // Storage disabled: preferences last for the session only.
  }
}

export function resetPrefs(): Prefs {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    // Nothing stored.
  }
  return { ...DEFAULT_PREFS };
}
