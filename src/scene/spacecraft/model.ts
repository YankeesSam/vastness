import { SPACECRAFT_RADIUS_KM } from "../bodies/positions";

// VN-CAT-006: within 10,000 km a spacecraft is drawn as a simple model as well as being pickable at its marker.
// The model has the spacecraft's nominal size, but never less than an icon of MODEL_ICON_RADIUS_PX, so it reads
// from across the whole range; once it is that big the marker gives way to it, as it does for a planet's disc.
// Pure: no three.js.

export const MODEL_RANGE_KM = 10_000;
/** Smallest drawn model radius, px. */
export const MODEL_ICON_RADIUS_PX = 8;

export function modelShown(distanceKm: number): boolean {
  return distanceKm <= MODEL_RANGE_KM;
}

/** Radius the spacecraft is drawn (and its marker judged) at, km, for its distance from the camera. */
export function drawnRadiusKm(distanceKm: number, fovRad: number, heightPx: number): number {
  if (!modelShown(distanceKm)) return SPACECRAFT_RADIUS_KM;
  const icon = distanceKm * Math.sin((MODEL_ICON_RADIUS_PX * fovRad) / heightPx);
  return Math.max(SPACECRAFT_RADIUS_KM, icon);
}
