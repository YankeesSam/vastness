import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, CustomBlending, Mesh, OneFactor, PlaneGeometry, ShaderMaterial } from "three";
import { viewStore } from "../../app/store/view";
import { VERTICAL_FOV_DEG } from "../../core/camera/presets";
import { glowRadiusKm } from "../../core/sky/glow";
import type { BodyFrame } from "../bodies/Bodies";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// VN-SCN-005: the Sun's glow, a camera-facing disc at the Sun drawn additively after the bodies (planets in front hide
// it through the logarithmic depth test; the Sun's own sphere hides the part behind it). Its size and brightness come
// from the sky settings; the radius and profile from src/core/sky/glow.ts (the profile below is glowProfile).

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const fragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float brightness;
uniform vec3 color;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  float x = min(1.0, length(vUv));
  float edge = (1.0 - x) * (1.0 - x);
  float i = brightness * edge * (0.35 * exp(-6.0 * x) + 0.65 * (1.0 - x));
  gl_FragColor = vec4(color * min(i, 1.0), min(i, 1.0));
  #include <colorspace_fragment>
}
`;

const FOV_RAD = (VERTICAL_FOV_DEG * Math.PI) / 180;
/** The Sun's index in the frame (DRAWN_BODIES starts with the Sun). */
const SUN = 0;

export function SunGlow({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mesh = useMemo(() => {
    const m = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { brightness: { value: 1 }, color: { value: new Color(1, 0.93, 0.78) } },
        transparent: true,
        depthWrite: false,
        // added light, alpha too, so the page background shows through where the glow fades
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
      }),
    );
    m.name = "sun-glow";
    m.frustumCulled = false;
    m.renderOrder = 10;
    m.visible = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  const rel = useMemo(() => new Float64Array(3), []);

  useFrame(() => {
    const st = viewStore.getState();
    const on = st.layers.bodies && frame.ok[SUN] === 1 && st.sky.glow > 0;
    mesh.visible = on;
    if (!on) return;
    toCamera(frame.world, rig.cam, rel, 3 * SUN);
    const d = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
    mesh.position.set(rel[0]!, rel[1]!, rel[2]!);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.setScalar(glowRadiusKm(frame.radius[SUN]!, d, FOV_RAD, size.height, st.sky.glowSize));
    mesh.material.uniforms.brightness!.value = st.sky.glow;
  }, PRIORITY.objects);

  return <primitive object={mesh} />;
}
