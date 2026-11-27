import { AU_KM } from "../constants";
import type { FragmentCamera } from "../share/fragment";
import { MAX_ELEVATION } from "./orbit";

// VN-CAM-005: preset views. Each centres a body and stands back far enough that the region's radius fits the
// vertical field of view, with a margin. The whole system looks straight down onto the ecliptic.

/** The scene camera's vertical field of view (SceneView). */
export const VERTICAL_FOV_DEG = 50;

export type PresetId = "system" | "inner" | "outer" | "heliopause" | "earth-moon";

export interface Preset {
  id: PresetId;
  name: string;
  target: number;
  /** Radius to take in, km. */
  radiusKm: number;
  /** rad */
  elevation: number;
}

const DEG = Math.PI / 180;
/** Room around the region, as a factor on its radius. */
const MARGIN = 1.25;

export const PRESETS: readonly Preset[] = [
  // Neptune's aphelion, 30.4 AU
  { id: "system", name: "Whole system", target: 10, radiusKm: 30.4 * AU_KM, elevation: MAX_ELEVATION },
  // Mars's aphelion, 1.67 AU
  { id: "inner", name: "Inner planets", target: 10, radiusKm: 1.67 * AU_KM, elevation: 35 * DEG },
  { id: "outer", name: "Outer planets", target: 10, radiusKm: 30.4 * AU_KM, elevation: 25 * DEG },
  // Voyager 1 is about 170 AU from the Sun in 2026, moving out 3.6 AU a year; it crossed the heliopause at 121 AU
  // (2012) and Voyager 2 at 119 AU (2018)
  { id: "heliopause", name: "Heliopause (Voyagers)", target: 10, radiusKm: 180 * AU_KM, elevation: 20 * DEG },
  // the Moon's apogee, about 406,700 km
  { id: "earth-moon", name: "Earth and Moon", target: 399, radiusKm: 406_700, elevation: 30 * DEG },
];

export function presetCamera(id: PresetId): FragmentCamera {
  const p = PRESETS.find((x) => x.id === id)!;
  const halfFov = (VERTICAL_FOV_DEG / 2) * DEG;
  return {
    target: p.target,
    distanceKm: (p.radiusKm * MARGIN) / Math.tan(halfFov),
    azimuth: 0,
    elevation: p.elevation,
  };
}
