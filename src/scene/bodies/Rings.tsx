import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { DataTexture, DoubleSide, Mesh, RingGeometry, ShaderMaterial, Vector3, Vector4 } from "three";
import { viewStore } from "../../app/store/view";
import { sceneFromEcliptic } from "../../core/frames";
import { RINGS_INNER_KM, RINGS_OUTER_KM, saturnPole } from "../../core/rings";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import type { BodyFrame } from "./Bodies";
import { DRAWN_BODIES } from "./positions";
import { ringLookup, SHADOW_GLSL } from "./shadow";

// VN-SCN-006: Saturn's rings, a flat annulus in Saturn's equator plane (src/core/rings.ts: radii, optical depths and
// albedos from the NSSDCA fact sheet, the pole from IAU WGCCRE 2015). A radial lookup holds tau and albedo; the
// shader turns them into opacity 1 - exp(-tau / mu) for the viewing angle and brightness from the albedo and the
// Sun's elevation over the rings (the Sun is the only light, VN-SCN-005). The rings scale with Saturn's drawn radius
// (VN-SCL-002). Saturn's shadow falls on them, and they shade Saturn (VN-SCN-010, src/scene/bodies/shadow.ts).

const SATURN = DRAWN_BODIES.findIndex((b) => b.horizonsId === 699);
const SUN = 0;
const SATURN_RADIUS_KM = DRAWN_BODIES[SATURN]!.radiusKm;

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const fragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec4 shadowSun;
uniform vec4 shadowOcc;
varying vec3 vWorld;
${SHADOW_GLSL}
uniform sampler2D lookup;
uniform vec2 span;
uniform vec3 normalView;
uniform float sunLight;
uniform vec3 color;
varying vec3 vLocal;
varying vec3 vView;
void main() {
  #include <logdepthbuf_fragment>
  float u = (length(vLocal.xy) - span.x) / (span.y - span.x);
  if (u < 0.0 || u > 1.0) discard;
  vec4 s = texture2D(lookup, vec2(u, 0.5));
  float tau = s.r;
  if (tau <= 0.0) discard;
  float mu = max(1e-3, abs(dot(normalize(vView), normalView)));
  float a = 1.0 - exp(-tau / mu);
  // VN-SCN-010 (D-003): Saturn's shadow on the rings
  float lit = shadowSunVisible(vWorld, shadowSun, shadowOcc);
  gl_FragColor = vec4(color * (0.4 + 1.2 * s.g) * sunLight * (0.03 + 0.97 * lit), a);
  #include <colorspace_fragment>
}
`;

export function SaturnRings({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const mesh = useMemo(() => {
    const m = new Mesh(
      new RingGeometry(RINGS_INNER_KM, RINGS_OUTER_KM, 256, 1),
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          lookup: { value: ringLookup() },
          shadowSun: { value: new Vector4(0, 0, 0, 1) },
          shadowOcc: { value: new Vector4() },
          span: { value: [RINGS_INNER_KM, RINGS_OUTER_KM] },
          normalView: { value: new Vector3(0, 0, 1) },
          sunLight: { value: 1 },
          color: { value: [0.83, 0.76, 0.62] },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    m.name = "saturn-rings";
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material.uniforms.lookup!.value as DataTexture).dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  const s = useMemo(
    () => ({
      rel: new Float64Array(3),
      pole: new Float64Array(3),
      poleScene: new Float64Array(3),
      normal: new Vector3(),
      z: new Vector3(0, 0, 1),
      sun: new Vector3(),
    }),
    [],
  );

  useFrame(({ camera }) => {
    const st = viewStore.getState();
    const on = SATURN >= 0 && st.layers.bodies && frame.ok[SATURN] === 1;
    mesh.visible = on;
    if (!on) return;
    toCamera(frame.world, rig.cam, s.rel, 3 * SATURN);
    mesh.position.set(s.rel[0]!, s.rel[1]!, s.rel[2]!);
    sceneFromEcliptic(saturnPole(st.t, s.pole), s.poleScene);
    s.normal.set(s.poleScene[0]!, s.poleScene[1]!, s.poleScene[2]!);
    mesh.quaternion.setFromUnitVectors(s.z, s.normal);
    mesh.scale.setScalar(frame.radius[SATURN]! / SATURN_RADIUS_KM);
    const u = mesh.material.uniforms;
    camera.updateMatrixWorld();
    (u.normalView!.value as Vector3).copy(s.normal).transformDirection(camera.matrixWorldInverse);
    // The lit side faces the Sun; light on the rings goes as the sine of the Sun's elevation over them, never quite 0
    // (forward scattering keeps them faintly visible at equinox).
    if (frame.ok[SUN]) {
      s.sun.set(
        frame.world[0]! - frame.world[3 * SATURN]!,
        frame.world[1]! - frame.world[3 * SATURN + 1]!,
        frame.world[2]! - frame.world[3 * SATURN + 2]!,
      );
      u.sunLight!.value = 0.15 + 0.85 * Math.sqrt(Math.abs(s.sun.normalize().dot(s.normal)));
      toCamera(frame.world, rig.cam, s.rel, 0);
      (u.shadowSun!.value as Vector4).set(s.rel[0]!, s.rel[1]!, s.rel[2]!, frame.radius[SUN]!);
      (u.shadowOcc!.value as Vector4).set(mesh.position.x, mesh.position.y, mesh.position.z, frame.radius[SATURN]!);
    }
  }, PRIORITY.objects);

  return <primitive object={mesh} />;
}
