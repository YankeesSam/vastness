import { CLASS_FACTOR, type ScaleMode } from "../../core/scale/mapping";
import { DRAWN_BODIES, SCALE_TABLE } from "../../scene/bodies/positions";
import type { Layer } from "../store/view";
import { useView, viewStore } from "../store/view";

// VN-SCL-001, VN-SCL-002: the scale mode switch, the on-screen note of the exaggeration factors, and the layer
// switches (markers and labels off show the emptiness at true scale).

const MOON_STRETCH = SCALE_TABLE.stretch[DRAWN_BODIES.findIndex((b) => b.horizonsId === 301)]!;

/** VN-SCL-002: the factors, as shown under the view in exaggerated scale. */
export const FACTOR_NOTE =
  `Exaggerated scale: Sun ×${CLASS_FACTOR.star}, rocky planets and Moon ×${CLASS_FACTOR.terrestrial}, ` +
  `giant planets ×${CLASS_FACTOR.giant}; the Moon's distance ×${Math.round(MOON_STRETCH)}. Distances between ` +
  `planets are true.`;

export function ScaleSelect({ className }: { className?: string | undefined }) {
  const scale = useView((s) => s.scale);
  return (
    <label className={className}>
      <span>Scale</span>
      <select
        aria-label="Scale mode"
        value={scale}
        onChange={(e) => viewStore.getState().setScale(e.target.value as ScaleMode)}
      >
        <option value="true">True scale</option>
        <option value="exaggerated">Exaggerated</option>
      </select>
    </label>
  );
}

export function ScaleNote({ className }: { className?: string | undefined }) {
  const scale = useView((s) => s.scale);
  if (scale !== "exaggerated") return null;
  return (
    <p className={className} role="note">
      {FACTOR_NOTE}
    </p>
  );
}

const LAYERS: readonly [Layer, string][] = [
  ["bodies", "Bodies"],
  ["markers", "Markers"],
  ["labels", "Labels"],
  ["orbits", "Orbits"],
  ["trails", "Trails"],
  ["callouts", "Distances to the Sun and Earth"],
];

/** VN-SCL-001, VN-SCN-003: each layer can be turned off. */
export function LayerSwitches({ className }: { className?: string | undefined }) {
  const layers = useView((s) => s.layers);
  return (
    <ul className={className}>
      {LAYERS.map(([layer, name]) => (
        <li key={layer}>
          <label>
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={(e) => viewStore.getState().setLayer(layer, e.target.checked)}
            />{" "}
            {name}
          </label>
        </li>
      ))}
    </ul>
  );
}
