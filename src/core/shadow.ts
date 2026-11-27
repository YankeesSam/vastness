import { ringAt } from "./rings.ts";

// VN-SCN-010: eclipse shadows, analytic (no shadow maps: the scene spans 1e9 in scale). The light reaching a point is
// the visible fraction of the Sun's disc, which an occluding sphere covers as one disc over another (umbra, penumbra
// and annular phases all follow from the Sun's angular size); a ring between the point and the Sun lets through
// exp(-tau / mu). The shaders (src/scene/bodies/shadow.glsl.ts) compute the same; these are the reference.

type V = ArrayLike<number>;

/**
 * Fraction of a disc of radius `rs` covered by a disc of radius `ro` whose centre is `d` away (any one unit, e.g.
 * angles in radians).
 */
export function discCovered(rs: number, ro: number, d: number): number {
  if (d >= rs + ro) return 0;
  if (d <= ro - rs) return 1;
  if (d <= rs - ro) return (ro * ro) / (rs * rs);
  const a = Math.acos(Math.min(1, Math.max(-1, (d * d + rs * rs - ro * ro) / (2 * d * rs))));
  const b = Math.acos(Math.min(1, Math.max(-1, (d * d + ro * ro - rs * rs) / (2 * d * ro))));
  const k = Math.sqrt(Math.max(0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  const lens = rs * rs * a + ro * ro * b - 0.5 * k;
  return Math.min(1, Math.max(0, lens / (Math.PI * rs * rs)));
}

/**
 * Fraction of the Sun's disc (centre `sun`, radius `sunR`) visible from point `p` past a sphere (centre `occ`,
 * radius `occR`): 1 in full light, 0 in the umbra. Positions in one frame and unit (km).
 */
export function sunVisible(p: V, sun: V, sunR: number, occ: V, occR: number): number {
  const sx = sun[0]! - p[0]!;
  const sy = sun[1]! - p[1]!;
  const sz = sun[2]! - p[2]!;
  const ox = occ[0]! - p[0]!;
  const oy = occ[1]! - p[1]!;
  const oz = occ[2]! - p[2]!;
  const ds = Math.hypot(sx, sy, sz);
  const dob = Math.hypot(ox, oy, oz);
  if (!(dob < ds)) return 1;
  if (dob <= occR) return 0;
  const as = Math.asin(Math.min(1, sunR / ds));
  const ao = Math.asin(occR / dob);
  const cos = (sx * ox + sy * oy + sz * oz) / (ds * dob);
  const theta = Math.acos(Math.min(1, Math.max(-1, cos)));
  const covered = discCovered(as, ao, theta);
  return covered >= 1 ? 0 : 1 - covered;
}

/**
 * Light let through Saturn's rings on the way from point `p` to the Sun: exp(-tau / mu) where the ray crosses the
 * ring plane (centre `centre`, unit normal `pole`) within a ring, 1 elsewhere. `scale` is the drawn ring size over
 * the true one (VN-SCL-002: the rings grow with Saturn).
 */
export function ringTransmission(p: V, sun: V, centre: V, pole: V, scale: number): number {
  let dx = sun[0]! - p[0]!;
  let dy = sun[1]! - p[1]!;
  let dz = sun[2]! - p[2]!;
  const len = Math.hypot(dx, dy, dz);
  dx /= len;
  dy /= len;
  dz /= len;
  const mu = dx * pole[0]! + dy * pole[1]! + dz * pole[2]!;
  if (Math.abs(mu) < 1e-9) return 1;
  const t = ((centre[0]! - p[0]!) * pole[0]! + (centre[1]! - p[1]!) * pole[1]! + (centre[2]! - p[2]!) * pole[2]!) / mu;
  if (!(t > 0)) return 1;
  const r = Math.hypot(p[0]! + t * dx - centre[0]!, p[1]! + t * dy - centre[1]!, p[2]! + t * dz - centre[2]!) / scale;
  const ring = ringAt(r);
  return ring ? Math.exp(-ring.tau / Math.abs(mu)) : 1;
}

/**
 * Whether any point of a body (centre `body`, radius `bodyR`) can be in the shadow of an occluder: from the body's
 * centre the occluder must be nearer than the Sun and within the sum of the two angular radii of the Sun, plus the
 * occluder's shift seen from anywhere on the body's surface. VN-PRF-002: the shaders skip occluders that fail this.
 */
export function eclipsePossible(body: V, bodyR: number, sun: V, sunR: number, occ: V, occR: number): boolean {
  const sx = sun[0]! - body[0]!;
  const sy = sun[1]! - body[1]!;
  const sz = sun[2]! - body[2]!;
  const ox = occ[0]! - body[0]!;
  const oy = occ[1]! - body[1]!;
  const oz = occ[2]! - body[2]!;
  const ds = Math.hypot(sx, sy, sz);
  const dob = Math.hypot(ox, oy, oz);
  if (!(dob - occR < ds)) return false;
  if (dob <= occR + bodyR) return true;
  const theta = Math.acos(Math.min(1, Math.max(-1, (sx * ox + sy * oy + sz * oz) / (ds * dob))));
  const reach = Math.asin(Math.min(1, sunR / ds)) + Math.asin(occR / dob) + Math.asin(Math.min(1, bodyR / dob));
  return theta < 1.01 * reach;
}
