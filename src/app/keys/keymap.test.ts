import { describe, expect, it } from "vitest";
import { appKeyAction, SHORTCUTS, type KeyInput } from "./keymap";

const k = (key: string, more: Partial<KeyInput> = {}): KeyInput => ({
  key,
  mod: false,
  typing: false,
  onButton: false,
  ...more,
});

describe("keyboard map", () => {
  it("VN-ACC-001: / search, Space play/pause, N now, F follow, ? help", () => {
    expect(appKeyAction(k("/"))).toBe("search");
    expect(appKeyAction(k(" "))).toBe("togglePlay");
    expect(appKeyAction(k("n"))).toBe("now");
    expect(appKeyAction(k("N"))).toBe("now");
    expect(appKeyAction(k("f"))).toBe("follow");
    expect(appKeyAction(k("?"))).toBe("help");
    expect(appKeyAction(k("x"))).toBeNull();
  });

  it("VN-ACC-001: no shortcut while typing, with a modifier, or Space on a focused button", () => {
    expect(appKeyAction(k("n", { typing: true }))).toBeNull();
    expect(appKeyAction(k("/", { typing: true }))).toBeNull();
    expect(appKeyAction(k("f", { mod: true }))).toBeNull();
    expect(appKeyAction(k(" ", { onButton: true }))).toBeNull();
    expect(appKeyAction(k("n", { onButton: true }))).toBe("now");
  });

  it("VN-ACC-001: the help dialog lists every required shortcut", () => {
    const keys = SHORTCUTS.flatMap((s) => s.keys);
    for (const key of ["Tab", "←", "→", "↑", "↓", "+", "−", "/", "Space", "N", "F", "Esc", "?"])
      expect(keys).toContain(key);
  });
});
