// VN-CAM-006, VN-SCL-003: the user's operating-system preference for reduced motion (read each time, so a change
// applies at once). Animations that would move the view become instant cuts.
export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
