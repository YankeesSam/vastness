import { describe, expect, it } from "vitest";
import { createRenderStats, FRAME_WINDOW, recordFrame, summarize, textureBytes } from "./stats";

describe("render stats", () => {
  it("VN-PRF-001: zeros before the first frame", () => {
    expect(summarize(createRenderStats())).toEqual({ fps: 0, meanMs: 0, p95Ms: 0, frames: 0 });
  });

  it("VN-PRF-001: steady 60 fps frames give 60 fps and a 16.7 ms p95", () => {
    const s = createRenderStats();
    for (let i = 0; i < 300; i++) recordFrame(s, 1 / 60);
    const r = summarize(s);
    expect(r.frames).toBe(FRAME_WINDOW);
    expect(r.fps).toBeCloseTo(60, 6);
    expect(r.p95Ms).toBeCloseTo(1000 / 60, 6);
  });

  it("VN-PRF-001: a few slow frames show in the p95 and lower the rate; old frames leave the window", () => {
    const s = createRenderStats();
    for (let i = 0; i < FRAME_WINDOW; i++) recordFrame(s, 0.1); // slow, then pushed out
    for (let i = 0; i < 110; i++) recordFrame(s, 0.01);
    for (let i = 0; i < 10; i++) recordFrame(s, 0.05);
    const r = summarize(s);
    expect(r.meanMs).toBeCloseTo((110 * 10 + 10 * 50) / 120, 6);
    expect(r.p95Ms).toBeCloseTo(50, 6);
    expect(r.fps).toBeCloseTo(120 / 1.6, 6);
  });

  it("VN-PRF-002: texture memory is RGBA8 or the data's size, a third more with mipmaps", () => {
    expect(textureBytes(1024, 512, false)).toBe(2 * 1024 * 1024);
    expect(textureBytes(256, 1, false, 256 * 4 * 4)).toBe(4096); // a float RGBA lookup
    expect(textureBytes(1024, 1024, true)).toBe(Math.round((4 * 1024 * 1024 * 4) / 3));
  });
});
