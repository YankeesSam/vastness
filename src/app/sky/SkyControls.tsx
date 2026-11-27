import { useView, viewStore, type SkySettings } from "../store/view";

// VN-SCN-005, VN-SCN-007: the sky and Sun settings: star brightness (dimmable down to off) and the Sun's glow
// brightness and size.

const SLIDERS: readonly { key: keyof SkySettings; label: string; min: number; max: number; step: number }[] = [
  { key: "stars", label: "Star brightness", min: 0, max: 1, step: 0.05 },
  { key: "glow", label: "Sun glow brightness", min: 0, max: 2, step: 0.05 },
  { key: "glowSize", label: "Sun glow size", min: 0.25, max: 4, step: 0.25 },
];

export function SkyControls({ className }: { className?: string | undefined }) {
  const sky = useView((s) => s.sky);
  return (
    <ul className={className}>
      {SLIDERS.map((s) => (
        <li key={s.key}>
          <label>
            {s.label}{" "}
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={sky[s.key]}
              onChange={(e) => viewStore.getState().setSky({ [s.key]: Number(e.target.value) })}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}
