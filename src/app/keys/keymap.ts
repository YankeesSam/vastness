// VN-ACC-001: the app-level keyboard map. The camera keys (arrows orbit, + and - zoom, Page Up/Down zoom further,
// Escape releases follow) live with the camera in src/core/camera/orbit.ts and src/scene/camera/Controls.tsx; this
// adds search, play/pause, now, follow and the help dialog, and lists every shortcut for that dialog.

export type AppKeyAction = "search" | "togglePlay" | "now" | "follow" | "help";

export interface KeyInput {
  key: string;
  /** Ctrl, Meta or Alt held (browser and system shortcuts stay theirs). */
  mod: boolean;
  /** Focus is in a text field, select or text area. */
  typing: boolean;
  /** Focus is on a button, link or other control that Space activates. */
  onButton: boolean;
}

export function appKeyAction(e: KeyInput): AppKeyAction | null {
  if (e.mod || e.typing) return null;
  switch (e.key) {
    case "/":
      return "search";
    case " ":
      return e.onButton ? null : "togglePlay";
    case "n":
    case "N":
      return "now";
    case "f":
    case "F":
      return "follow";
    case "?":
      return "help";
    default:
      return null;
  }
}

export interface Shortcut {
  keys: readonly string[];
  does: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ["Tab", "Shift+Tab"], does: "Move between the top bar, side panel and time bar" },
  { keys: ["←", "→", "↑", "↓"], does: "Orbit the camera" },
  { keys: ["+", "−"], does: "Zoom in, zoom out" },
  { keys: ["Page Up", "Page Down"], does: "Zoom in or out faster" },
  { keys: ["/"], does: "Search objects" },
  { keys: ["Enter"], does: "In search: fly to the best match" },
  { keys: ["Space"], does: "Play or pause time" },
  { keys: ["N"], does: "Jump to now, at real time" },
  { keys: ["F"], does: "Fly to and follow the selected object" },
  { keys: ["Esc"], does: "Stop following; close a dialog; clear the search" },
  { keys: ["?"], does: "Show these shortcuts" },
];

/** Reads a DOM key event into a KeyInput. */
export function keyInput(e: KeyboardEvent): KeyInput {
  const t = e.target;
  const tag = t instanceof HTMLElement ? t.tagName : "";
  return {
    key: e.key,
    mod: e.ctrlKey || e.metaKey || e.altKey,
    typing: /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t instanceof HTMLElement && t.isContentEditable),
    onButton: /^(BUTTON|A|SUMMARY)$/.test(tag) || (t instanceof HTMLElement && t.getAttribute("role") === "menuitem"),
  };
}
