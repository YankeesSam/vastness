import { C_KM_S } from "../../core/constants";

// VN-SCL-007: the light-speed pulse. A sphere leaves its origin (the Sun or Earth) at the moment it is started and
// grows at the speed of light in simulation time: at 1 s/s it moves as light does, faster rates speed it up with
// everything else. Before its start (time run backwards) there is no pulse.

export type PulseOrigin = 10 | 399;

export interface Pulse {
  origin: PulseOrigin;
  /** TDB seconds since J2000 when it left the origin. */
  t0: number;
}

/** Radius at TDB time t, km, or null before the pulse left. */
export function pulseRadiusKm(pulse: Pulse, t: number): number | null {
  const dt = t - pulse.t0;
  return dt >= 0 ? C_KM_S * dt : null;
}

/** Ring vertices: a unit circle in the scene's ecliptic plane (scene y is ecliptic north), n points. */
export function unitRing(n: number): Float32Array {
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out[3 * i] = Math.cos(a);
    out[3 * i + 1] = 0;
    out[3 * i + 2] = -Math.sin(a);
  }
  return out;
}
