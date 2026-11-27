import { DRAWN_BODIES } from "../bodies/positions";
import type { ScreenFrame } from "./screen";

// VN-SCN-003, VN-ACC-002: labels are DOM text (crisp, readable by screen readers) over the canvas. The marker
// layout moves and shows them each frame; they start visible off screen so their size can be measured once.
export function Labels({ screen }: { screen: ScreenFrame }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} data-testid="labels">
      {DRAWN_BODIES.map((b, i) => (
        <span
          key={b.horizonsId}
          ref={(el) => {
            screen.spans[i] = el;
          }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: "translate(-9999px, -9999px)",
            font: "12px/1.2 system-ui, sans-serif",
            color: "var(--fg, #e8e8e8)",
            textShadow: "0 0 3px #000, 0 0 2px #000",
            whiteSpace: "nowrap",
            willChange: "transform",
          }}
        >
          {b.name}
        </span>
      ))}
    </div>
  );
}
