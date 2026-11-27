import { beforeEach, describe, expect, it } from "vitest";
import { createViewStore, DEFAULT_SKY } from "../store/view";
import {
  bindQualityPrefs,
  bindSkyPrefs,
  createPrefsStore,
  DEFAULT_PREFS,
  loadPrefs,
  PREFS_KEY,
  resetPrefs,
  savePrefs,
} from "./prefs";

beforeEach(() => localStorage.clear());

const stored = () => JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as unknown;

describe("preferences", () => {
  it("VN-GEN-008: defaults when nothing is stored; only differences are stored, under one key", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    savePrefs({ ...DEFAULT_PREFS, zone: "local", sky: { ...DEFAULT_SKY, stars: 0.3 } });
    expect(stored()).toEqual({ zone: "local", sky: { stars: 0.3 } });
    expect(Object.keys(localStorage)).toEqual([PREFS_KEY]);
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, zone: "local", sky: { ...DEFAULT_SKY, stars: 0.3 } });
    savePrefs(DEFAULT_PREFS);
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it("VN-GEN-008: junk or out-of-range values give the defaults, field by field", () => {
    localStorage.setItem(PREFS_KEY, "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        theme: "neon",
        units: "au",
        largeText: "yes",
        zone: "mars",
        sky: { stars: 7, glow: "x", glowSize: 2 },
      }),
    );
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, units: "au", sky: { ...DEFAULT_SKY, glowSize: 2 } });
  });

  it("VN-GEN-008: Reset removes every stored preference", () => {
    savePrefs({ ...DEFAULT_PREFS, theme: "contrast", largeText: true });
    expect(resetPrefs()).toEqual(DEFAULT_PREFS);
    expect(localStorage.length).toBe(0);
  });

  it("VN-GEN-008, VN-UI-003: the prefs store saves each change and resets to the defaults", () => {
    const prefs = createPrefsStore();
    prefs.getState().update({ units: "mi" });
    expect(stored()).toEqual({ units: "mi" });
    expect(createPrefsStore().getState().prefs.units).toBe("mi"); // a new page load reads it back
    prefs.getState().reset();
    expect(prefs.getState().prefs).toEqual(DEFAULT_PREFS);
    expect(localStorage.length).toBe(0);
  });

  it("VN-GEN-008: the sky settings start from the preferences, are saved when moved, and Reset restores them", () => {
    savePrefs({ ...DEFAULT_PREFS, sky: { ...DEFAULT_SKY, glow: 1.5 } });
    const prefs = createPrefsStore();
    const view = createViewStore({ t: 0 });
    const unbind = bindSkyPrefs(view, prefs);
    expect(view.getState().sky.glow).toBe(1.5);
    view.getState().setSky({ stars: 0.2 });
    expect(stored()).toEqual({ sky: { glow: 1.5, stars: 0.2 } });
    prefs.getState().reset();
    expect(view.getState().sky).toEqual(DEFAULT_SKY);
    expect(localStorage.length).toBe(0);
    unbind();
  });

  it("VN-PRF-003, VN-UI-003: the quality setting is saved; auto takes the device's tier, a chosen tier wins", () => {
    const phone = { pixelRatio: 3, cores: 8, memoryGb: 4, maxTextureSize: 4096, coarsePointer: true };
    const prefs = createPrefsStore();
    const view = createViewStore({ t: 0 });
    const unbind = bindQualityPrefs(view, prefs, phone);
    expect(prefs.getState().prefs.quality).toBe("auto");
    expect(view.getState().quality).toBe("low");
    prefs.getState().update({ quality: "high" });
    expect(view.getState().quality).toBe("high");
    expect(stored()).toEqual({ quality: "high" });
    localStorage.setItem(PREFS_KEY, JSON.stringify({ quality: "ultra" }));
    expect(loadPrefs().quality).toBe("auto");
    prefs.getState().reset();
    expect(view.getState().quality).toBe("low");
    unbind();
  });
});
