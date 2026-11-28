import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { ensureSpaceWeather, spaceWeatherCache } from "../../app/assets/spaceweather";
import { CATALOG } from "../../app/catalog";
import { viewStore, useView } from "../../app/store/view";
import { VERTICAL_FOV_DEG } from "../../core/camera/presets";
import { sceneFromEcliptic } from "../../core/frames";
import { bodyToEcliptic } from "../../core/rotation";
import { heeqDirection, shellOpacity, speedClass } from "../../core/spaceweather/cme";
import { arrivalsNear, cmesInFlight, flaresLit } from "../../core/spaceweather/model";
import { parseSourceLocation } from "../../core/spaceweather/types";
import type { InFlight } from "../../core/spaceweather/cme";
import type { BodyFrame } from "../bodies/Bodies";
import { objectIndex } from "../bodies/positions";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// T-101 (VN-EXT-005): space weather in the scene. Each CME in flight is a shell: a spherical cap at its front
// distance on a faint cone from the Sun, along its DONKI direction (Stonyhurst latitude and longitude, turned into
// the scene with the IAU solar pole and the Sun-Earth line, src/core/spaceweather/cme.ts) at its half-angle,
// coloured by speed class, its opacity from the CDAW mass (a default when unknown). Flares light at their source on
// the Sun; predicted (amber) and measured (red) arrivals ring Earth and the spacecraft DONKI names. All meshes come
// from fixed pools made once; per frame only positions, scales and uniforms change. The layer is off by default
// and its data is fetched the first time it is turned on.

const MAX_SHELLS = 24;
const MAX_FLARES = 8;
const MAX_RINGS = 12;
const SUN = 0;
const EARTH = objectIndex(399);
const FOV = (VERTICAL_FOV_DEG * Math.PI) / 180;

/** DONKI place names to scene object indices (catalog names; "Earth" and the planets included). */
const PLACES = new Map(CATALOG.objects.map((o) => [o.name.toLowerCase(), objectIndex(o.id)]));

const shellVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float halfAngle;
attribute vec3 param; // u (0..1 along the cap or the flank), phi, part (0 cap, 1 flank)
varying float vU;
varying float vPart;
varying float vRim;
void main() {
  float phi = param.y;
  vec3 p;
  if (param.z < 0.5) {
    float th = param.x * halfAngle;
    p = vec3(sin(th) * cos(phi), cos(th), sin(th) * sin(phi));
  } else {
    p = param.x * vec3(sin(halfAngle) * cos(phi), cos(halfAngle), sin(halfAngle) * sin(phi));
  }
  vU = param.x;
  vPart = param.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // the cap's normal is radial; the flank's is perpendicular to its generator, near enough the radial too
  vec3 n = normalize(normalMatrix * p);
  vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const shellFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 color;
uniform float opacity;
varying float vU;
varying float vPart;
varying float vRim;
void main() {
  #include <logdepthbuf_fragment>
  // the cap brightest toward its rim (a shell seen edge-on), the flank a faint wake fading toward the Sun
  float a = vPart < 0.5 ? opacity * (0.35 + 0.65 * vU * vU) : opacity * 0.06 * vU;
  // a shell is brightest seen edge-on and faint face-on (limb brightening), so being inside a storm does not wash out the view
  a *= 0.35 + 0.65 * vRim * vRim;
  gl_FragColor = vec4(color * a, a);
  #include <colorspace_fragment>
}
`;

/** The unit shell's parameters: a cap grid and a flank grid around the +y axis. */
function shellGeometry(): BufferGeometry {
  const NU = 12;
  const NP = 48;
  const params: number[] = [];
  const index: number[] = [];
  for (let part = 0; part < 2; part++) {
    const base = params.length / 3;
    for (let i = 0; i <= NU; i++)
      for (let j = 0; j <= NP; j++) params.push(part === 0 ? i / NU : i / NU, (j / NP) * 2 * Math.PI, part);
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NP; j++) {
        const a = base + i * (NP + 1) + j;
        const b = a + NP + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
  }
  const g = new BufferGeometry();
  const p = new Float32Array(params);
  g.setAttribute("param", new BufferAttribute(p, 3));
  // three needs a position attribute for bounds; the shader builds the real one
  g.setAttribute("position", new BufferAttribute(new Float32Array(p.length), 3));
  g.setIndex(index);
  return g;
}

const glowFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 color;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  float x = length(vUv);
  float a = clamp(1.0 - x, 0.0, 1.0);
  a = a * a;
  gl_FragColor = vec4(color * a, a);
  #include <colorspace_fragment>
}
`;
const glowVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

interface Pools {
  group: Group;
  shells: Mesh<BufferGeometry, ShaderMaterial>[];
  flares: Mesh<PlaneGeometry, ShaderMaterial>[];
  rings: Mesh<RingGeometry, MeshBasicMaterial>[];
  dispose(): void;
}

function makePools(): Pools {
  const group = new Group();
  group.name = "space-weather";
  group.visible = false;
  const geometry = shellGeometry();
  const shells = Array.from({ length: MAX_SHELLS }, (_, i) => {
    const m = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: shellVertex,
        fragmentShader: shellFragment,
        uniforms: { halfAngle: { value: 0.5 }, color: { value: new Color() }, opacity: { value: 0.5 } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    m.name = `cme-${i}`;
    m.frustumCulled = false;
    m.renderOrder = 8;
    m.visible = false;
    group.add(m);
    return m;
  });
  const plane = new PlaneGeometry(2, 2);
  const flares = Array.from({ length: MAX_FLARES }, () => {
    const m = new Mesh(
      plane,
      new ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: { color: { value: new Color(1, 0.95, 0.75) } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    m.name = "flare";
    m.frustumCulled = false;
    m.renderOrder = 11;
    m.visible = false;
    group.add(m);
    return m;
  });
  const ring = new RingGeometry(0.8, 1, 48);
  const rings = Array.from({ length: MAX_RINGS }, () => {
    const m = new Mesh(
      ring,
      new MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
    );
    m.name = "arrival";
    m.frustumCulled = false;
    m.renderOrder = 12;
    m.visible = false;
    group.add(m);
    return m;
  });
  return {
    group,
    shells,
    flares,
    rings,
    dispose() {
      geometry.dispose();
      plane.dispose();
      ring.dispose();
      for (const m of [...shells, ...flares, ...rings]) m.material.dispose();
    },
  };
}

const PREDICTED = new Color(0xffb020);
const MEASURED = new Color(0xff4040);

export function Storms({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const canvas = useThree((s) => s.gl.domElement);
  const on = useView((s) => s.layers.spaceweather);
  const [, setLoaded] = useState(false);
  const pools = useMemo(makePools, []);
  useEffect(() => () => pools.dispose(), [pools]);
  useEffect(() => {
    if (!on || spaceWeatherCache.current) return;
    let live = true;
    ensureSpaceWeather()
      .then(() => live && setLoaded(true))
      .catch((e: unknown) => console.error("space weather:", e));
    return () => {
      live = false;
    };
  }, [on]);

  const s = useMemo(
    () => ({
      list: [] as InFlight[],
      m: new Float64Array(9),
      poleEcl: new Float64Array(3),
      pole: new Float64Array(3),
      earth: new Float64Array(3),
      dir: new Float64Array(3),
      rel: new Float64Array(3),
      v: new Vector3(),
      up: new Vector3(0, 1, 0),
      q: new Quaternion(),
    }),
    [],
  );

  useFrame(() => {
    const st = viewStore.getState();
    const sw = spaceWeatherCache.current;
    const visible = st.layers.spaceweather && sw !== null && frame.ok[SUN] === 1 && frame.ok[EARTH] === 1;
    pools.group.visible = visible;
    const shown = { cmes: 0, flares: 0, arrivals: 0 };
    if (visible) {
      // the HEEQ axes at this time: the IAU solar pole and the Sun-Earth line, in the scene frame
      bodyToEcliptic(10, st.t, s.m);
      s.poleEcl[0] = s.m[2]!;
      s.poleEcl[1] = s.m[5]!;
      s.poleEcl[2] = s.m[8]!;
      sceneFromEcliptic(s.poleEcl, s.pole);
      for (let k = 0; k < 3; k++) s.earth[k] = frame.truth[3 * EARTH + k]! - frame.truth[3 * SUN + k]!;
      toCamera(frame.world, rig.cam, s.rel, 3 * SUN);
      const sunX = s.rel[0]!;
      const sunY = s.rel[1]!;
      const sunZ = s.rel[2]!;
      const pxKm = (d: number) => (2 * d * Math.tan(FOV / 2)) / Math.max(1, size.height);

      cmesInFlight(sw, st.t, s.list);
      // the newest first when there are more than the pool holds
      const first = Math.max(0, s.list.length - MAX_SHELLS);
      for (let i = 0; i < MAX_SHELLS; i++) {
        const mesh = pools.shells[i]!;
        const f = s.list[first + i];
        if (!f) {
          mesh.visible = false;
          continue;
        }
        const c = sw.cmes[f.index]!;
        heeqDirection(c.lat, c.lon, s.pole, s.earth, s.dir);
        s.v.set(s.dir[0]!, s.dir[1]!, s.dir[2]!);
        s.q.setFromUnitVectors(s.up, s.v);
        mesh.position.set(sunX, sunY, sunZ);
        mesh.quaternion.copy(s.q);
        mesh.scale.setScalar(f.rKm);
        const u = mesh.material.uniforms;
        u.halfAngle!.value = Math.min(89, Math.max(2, c.halfAngle)) * (Math.PI / 180);
        const rgb = speedClass(c.speed, c.type).rgb;
        (u.color!.value as Color).setRGB(rgb[0], rgb[1], rgb[2]);
        u.opacity!.value = shellOpacity(c.cdaw?.mass ?? null, f.rKm);
        mesh.visible = true;
        shown.cmes++;
      }

      const lit = flaresLit(sw, st.t);
      const sunR = frame.radius[SUN]!;
      for (let i = 0; i < MAX_FLARES; i++) {
        const mesh = pools.flares[i]!;
        const fl = lit[i];
        const at = fl ? parseSourceLocation(fl.source) : null;
        if (!at) {
          mesh.visible = false;
          continue;
        }
        heeqDirection(at.lat, at.lon, s.pole, s.earth, s.dir);
        const x = sunX + s.dir[0]! * sunR * 1.01;
        const y = sunY + s.dir[1]! * sunR * 1.01;
        const z = sunZ + s.dir[2]! * sunR * 1.01;
        mesh.position.set(x, y, z);
        mesh.quaternion.copy(camera.quaternion);
        mesh.scale.setScalar(Math.max(0.12 * sunR, 6 * pxKm(Math.hypot(x, y, z))));
        mesh.visible = true;
        shown.flares++;
      }

      const near = arrivalsNear(sw, st.t);
      let r = 0;
      for (const a of near) {
        if (r >= MAX_RINGS) break;
        const idx = PLACES.get(a.location.toLowerCase());
        if (idx === undefined || idx < 0 || frame.ok[idx] !== 1) continue;
        const mesh = pools.rings[r++]!;
        toCamera(frame.world, rig.cam, s.rel, 3 * idx);
        const d = Math.hypot(s.rel[0]!, s.rel[1]!, s.rel[2]!);
        mesh.position.set(s.rel[0]!, s.rel[1]!, s.rel[2]!);
        mesh.quaternion.copy(camera.quaternion);
        // measured rings a little larger, so both show when they coincide
        mesh.scale.setScalar(Math.max(frame.radius[idx]! * 1.6, (a.kind === "measured" ? 16 : 12) * pxKm(d)));
        mesh.material.color.copy(a.kind === "measured" ? MEASURED : PREDICTED);
        mesh.visible = true;
        shown.arrivals++;
      }
      for (; r < MAX_RINGS; r++) pools.rings[r]!.visible = false;
    }
    // For e2e specs: what the layer draws now.
    const tag = visible ? `${shown.cmes},${shown.flares},${shown.arrivals}` : "";
    if (canvas.dataset.spaceWeather !== tag) canvas.dataset.spaceWeather = tag;
  }, PRIORITY.objects);

  return <primitive object={pools.group} />;
}
