import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { buildInfo } from "../build-info";
import { PREFS_KEY } from "../settings/prefs";
import { viewStore } from "../store/view";
import { parseUtc } from "../../core/time/scales";

// WebGL is not available in jsdom; the 3D view is covered by the e2e smoke test (T-005).
vi.mock("../../scene/SceneView", () => ({ SceneView: () => <div data-testid="scene" /> }));
// A desktop with WebGL 2 (the fallback view without it: src/app/fallback).
vi.mock("../device", () => ({
  getDevice: () => ({
    webgl2: true,
    info: { pixelRatio: 1, cores: 16, memoryGb: 8, maxTextureSize: 16384, coarsePointer: false },
  }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("app shell", () => {
  it("VN-UI-001: full-window view, top bar, collapsible side panel and bottom time bar", () => {
    render(<App />);
    expect(screen.getByTestId("scene")).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: /search/i })).toBeTruthy();
    expect(screen.getByRole("contentinfo", { name: /time/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /scale/i })).toBeTruthy();

    const panel = screen.getByRole("complementary", { name: /side panel/i });
    const toggle = screen.getByRole("button", { name: /side panel/i });
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(panel.hidden).toBe(false);
  });

  it("VN-UI-001: dark theme by default, light on request", () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /light theme/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("VN-GEN-008: the theme is kept in localStorage only, and Reset clears it", () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /light theme/i }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")).toEqual({ theme: "light" });
    expect(document.cookie).toBe("");
    first.unmount();

    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /reset/i }));
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("VN-GEN-008: an unreadable stored preference falls back to the defaults", () => {
    localStorage.setItem(PREFS_KEY, "{not json");
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("VN-UI-004, VN-GEN-006: About shows version, commit, data dates, licences and attributions", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /about/i }));
    const about = screen.getByRole("dialog", { name: /about vastness/i });
    const text = about.textContent ?? "";
    expect(text).toContain(buildInfo.version);
    expect(text).toContain(buildInfo.commit);
    expect(text).toMatch(/Horizons retrieval/);
    expect(text).toMatch(/Leap-second table/);
    expect(text).toMatch(/Bulletin C 72.*known until 2027-06-28/); // VN-EPH-001
    expect(text).toMatch(/Apache-2\.0/);
    expect(text).toMatch(/NASA\/JPL Horizons/);
    const hrefs = [...about.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt"]));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("VN-UI-001, VN-TIM-004: the time bar shows the simulation time in UTC as the frame clock runs", () => {
    viewStore.getState().setTime(parseUtc("2026-11-26T12:00:00Z"));
    viewStore.getState().setRate(1);
    render(<App />);
    const bar = screen.getByRole("contentinfo", { name: /time/i });
    expect(bar.textContent).toContain("2026-11-26 12:00:00 UTC");
    act(() => {
      for (let i = 0; i < 125; i++) viewStore.getState().tick(0.016); // 2 s of frames
    });
    expect(bar.textContent).toContain("2026-11-26 12:00:02 UTC");
    act(() => viewStore.getState().setPaused(true));
    expect(bar.textContent).toContain("Paused");
    act(() => viewStore.getState().setPaused(false));
  });

  it("VN-CAM-002: choosing an object in the list selects it and asks the camera to fly there", () => {
    render(<App />);
    const objects = screen.getByRole("region", { name: "Objects" });
    const group = (name: string) =>
      [...within(objects).getByRole("region", { name }).querySelectorAll("button")].map((b) => b.textContent);
    expect(group("Sun and planets")).toEqual([
      "Sun",
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]);
    expect(group("Moons")).toEqual(["Moon"]);
    expect(group("Spacecraft")).toHaveLength(18); // T-085: Cassini, Galileo, Rosetta, Pioneer 10 and 11
    expect(group("Comets")).toHaveLength(9); // T-107
    expect(group("Dwarf planets")).toEqual(["Ceres", "Pluto", "Haumea", "Makemake", "Eris"]); // T-084, from the Sun outwards
    const seq = viewStore.getState().targetSeq;
    const mars = screen.getByRole("button", { name: "Mars" });
    fireEvent.click(mars);
    expect(viewStore.getState().selection).toBe(499);
    expect(viewStore.getState().target).toBe(499);
    expect(viewStore.getState().targetSeq).toBe(seq + 1);
    expect(mars.getAttribute("aria-current")).toBe("true");
  });
  it("VN-CAM-005: the preset views place the camera", () => {
    render(<App />);
    const views = screen.getByRole("region", { name: "Views" });
    const seq = viewStore.getState().cameraSeq;
    fireEvent.click(within(views).getByRole("button", { name: "Whole system" }));
    expect(viewStore.getState().cameraSeq).toBe(seq + 1);
    expect(viewStore.getState().cameraRequest!.target).toBe(10);
    fireEvent.click(within(views).getByRole("button", { name: "Earth and Moon" }));
    expect(viewStore.getState().cameraRequest!.target).toBe(399);
    for (const name of ["Inner planets", "Outer planets", "Heliopause (Voyagers)"]) {
      expect(within(views).getByRole("button", { name })).toBeTruthy();
    }
  });

  it("VN-SCL-001, VN-SCL-002: the scale switch, the note of the factors, and layer switches", () => {
    render(<App />);
    const select = screen.getByRole("combobox", { name: "Scale mode" });
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.change(select, { target: { value: "exaggerated" } });
    expect(viewStore.getState().scale).toBe("exaggerated");
    expect(screen.getByRole("note").textContent).toMatch(/Sun ×40.*×1000.*×300.*Moon's distance ×\d+/);
    fireEvent.change(select, { target: { value: "true" } });
    expect(screen.queryByRole("note")).toBeNull();
    // VN-SCL-001: markers and labels can be turned off so the emptiness shows
    const layers = screen.getByRole("region", { name: "Layers" });
    for (const name of ["Markers", "Labels"]) {
      const box = within(layers).getByRole("checkbox", { name });
      expect((box as HTMLInputElement).checked).toBe(true);
      fireEvent.click(box);
    }
    expect(viewStore.getState().layers).toMatchObject({ markers: false, labels: false, bodies: true });
    act(() => {
      viewStore.getState().setLayer("markers", true);
      viewStore.getState().setLayer("labels", true);
    });
  });

  it("VN-SCL-007: the light pulse starts now, says how far it has gone, and stops", () => {
    render(<App />);
    const region = screen.getByRole("region", { name: "Light pulse" });
    act(() => viewStore.getState().setPaused(true));
    const t0 = viewStore.getState().t;
    fireEvent.click(within(region).getByRole("button", { name: "From the Sun" }));
    expect(viewStore.getState().pulse).toEqual({ origin: 10, t0 });
    expect(region.textContent).toContain("Light from the Sun: 0 m out");
    act(() => viewStore.getState().setTime(t0 + 500));
    expect(region.textContent).toContain("Light from the Sun: 150 million km out after 8.33 minutes.");
    fireEvent.click(within(region).getByRole("button", { name: "Stop" }));
    expect(viewStore.getState().pulse).toBeNull();
    expect(within(region).queryByRole("button", { name: "Stop" })).toBeNull();
  });
});

