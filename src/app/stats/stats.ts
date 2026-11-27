// VN-PRF-001, VN-PRF-002: render statistics. The scene writes them every frame (src/scene/stats); the `?stats`
// overlay reads them a few times a second. Frame times go into a fixed ring; the summary is the mean frame rate and
// the 95th-percentile frame time over it.

/** Frames the summary covers (about two seconds at 60 fps). */
export const FRAME_WINDOW = 120;

export interface RenderStats {
  /** Real seconds per frame, a ring of FRAME_WINDOW. */
  frames: Float64Array;
  /** Frames written in all (the ring's next slot is frameCount % FRAME_WINDOW). */
  frameCount: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  /** Estimated GPU bytes of the textures in the scene (textureBytes). */
  textureBytes: number;
}

export function createRenderStats(): RenderStats {
  return {
    frames: new Float64Array(FRAME_WINDOW),
    frameCount: 0,
    drawCalls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    geometries: 0,
    textures: 0,
    textureBytes: 0,
  };
}

export function recordFrame(s: RenderStats, dtS: number): void {
  s.frames[s.frameCount % FRAME_WINDOW] = dtS;
  s.frameCount++;
}

export interface FrameSummary {
  /** Frames per second over the window (frames / their total time). */
  fps: number;
  /** Mean frame time, ms. */
  meanMs: number;
  /** 95th-percentile frame time, ms. */
  p95Ms: number;
  frames: number;
}

/** Summary of the frames in the ring; zeros before the first frame. */
export function summarize(s: RenderStats): FrameSummary {
  const n = Math.min(s.frameCount, FRAME_WINDOW);
  if (n === 0) return { fps: 0, meanMs: 0, p95Ms: 0, frames: 0 };
  const sorted = Array.from(s.frames.subarray(0, n)).sort((a, b) => a - b);
  let total = 0;
  for (const v of sorted) total += v;
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)]!;
  return { fps: total > 0 ? n / total : 0, meanMs: (1000 * total) / n, p95Ms: 1000 * p95, frames: n };
}

/**
 * Bytes a texture takes on the GPU: its data's size when it has data (a DataTexture, any texel format), else
 * RGBA8 at width x height; a third more with a mipmap chain.
 */
export function textureBytes(width: number, height: number, mipmaps: boolean, dataBytes?: number): number {
  const base = dataBytes ?? 4 * width * height;
  return mipmaps ? Math.round((base * 4) / 3) : base;
}

/** The app's one stats object. */
export const renderStats = createRenderStats();
