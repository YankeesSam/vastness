// VN-GEN-008: preferences live in localStorage only, under one key: theme, text size, distance units, time zone
// display and the sky settings. Nothing identifying, no cookies. Only values that differ from the defaults are
// stored; Reset removes the key. Storage that throws or holds junk gives the defaults, field by field.
// VN-UI-003: the settings the interface offers read and write them through the prefs store.

import { createStore, type StoreApi } from "zustand/vanilla";
import { QUALITY_SETTINGS, resolveTier, type DeviceInfo, type QualitySetting } from "../../core/quality";
import type { DistanceUnit } from "../../core/readouts";
import { DEFAULT_SKY, type SkySettings, type ViewState } from "../store/view";
import type { Zone } from "../time/zone";

export const PREFS_KEY = "vastness.prefs";

/** VN-ACC-003: contrast is the high-contrast theme. */
export type Theme = "dark" | "light" | "contrast";

export interface Prefs {
  theme: Theme;
  /** VN-INF-004: units for distances (and speeds, in miles). */
  units: DistanceUnit;
  /** VN-ACC-003: text at 125%. */
  largeText: boolean;
  /** VN-TIM-001: the time bar shows UTC or local time. */
  zone: Zone;
  /** VN-SCN-005, VN-SCN-007: star brightness and the Sun's glow. */
  sky: SkySettings;
  /** VN-PRF-003: a quality tier, or auto (from the device). */
  quality: QualitySetting;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  units: "km",
  largeText: false,
  zone: "utc",
  sky: DEFAULT_SKY,
  quality: "auto",
};

const THEMES: readonly Theme[] = ["dark", "light", "contrast"];
const UNITS: readonly DistanceUnit[] = ["km", "au", "mi"];
const ZONES: readonly Zone[] = ["utc", "local"];
/** The same ranges the view store clamps to. */
const SKY_RANGES: Record<keyof SkySettings, [number, number]> = { stars: [0, 1], glow: [0, 2], glowSize: [0.25, 4] };
const SKY_KEYS = Object.keys(SKY_RANGES) as (keyof SkySettings)[];

function skyFrom(raw: unknown): SkySettings {
  const r = (raw ?? {}) as Partial<Record<keyof SkySettings, unknown>>;
  const sky = { ...DEFAULT_SKY };
  for (const k of SKY_KEYS) {
    const v = r[k];
    const [lo, hi] = SKY_RANGES[k];
    if (typeof v === "number" && v >= lo && v <= hi) sky[k] = v;
  }
  return sky;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>> | null;
    return {
      theme: THEMES.find((t) => t === p?.theme) ?? DEFAULT_PREFS.theme,
      units: UNITS.find((u) => u === p?.units) ?? DEFAULT_PREFS.units,
      largeText: p?.largeText === true,
      zone: ZONES.find((z) => z === p?.zone) ?? DEFAULT_PREFS.zone,
      sky: skyFrom(p?.sky),
      quality: QUALITY_SETTINGS.find((q) => q === p?.quality) ?? DEFAULT_PREFS.quality,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Stores only the values that differ from the defaults; nothing stored when all are default. */
export function savePrefs(prefs: Prefs): void {
  try {
    const diff: Record<string, unknown> = {};
    if (prefs.theme !== DEFAULT_PREFS.theme) diff.theme = prefs.theme;
    if (prefs.units !== DEFAULT_PREFS.units) diff.units = prefs.units;
    if (prefs.largeText !== DEFAULT_PREFS.largeText) diff.largeText = prefs.largeText;
    if (prefs.zone !== DEFAULT_PREFS.zone) diff.zone = prefs.zone;
    if (prefs.quality !== DEFAULT_PREFS.quality) diff.quality = prefs.quality;
    const sky: Partial<SkySettings> = {};
    for (const k of SKY_KEYS) if (prefs.sky[k] !== DEFAULT_SKY[k]) sky[k] = prefs.sky[k];
    if (Object.keys(sky).length > 0) diff.sky = sky;
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

export interface PrefsState {
  prefs: Prefs;
  /** Changes and saves. */
  update(patch: Partial<Prefs>): void;
  /** VN-GEN-008: the Reset command: defaults, nothing stored. */
  reset(): void;
}

/** The preferences as a store, read from localStorage when created. */
export function createPrefsStore(): StoreApi<PrefsState> {
  return createStore<PrefsState>()((set, get) => ({
    prefs: loadPrefs(),
    update: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      savePrefs(prefs);
      set({ prefs });
    },
    reset: () => set({ prefs: resetPrefs() }),
  }));
}

/**
 * Keeps the view store's sky settings (which the scene reads every frame) and the saved ones together: the view
 * starts from the saved values, a change in the view is saved, and a Reset puts the defaults back in the view.
 * Returns the unbinding function.
 */
export function bindSkyPrefs(view: StoreApi<ViewState>, prefs: StoreApi<PrefsState>): () => void {
  view.getState().setSky(prefs.getState().prefs.sky);
  const offView = view.subscribe((s, prev) => {
    if (s.sky !== prev.sky && s.sky !== prefs.getState().prefs.sky) prefs.getState().update({ sky: s.sky });
  });
  const offPrefs = prefs.subscribe((s, prev) => {
    if (s.prefs.sky !== prev.prefs.sky && s.prefs.sky !== view.getState().sky) view.getState().setSky(s.prefs.sky);
  });
  return () => {
    offView();
    offPrefs();
  };
}

/**
 * VN-PRF-003: the view's quality tier (which the scene reads) follows the saved setting: the setting's tier, or the
 * device's when it is auto. Returns the unbinding function.
 */
export function bindQualityPrefs(
  view: StoreApi<ViewState>,
  prefs: StoreApi<PrefsState>,
  device: DeviceInfo,
): () => void {
  view.getState().setQuality(resolveTier(prefs.getState().prefs.quality, device));
  return prefs.subscribe((s, prev) => {
    if (s.prefs.quality !== prev.prefs.quality) view.getState().setQuality(resolveTier(s.prefs.quality, device));
  });
}
