import { describe, expect, it } from "vitest";
import { parseUtc } from "../../core/time/scales";
import { PLANET_COVERAGE } from "../../core/time/clock";
import { advanceTime, createViewStore, MAX_FRAME_DT_S, tdbNow } from "./view";

describe("view store", () => {
  it("VN-TIM-004: simulation time is TDB seconds, set from UTC at the edge", () => {
    const t0 = parseUtc("2026-01-01T00:00:00Z");
    const store = createViewStore({ t: t0 });
    expect(store.getState().t).toBe(t0);
    expect(store.getState().paused).toBe(false);
    expect(store.getState().rate).toBe(1);
  });

  it("VN-TIM-004: the frame clock advances time by rate x real seconds", () => {
    const store = createViewStore({ t: 1000 });
    store.getState().tick(0.016);
    expect(store.getState().t).toBeCloseTo(1000.016, 9);
    store.getState().setRate(86400);
    store.getState().tick(0.2);
    expect(store.getState().t).toBeCloseTo(1000.016 + 17280, 6);
  });

  it("VN-TIM-004: pausing and resuming never jumps, even after a long hidden tab", () => {
    const store = createViewStore({ t: 5e8 });
    store.getState().tick(0.01);
    const before = store.getState().t;
    store.getState().setPaused(true);
    store.getState().tick(0.02);
    store.getState().tick(120); // the tab was hidden for two minutes
    expect(store.getState().t).toBe(before);
    store.getState().setPaused(false);
    store.getState().tick(120);
    // VN-TIM-004: one frame never moves more than the clamp, however long the gap.
    expect(store.getState().t - before).toBeCloseTo(MAX_FRAME_DT_S, 9);
  });

  it("VN-TIM-004: the step keeps float64 resolution far from J2000", () => {
    // 2200 is ~6.3e9 s from J2000; a 1 ms step must survive (float32 would lose it entirely).
    const t = 6.3e9;
    expect(advanceTime(t, 1, 0.001, false) - t).toBeCloseTo(0.001, 6);
    expect(advanceTime(t, -1, 0.001, false) - t).toBeCloseTo(-0.001, 6);
    expect(advanceTime(t, 1, -5, false)).toBe(t); // a clock that steps back is ignored
  });

  it("selection, camera target and layers", () => {
    const store = createViewStore({ t: 0 });
    const s = store.getState();
    expect(s.selection).toBeNull();
    expect(s.target).toBe(399);
    s.select(499);
    expect(store.getState().selection).toBe(499);
    s.setTarget(499);
    expect(store.getState().target).toBe(499);
    s.setTarget(499); // the same target again still counts as a request (VN-CAM-002 fly back)
    expect(store.getState().targetSeq).toBe(2);
    s.select(null);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().layers).toEqual({
      bodies: true,
      labels: true,
      markers: true,
      orbits: true,
      trails: true,
      callouts: true,
    });
    s.setLayer("orbits", false);
    expect(store.getState().layers.orbits).toBe(false);
    expect(store.getState().layers.labels).toBe(true);
    // VN-SCL-001: true scale by default
    expect(store.getState().scale).toBe("true");
    s.setScale("exaggerated");
    expect(store.getState().scale).toBe("exaggerated");
    // VN-SCL-007: a pulse starts at the current simulation time
    expect(store.getState().pulse).toBeNull();
    store.getState().setTime(500);
    s.setPulse(399);
    expect(store.getState().pulse).toEqual({ origin: 399, t0: 500 });
    s.setPulse(null);
    expect(store.getState().pulse).toBeNull();
  });

  it("setTime replaces time without touching the rate", () => {
    const store = createViewStore({ t: 0 });
    store.getState().setRate(60);
    store.getState().setTime(123.5);
    expect(store.getState().t).toBe(123.5);
    expect(store.getState().rate).toBe(60);
  });

  it("VN-TIM-002: play, pause, reverse and the rate ladder", () => {
    const store = createViewStore({ t: 0 });
    const s = store.getState();
    s.togglePlay();
    expect(store.getState().paused).toBe(true);
    s.togglePlay();
    expect(store.getState().paused).toBe(false);
    s.faster();
    expect(store.getState().rate).toBe(60);
    s.reverse();
    expect(store.getState().rate).toBe(-60);
    s.faster();
    expect(store.getState().rate).toBe(-3600);
    s.slower();
    s.slower();
    s.slower();
    expect(store.getState().rate).toBe(-1);
  });

  it("VN-TIM-003: Now jumps to the current UTC time and plays at real time", () => {
    const store = createViewStore({ t: 0 });
    store.getState().setRate(-86400);
    store.getState().setPaused(true);
    const ms = Date.UTC(2026, 10, 27, 12);
    store.getState().now(ms);
    expect(store.getState().t).toBe(tdbNow(ms));
    expect(store.getState().rate).toBe(1);
    expect(store.getState().paused).toBe(false);
  });

  it("VN-TIM-001: the clock stops at the edge of the planets' coverage", () => {
    const store = createViewStore({ t: PLANET_COVERAGE.end - 10 });
    store.getState().setRate(86400);
    store.getState().tick(0.1);
    expect(store.getState().t).toBe(PLANET_COVERAGE.end);
    expect(store.getState().paused).toBe(true);
    store.getState().setTime(PLANET_COVERAGE.start - 1e6);
    expect(store.getState().t).toBe(PLANET_COVERAGE.start);
  });
});
