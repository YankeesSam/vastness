import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CustomBlending, OneFactor, Points, ShaderMaterial } from "three";
import { loadAsset } from "../../app/assets/loader";
import { viewStore } from "../../app/store/view";
import { sceneFromEcliptic } from "../../core/frames";
import { colourFromBv, decodeStars, STAR_STRIDE, starAlpha, starSizePx, type StarSet } from "../../core/sky/stars";

// VN-SCN-007: the background stars (public/stars.bin, the Bright Star Catalogue to V 6.5 in the ecliptic J2000
// frame). They are at infinity, so they are drawn at a fixed distance around the camera (which sits at the render
// origin) and only the camera's rotation moves them. Drawn first (opaque pass) with no depth test or write, so
// everything else covers them. Point size and opacity per star come from src/core/sky/stars.ts; the dim setting scales the opacity.
// Loaded after the first frame (VN-PRF-004); the canvas carries data-stars with the count once they are in.

/** Distance the star sphere is drawn at, km: inside the far plane (1e12 km). */
const SKY_RADIUS_KM = 1e11;

const vertex = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
uniform float dim;
uniform float pixelRatio;
varying vec4 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelRatio;
  vColor = vec4(tint, alpha * dim);
}
`;

const fragment = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * (1.0 - smoothstep(0.5, 1.0, d));
  gl_FragColor = vec4(vColor.rgb * a, a);
  #include <colorspace_fragment>
}
`;

function starPoints(set: StarSet, pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const pos = new Float32Array(3 * set.count);
  const tint = new Float32Array(3 * set.count);
  const size = new Float32Array(set.count);
  const alpha = new Float32Array(set.count);
  const ecl = new Float64Array(3);
  const sc = new Float64Array(3);
  for (let i = 0; i < set.count; i++) {
    const o = STAR_STRIDE * i;
    ecl[0] = set.data[o]!;
    ecl[1] = set.data[o + 1]!;
    ecl[2] = set.data[o + 2]!;
    sceneFromEcliptic(ecl, sc);
    pos[3 * i] = sc[0]! * SKY_RADIUS_KM;
    pos[3 * i + 1] = sc[1]! * SKY_RADIUS_KM;
    pos[3 * i + 2] = sc[2]! * SKY_RADIUS_KM;
    const mag = set.data[o + 3]!;
    colourFromBv(set.data[o + 4]!, tint, 3 * i);
    size[i] = starSizePx(mag);
    alpha[i] = starAlpha(mag);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("tint", new BufferAttribute(tint, 3));
  g.setAttribute("size", new BufferAttribute(size, 1));
  g.setAttribute("alpha", new BufferAttribute(alpha, 1));
  const m = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { dim: { value: 1 }, pixelRatio: { value: pixelRatio } },
    // In the opaque pass (not transparent) so renderOrder -10 puts it before the bodies; added light, alpha too,
    // so the page background shows through between the stars.
    transparent: false,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
  });
  const p = new Points(g, m);
  p.name = "stars";
  p.frustumCulled = false;
  p.renderOrder = -10;
  return p;
}

export function Stars() {
  const canvas = useThree((s) => s.gl.domElement);
  const dpr = useThree((s) => s.viewport.dpr);
  const [set, setSet] = useState<StarSet | null>(null);
  const firstFrame = useFirstFrame(canvas);

  useEffect(() => {
    if (!firstFrame || set) return;
    let live = true;
    loadAsset("stars.bin")
      .then((buf) => {
        if (live) setSet(decodeStars(buf));
      })
      .catch((err: unknown) => console.error("stars:", err));
    return () => {
      live = false;
    };
  }, [firstFrame, set]);

  const points = useMemo(() => (set ? starPoints(set, dpr) : null), [set, dpr]);
  useEffect(() => {
    if (!points) return;
    canvas.dataset.stars = String(points.geometry.getAttribute("size").count);
    return () => {
      points.geometry.dispose();
      points.material.dispose();
    };
  }, [points, canvas]);

  useFrame(() => {
    if (!points) return;
    const st = viewStore.getState();
    points.visible = st.layers.stars && st.sky.stars > 0;
    points.material.uniforms.dim!.value = st.sky.stars;
  });

  return points ? <primitive object={points} /> : null;
}

/** True once the canvas has data-first-frame="1" (set by the scene's ready marker). */
function useFirstFrame(canvas: HTMLCanvasElement): boolean {
  const [ready, setReady] = useState(canvas.dataset.firstFrame === "1");
  useFrame(() => {
    if (!ready && canvas.dataset.firstFrame === "1") setReady(true);
  });
  return ready;
}
