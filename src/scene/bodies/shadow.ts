import { DataTexture, FloatType, LinearFilter, MeshLambertMaterial, Vector2, Vector3, Vector4 } from "three";
import { RINGS_INNER_KM, RINGS_OUTER_KM, ringAt } from "../../core/rings";

// VN-SCN-010: eclipse shadows in the shaders, the GLSL twins of src/core/shadow.ts (tested there): the visible
// fraction of the Sun's disc past up to two occluding spheres, and the light Saturn's rings let through. Positions are
// camera-relative (the floating origin, ADR-0004), in km.

export const SHADOW_GLSL = /* glsl */ `
float shadowDiscCovered(float rs, float ro, float d) {
  if (d >= rs + ro) return 0.0;
  if (d <= ro - rs) return 1.0;
  if (d <= rs - ro) return (ro * ro) / (rs * rs);
  float a = acos(clamp((d * d + rs * rs - ro * ro) / (2.0 * d * rs), -1.0, 1.0));
  float b = acos(clamp((d * d + ro * ro - rs * rs) / (2.0 * d * ro), -1.0, 1.0));
  float k = sqrt(max(0.0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return clamp((rs * rs * a + ro * ro * b - 0.5 * k) / (3.14159265 * rs * rs), 0.0, 1.0);
}
// sun.xyz centre, sun.w radius; occ the same for the occluder
float shadowSunVisible(vec3 p, vec4 sun, vec4 occ) {
  vec3 s = sun.xyz - p;
  vec3 o = occ.xyz - p;
  if (dot(s, o) <= 0.0) return 1.0;
  float ds = length(s);
  float dob = length(o);
  if (dob >= ds) return 1.0;
  if (dob <= occ.w) return 0.0;
  float as = asin(min(1.0, sun.w / ds));
  float ao = asin(occ.w / dob);
  float theta = acos(clamp(dot(s, o) / (ds * dob), -1.0, 1.0));
  return 1.0 - shadowDiscCovered(as, ao, theta);
}
// lookup: R = optical depth over span (inner, outer radius, km, true scale); scale = drawn over true size
float shadowRings(vec3 p, vec3 sun, vec3 centre, vec3 pole, float scale, sampler2D lookup, vec2 span) {
  vec3 d = normalize(sun - p);
  float mu = dot(d, pole);
  if (abs(mu) < 1e-6) return 1.0;
  float t = dot(centre - p, pole) / mu;
  if (t <= 0.0) return 1.0;
  float r = length(p + t * d - centre) / scale;
  float u = (r - span.x) / (span.y - span.x);
  if (u < 0.0 || u > 1.0) return 1.0;
  return exp(-texture2D(lookup, vec2(u, 0.5)).r / abs(mu));
}
`;

const LOOKUP = 1024;

/** Radial lookup of Saturn's rings, inner to outer edge: R = optical depth, G = albedo (0 in the gaps). */
export function ringLookup(): DataTexture {
  const data = new Float32Array(4 * LOOKUP);
  for (let i = 0; i < LOOKUP; i++) {
    const r = RINGS_INNER_KM + ((i + 0.5) / LOOKUP) * (RINGS_OUTER_KM - RINGS_INNER_KM);
    const ring = ringAt(r);
    data[4 * i] = ring?.tau ?? 0;
    data[4 * i + 1] = ring?.albedo ?? 0;
    data[4 * i + 3] = 1;
  }
  const tex = new DataTexture(data, LOOKUP, 1, undefined, FloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** The uniforms one body's shadows read, updated each frame. */
export interface ShadowUniforms {
  shadowSun: { value: Vector4 };
  shadowOcc0: { value: Vector4 };
  shadowOcc1: { value: Vector4 };
  /** 1 where the body lies behind Saturn's rings (Saturn itself). */
  shadowRingOn: { value: number };
  shadowRingCentre: { value: Vector3 };
  shadowRingPole: { value: Vector3 };
  shadowRingScale: { value: number };
  shadowRingLookup: { value: DataTexture | null };
  shadowRingSpan: { value: Vector2 };
}

export function shadowUniforms(): ShadowUniforms {
  return {
    shadowSun: { value: new Vector4(0, 0, 0, 1) },
    // w = 0: no occluder
    shadowOcc0: { value: new Vector4() },
    shadowOcc1: { value: new Vector4() },
    shadowRingOn: { value: 0 },
    shadowRingCentre: { value: new Vector3() },
    shadowRingPole: { value: new Vector3(0, 1, 0) },
    shadowRingScale: { value: 1 },
    shadowRingLookup: { value: null },
    shadowRingSpan: { value: new Vector2(RINGS_INNER_KM, RINGS_OUTER_KM) },
  };
}

/** A Lambert material whose direct light (the Sun) is dimmed by the eclipse shadows in `u`. */
export function shadowedLambert(u: ShadowUniforms, color: string): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vShadowPos;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvShadowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vShadowPos;
uniform vec4 shadowSun;
uniform vec4 shadowOcc0;
uniform vec4 shadowOcc1;
uniform float shadowRingOn;
uniform vec3 shadowRingCentre;
uniform vec3 shadowRingPole;
uniform float shadowRingScale;
uniform sampler2D shadowRingLookup;
uniform vec2 shadowRingSpan;
${SHADOW_GLSL}`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
float shadowLight = 1.0;
if (shadowOcc0.w > 0.0) shadowLight *= shadowSunVisible(vShadowPos, shadowSun, shadowOcc0);
if (shadowOcc1.w > 0.0) shadowLight *= shadowSunVisible(vShadowPos, shadowSun, shadowOcc1);
if (shadowRingOn > 0.5) shadowLight *= shadowRings(vShadowPos, shadowSun.xyz, shadowRingCentre, shadowRingPole, shadowRingScale, shadowRingLookup, shadowRingSpan);
reflectedLight.directDiffuse *= shadowLight;`,
      );
  };
  return m;
}
