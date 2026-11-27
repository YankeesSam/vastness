import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { viewStore } from "../app/store/view";
import { DRAWN_BODIES } from "./bodies/positions";
import type { ScreenFrame } from "./labels/screen";
import { isClick, pick } from "./pick";

// VN-CAT-005: a click or tap on the view selects the object under it (by marker distance), or clears the
// selection on empty space. A drag (orbit, pan) is not a click.
export function Picker({ screen }: { screen: ScreenFrame }) {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    let down: { id: number; x: number; y: number } | null = null;
    const press = (e: PointerEvent) => {
      down = e.isPrimary && e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };
    const release = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || !isClick(d.x, d.y, e.clientX, e.clientY)) return;
      const r = el.getBoundingClientRect();
      const i = pick(screen.set, screen.radiusPx, DRAWN_BODIES.length, e.clientX - r.left, e.clientY - r.top);
      viewStore.getState().select(i < 0 ? null : DRAWN_BODIES[i]!.horizonsId);
    };
    const cancel = () => {
      down = null;
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", cancel);
    return () => {
      el.removeEventListener("pointerdown", press);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [el, screen]);
  return null;
}
