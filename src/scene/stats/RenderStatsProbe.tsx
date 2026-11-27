import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import type { Material, Object3D, Texture } from "three";
import { recordFrame, renderStats, textureBytes } from "../../app/stats/stats";

// VN-PRF-001, VN-PRF-002: each frame, the last render's renderer.info (three resets it when a render starts, so
// before this frame's render it still holds the previous frame's) and the frame time go to the app's stats; the
// scene's texture memory is counted every 30 frames. For the budget spec the canvas carries data-draw-calls,
// data-triangles, data-textures and data-texture-bytes.

const isTexture = (v: unknown): v is Texture => typeof v === "object" && v !== null && "isTexture" in v;

function addTextures(m: Material, seen: Set<Texture>): void {
  for (const v of Object.values(m)) if (isTexture(v)) seen.add(v);
  const uniforms = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) if (isTexture(u.value)) seen.add(u.value);
}

function sceneTextureBytes(root: Object3D, seen: Set<Texture>): number {
  seen.clear();
  root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    if (Array.isArray(m)) for (const x of m) addTextures(x, seen);
    else if (m) addTextures(m, seen);
  });
  let bytes = 0;
  for (const t of seen) {
    const img = t.image as { width?: number; height?: number; data?: ArrayBufferView } | null;
    if (!img) continue;
    bytes += textureBytes(img.width ?? 0, img.height ?? 0, t.generateMipmaps && !img.data, img.data?.byteLength);
  }
  return bytes;
}

const put = (el: HTMLElement, key: string, v: number) => {
  const s = String(v);
  if (el.dataset[key] !== s) el.dataset[key] = s;
};

export function RenderStatsProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const seen = useMemo(() => new Set<Texture>(), []);
  useFrame((_, dt) => {
    const s = renderStats;
    const info = gl.info;
    recordFrame(s, dt);
    s.drawCalls = info.render.calls;
    s.triangles = info.render.triangles;
    s.points = info.render.points;
    s.lines = info.render.lines;
    s.geometries = info.memory.geometries;
    s.textures = info.memory.textures;
    if (s.frameCount % 30 === 1) s.textureBytes = sceneTextureBytes(scene, seen);
    const el = gl.domElement;
    put(el, "drawCalls", s.drawCalls);
    put(el, "triangles", s.triangles);
    put(el, "textures", s.textures);
    put(el, "textureBytes", s.textureBytes);
  });
  return null;
}