describe("keyboard shortcuts", () => {
  const press = (key: string, target: Element = document.body) =>
    act(() => {
      fireEvent.keyDown(target, { key });
    });

  it("VN-ACC-001: / focuses search, Space toggles play, N returns to now, F follows the selection", () => {
    render(<App />);
    press("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: /search/i }));
    (document.activeElement as HTMLElement).blur();

    const paused = viewStore.getState().paused;
    press(" ");
    expect(viewStore.getState().paused).toBe(!paused);

    act(() => viewStore.getState().setTime(0));
    press("n");
    expect(Math.abs(viewStore.getState().t)).toBeGreaterThan(1e8);

    act(() => viewStore.getState().select(499));
    const seq = viewStore.getState().targetSeq;
    press("f");
    expect(viewStore.getState().target).toBe(499);
    expect(viewStore.getState().targetSeq).toBe(seq + 1);
  });

  it("VN-ACC-001: ? opens the shortcut help, also from the menu; Escape closes it", () => {
    render(<App />);
    press("?");
    const dialog = screen.getByRole("dialog", { name: /keyboard shortcuts/i });
    expect(within(dialog).getByText("Space")).toBeTruthy();
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /keyboard shortcuts/i }));
    expect(screen.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeTruthy();
  });
});

describe("screen readers", () => {
  it("VN-ACC-002: a selection is announced in a polite live region; the view has a text alternative", async () => {
    render(<App />);
    const region = screen.getByRole("status", { name: "Announcements" });
    expect(region.getAttribute("aria-live")).toBe("polite");
    act(() => viewStore.getState().select(null));
    act(() => viewStore.getState().select(499));
    await vi.waitFor(() => expect(region.textContent).toBe("Selected Mars."), { timeout: 3000 });
    const view = screen.getByRole("img", { name: /3D view of the solar system/ });
    expect(view.getAttribute("aria-label")).toContain("Mars selected");
    act(() => viewStore.getState().setFollowing(499));
    await vi.waitFor(() => expect(region.textContent).toBe("Arrived at Mars, following it."), { timeout: 3000 });
    expect(view.getAttribute("aria-label")).toContain("following Mars");
  });
});

describe("themes and text size", () => {
  it("VN-ACC-003: high contrast and large text from the menu, kept in preferences, cleared by Reset", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    const contrast = screen.getByRole("menuitemcheckbox", { name: /high contrast/i });
    expect(contrast.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(contrast);
    expect(document.documentElement.dataset.theme).toBe("contrast");
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /large text/i }));
    expect(document.documentElement.dataset.text).toBe("large");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")).toEqual({ theme: "contrast", largeText: true });
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(screen.getByRole("menuitemcheckbox", { name: /high contrast/i }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: /reset/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.text).toBe("normal");
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
  });
});

describe("preferences across a reload", () => {
  it("VN-GEN-008, VN-UI-003: time zone and sky settings are remembered and Reset clears them", () => {
    const first = render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), { target: { value: "local" } });
    fireEvent.change(screen.getByRole("slider", { name: /star brightness/i }), { target: { value: "0.3" } });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")).toEqual({ zone: "local", sky: { stars: 0.3 } });
    first.unmount();
    act(() => viewStore.getState().setSky({ stars: 0.8 })); // a fresh page starts from the defaults

    render(<App />);
    expect((screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement).value).toBe("local");
    expect(viewStore.getState().sky.stars).toBe(0.3);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /reset/i }));
    expect((screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement).value).toBe("utc");
    expect(viewStore.getState().sky.stars).toBe(0.8);
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it("VN-PRF-003, VN-UI-003: quality is auto (the device's tier) until a tier is chosen, and the choice is kept", () => {
    render(<App />);
    const q = screen.getByRole("combobox", { name: "Quality" });
    expect(q).toHaveProperty("value", "auto");
    expect(within(q).getByRole("option", { name: "Auto (High)" })).toBeTruthy();
    expect(viewStore.getState().quality).toBe("high");
    fireEvent.change(q, { target: { value: "low" } });
    expect(viewStore.getState().quality).toBe("low");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")).toEqual({ quality: "low" });
  });
});
