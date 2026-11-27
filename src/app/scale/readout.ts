// VN-SCL-004, VN-SCL-005: what the scene measures each frame for the DOM overlays (the scale bar). Written by the
// scene in its frame loop, read by the overlays in theirs; a plain object so nothing re-renders per frame.

export interface ViewReadout {
  /** Width of the view at the focus, km. */
  widthKm: number;
  /** Voyager 1's true distance from the Sun, km, or null when it is not placed. */
  voyager1Km: number | null;
}

export const viewReadout: ViewReadout = { widthKm: 0, voyager1Km: null };
