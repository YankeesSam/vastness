import { BODIES, type Body } from "../../core/constants";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";

// VN-SCN-001: the bodies drawn as spheres and their float64 world positions (scene frame, km) for a time.

/** Sun, planets in order from the Sun, the Moon after Earth. */
export const DRAWN_BODIES: readonly Body[] = [10, 199, 299, 399, 301, 499, 599, 699, 799, 899].map(
  (id) => BODIES[id as keyof typeof BODIES],
);

const state = new Float64Array(6);
const scene = new Float64Array(3);

/**
 * World positions of DRAWN_BODIES at TDB time t into out (3 per body); ok[i] is 1 where the ephemeris gave a state.
 * Returns how many were ok. Allocates nothing.
 */
export function worldPositions(eph: Ephemeris, t: number, out: Float64Array, ok: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < DRAWN_BODIES.length; i++) {
    if (eph.state(DRAWN_BODIES[i]!.horizonsId, t, state) === "ok") {
      sceneFromEcliptic(state, scene);
      out[3 * i] = scene[0]!;
      out[3 * i + 1] = scene[1]!;
      out[3 * i + 2] = scene[2]!;
      ok[i] = 1;
      n++;
    } else ok[i] = 0;
  }
  return n;
}
