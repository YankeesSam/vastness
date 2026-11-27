import { describe, expect, it } from "vitest";
import { parseUtc } from "../core/time/scales";
import { createViewStore } from "./store/view";
import { applyTestParams, parseTestParams } from "./testparams";

describe("test params (F5)", () => {
  it("VN-SCN-004: t, cam, still and layers parse from the query string", () => {
    const p = parseTestParams("?t=2026-01-01T00:00:00Z&cam=399,1.2e6,30,25&still=1&layers=bodies,orbits");
    expect(p.t).toBe(parseUtc("2026-01-01T00:00:00Z"));
    expect(p.cam).toEqual({
      target: 399,
      distanceKm: 1.2e6,
      azimuth: (30 * Math.PI) / 180,
      elevation: (25 * Math.PI) / 180,
    });
    expect(p.still).toBe(true);
    expect(p.layers).toEqual({ bodies: true, orbits: true, markers: false, labels: false, trails: false });
  });

  it("no params, or junk, change nothing", () => {
    expect(parseTestParams("")).toEqual({});
    expect(parseTestParams("?t=yesterday&cam=mars,far&layers=")).toEqual({});
    expect(parseTestParams("?cam=399,-5,0,0")).toEqual({});
    expect(parseTestParams("?cam=12345,1e6,0,0")).toEqual({}); // not a drawn body
  });

  it("VN-SCN-004: applying fixes the time, pauses for still views, aims the target and sets the layers", () => {
    const store = createViewStore({ t: 0 });
    const seq = store.getState().targetSeq;
    applyTestParams(parseTestParams("?t=2026-01-01T00:00:00Z&cam=10,6e8,0,35&still=1&layers=bodies"), store);
    const s = store.getState();
    expect(s.t).toBe(parseUtc("2026-01-01T00:00:00Z"));
    expect(s.paused).toBe(true);
    expect(s.target).toBe(10);
    expect(s.targetSeq).toBe(seq); // no fly-to: the camera starts there
    expect(s.layers).toEqual({ bodies: true, orbits: false, markers: false, labels: false, trails: false });
    s.tick(1);
    expect(store.getState().t).toBe(parseUtc("2026-01-01T00:00:00Z"));
  });
});
