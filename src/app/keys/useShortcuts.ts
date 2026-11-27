import { useEffect, useRef } from "react";
import { appKeyAction, keyInput, type AppKeyAction } from "./keymap";

// VN-ACC-001: one window listener for the app shortcuts. Handlers are read through a ref, so they may change each
// render without re-binding. A key event already handled (defaultPrevented) is left alone.
export function useShortcuts(handlers: Record<AppKeyAction, () => void>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const a = appKeyAction(keyInput(e));
      if (!a) return;
      e.preventDefault();
      ref.current[a]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
