import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Matrix4, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Texture, Vector3 } from "three";
import sun from "../../../data/sun.json";
import { loadAsset } from "../../app/assets/loader";
import { viewStore } from "../../app/store/view";
import { VERTICAL_FOV_DEG } from "../../core/camera/presets";
import { sceneFromEcliptic } from "../../core/frames";
import { bodyToEcliptic } from "../../core/rotation";
import { tdbFromIso } from "../../core/spaceweather/cme";
import { nearestIndex, outlineRadius } from "../../core/spaceweather/sunimage";
import type { BodyFrame } from "../bodies/Bodies";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// T-104 (VN-EXT-009): the real Sun. With the space weather layer on and the Sun drawn larger than MIN_PX, the
// Helioviewer SDO/AIA 171 image nearest the time shown (data/sun.json, public/sun) covers the Sun's disc on the
// camera's side, solar north along the IAU pole as it appears on screen; its corona fades out around the disc. One
// image is held at a time and only fetched when needed; the image date is on the canvas (data-sun-image) and in
// the space weather panel.

export const SUN_IMAGES = sun.images.map((i) => ({ ...i, t: tdbFromIso(i.imageDate) }));
const TIMES = Float64Array.from(SUN_IMAGES, (i) => i.t);
/** Drawn radius (px) above which the image is shown and fetched. */
export const MIN_PX = 20;
const SUN = 0;
const FOV = (VERTICAL_FOV_DEG * Math.PI) / 180;

/** The image the scene would show at t (also for the panel). */
export function sunImageAt(t: number) {
  const i = nearestIndex(TIMES, t);
  return i < 0 ? null : SUN_IMAGES[i]!;
}

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const fragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform float disk;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vUv);
  float r = length(vUv * 2.0 - 1.0);
  // opaque on the disc; outside it the corona's own brightness, fading to the image edge
  float corona = max(c.r, max(c.g, c.b)) * (1.0 - smoothstep(disk, 1.0, r));
  float a = r < disk ? 1.0 : corona;
  gl_FragColor = vec4(c.rgb, a);
  #include <colorspace_fragment>
}
`;

export function SunImage({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const size = useThree((s) => s.size);
  const canvas = useThree((s) => s.gl.domElement);
  const st = useMemo(
    () => ({
      shown: -1,
      loading: -1,
      texture: null as Texture | null,
      rel: new Float64Array(3),
      m: new Float64Array(9),
      poleEcl: new Float64Array(3),
      pole: new Float64Array(3),
      x: new Vector3(),
      y: new Vector3(),
      z: new Vector3(),
      basis: new Matrix4(),
    }),
    [],
  );
  const mesh = useMemo(() => {
    const m = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { map: { value: null }, disk: { value: 0.78 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    m.name = "sun-image";
    m.frustumCulled = false;
    m.renderOrder = 9;
    m.visible = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      st.texture?.dispose();
    },
    [mesh, st],
  );

  const load = (i: number) => {
    st.loading = i;
    loadAsset(`sun/${SUN_IMAGES[i]!.file}`)
      .then((buf) =>
        // ImageBitmaps ignore Texture.flipY: flip while decoding (three.js maps v = 0 to the bottom row).
        createImageBitmap(new Blob([buf], { type: "image/png" }), { imageOrientation: "flipY" }),
      )
      .then((bitmap) => {
        if (st.loading !== i) {
          bitmap.close();
          return;
        }
        const t = new Texture(bitmap);
        t.flipY = false;
        t.colorSpace = SRGBColorSpace;
        t.needsUpdate = true;
        st.texture?.dispose();
        st.texture = t;
        st.shown = i;
        st.loading = -1;
        mesh.material.uniforms.map!.value = t;
        mesh.material.uniforms.disk!.value = SUN_IMAGES[i]!.diskFraction;
      })
      .catch((e: unknown) => {
        console.error("sun image:", e);
        st.loading = -1;
      });
  };

  useFrame(() => {
    const v = viewStore.getState();
    let on = v.layers.spaceweather && v.layers.bodies && frame.ok[SUN] === 1 && SUN_IMAGES.length > 0;
    let d = 0;
    let r = 0;
    if (on) {
      toCamera(frame.world, rig.cam, st.rel, 3 * SUN);
      d = Math.hypot(st.rel[0]!, st.rel[1]!, st.rel[2]!);
      r = frame.radius[SUN]!;
      const px = (r / Math.max(d, r) / Math.tan(FOV / 2)) * (size.height / 2);
      on = px >= MIN_PX && d > r * 1.02;
    }
    if (on) {
      const want = nearestIndex(TIMES, v.t);
      if (want !== st.shown && want !== st.loading) load(want);
    }
    on = on && st.texture !== null;
    mesh.visible = on;
    const tag = on ? SUN_IMAGES[st.shown]!.imageDate : "";
    if (canvas.dataset.sunImage !== tag) canvas.dataset.sunImage = tag;
    if (!on) return;
    // z toward the camera, y the solar pole as seen on screen, x = y cross z
    st.z.set(-st.rel[0]! / d, -st.rel[1]! / d, -st.rel[2]! / d);
    bodyToEcliptic(10, v.t, st.m);
    st.poleEcl[0] = st.m[2]!;
    st.poleEcl[1] = st.m[5]!;
    st.poleEcl[2] = st.m[8]!;
    sceneFromEcliptic(st.poleEcl, st.pole);
    st.y.set(st.pole[0]!, st.pole[1]!, st.pole[2]!);
    st.y.addScaledVector(st.z, -st.y.dot(st.z));
    if (st.y.lengthSq() < 1e-12) st.y.set(0, 1, 0).addScaledVector(st.z, -st.z.y);
    st.y.normalize();
    st.x.crossVectors(st.y, st.z);
    st.basis.makeBasis(st.x, st.y, st.z);
    mesh.quaternion.setFromRotationMatrix(st.basis);
    mesh.position.set(st.rel[0]! + st.z.x * r, st.rel[1]! + st.z.y * r, st.rel[2]! + st.z.z * r);
    mesh.scale.setScalar(outlineRadius(r * 1.001, d) / mesh.material.uniforms.disk!.value);
  }, PRIORITY.objects);

  return <primitive object={mesh} />;
}
