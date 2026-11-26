import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { buildInfo } from "../build-info";
import { PREFS_KEY } from "../prefs";

// WebGL is not available in jsdom; the 3D view is covered by the e2e smoke test (T-005).
vi.mock("../../scene/SceneView", () => ({ SceneView: () => <div data-testid="scene" /> }));

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

  it("VN-UI-001: the time bar shows the time in UTC and ticks", () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 26, 12, 0, 0) });
    try {
      render(<App />);
      const bar = screen.getByRole("contentinfo", { name: /time/i });
      expect(bar.textContent).toContain("2026-11-26 12:00:00 UTC");
      act(() => vi.advanceTimersByTime(2000));
      expect(bar.textContent).toContain("2026-11-26 12:00:02 UTC");
    } finally {
      vi.useRealTimers();
    }
  });
});
