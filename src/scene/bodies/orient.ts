import type { Matrix4 } from "three";
import { bodyToEcliptic } from "../../core/rotation";

// VN-SCN-009: a body mesh's orientation from the IAU rotation model (src/core/rotation.ts). three.js spheres have
// their poles on local +y and texture u = 0.5 on local +x, u growing toward local -z; equirectangular maps run from
// longitude -180 at u = 0 to +180 east at u = 1. So the mesh's local axes are body-fixed x (prime meridian) = +x,
// north pole z = +y, and 90 degrees east y = -z; the scene frame is (x, y, z)_ecliptic -> (x, z, -y) (frames.ts).

const m = new Float64Array(9);

/**
 * The mesh-local to scene rotation of body `id` at TDB time t into `out` (no translation). False, leaving `out`
 * as it was, when the body has no rotation model.
 */
export function bodyMeshMatrix(id: number, t: number, out: Matrix4): boolean {
  if (!bodyToEcliptic(id, t, m)) return false;
  // Columns of m are the body axes in ecliptic coordinates: b_x, b_y, b_z. Mesh +x = b_x, +y = b_z, +z = -b_y; each
  // taken to the scene frame (x, z, -y).
  const bx = [m[0]!, m[3]!, m[6]!];
  const by = [m[1]!, m[4]!, m[7]!];
  const bz = [m[2]!, m[5]!, m[8]!];
  out.set(
    bx[0]!, bz[0]!, -by[0]!, 0,
    bx[2]!, bz[2]!, -by[2]!, 0,
    -bx[1]!, -bz[1]!, by[1]!, 0,
    0, 0, 0, 1,
  ); // prettier-ignore
  return true;
}
