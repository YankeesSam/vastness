import { describe, expect, it } from "vitest";
import { CATALOG } from "../../app/catalog";
import { parseUtc } from "../../core/time/scales";
import { SCENE_OBJECTS, DRAWN_BODIES, SPACECRAFT_RADIUS_KM } from "../bodies/positions";
import { coverageState, reasonText } from "./coverage";

const cov = { start: parseUtc("2021-12-25T13:00:00"), end: parseUtc("2031-11-16T00:00:00") };
const launch = parseUtc("2021-12-25T12:20:00");
const operating = { status: { state: "operating" as const, as_of: "2026-11-26" } };
const ended = { status: { state: "ended" as const, as_of: "2026-11-26" } };

describe("spacecraft coverage", () => {
  it("VN-EPH-007: drawn inside the coverage, edges included", () => {
    expect(coverageState(cov.start, cov, operating, launch)).toEqual({ drawn: true, reason: null });
    expect(coverageState(cov.end, cov, operating, launch)).toEqual({ drawn: true, reason: null });
    expect(coverageState(parseUtc("2026-01-01"), cov, operating, launch).drawn).toBe(true);
  });

  it("VN-EPH-007: before launch, before the first epoch, mission ended, beyond predictions", () => {
    expect(coverageState(parseUtc("2020-01-01"), cov, operating, launch).reason).toBe("before-launch");
    expect(coverageState(parseUtc("2021-12-25T12:40:00"), cov, operating, launch).reason).toBe("no-data-yet");
    expect(coverageState(parseUtc("2040-01-01"), cov, operating, launch).reason).toBe("beyond-predictions");
    expect(coverageState(parseUtc("2040-01-01"), cov, ended, launch).reason).toBe("mission-ended");
    expect(coverageState(0, null, operating, launch)).toEqual({ drawn: false, reason: "no-trajectory" });
    for (const r of ["before-launch", "no-data-yet", "mission-ended", "beyond-predictions"] as const) {
      expect(coverageState(r === "before-launch" ? 0 : cov.end + 1, cov, operating, launch).drawn).toBe(false);
    }
  });

  it("VN-EPH-007: the panel sentence names the dates", () => {
    expect(reasonText("before-launch", "JWST", cov, "2021-12-25")).toBe(
      "JWST has not launched yet at this time (launch 2021-12-25).",
    );
    expect(reasonText("beyond-predictions", "JWST", cov)).toMatch(/end on 2031-11-16/);
    expect(reasonText("mission-ended", "CAPSTONE", cov)).toMatch(/after 2031-11-16/);
    expect(reasonText("no-data-yet", "JWST", cov)).toMatch(/before 2021-12-25/);
  });

  it("VN-CAT-007: a satellite outside its 14 days says its elements are too old, after launch", () => {
    const cov = { start: 10 * 86400, end: 38 * 86400 };
    const sat = { type: "satellite" as const, status: { state: "operating" as const, as_of: "2026-11-27" } };
    expect(coverageState(40 * 86400, cov, sat, 0)).toEqual({ drawn: false, reason: "elements-stale" });
    expect(coverageState(5 * 86400, cov, sat, 0)).toEqual({ drawn: false, reason: "elements-stale" });
    expect(coverageState(-5, cov, sat, 0)).toEqual({ drawn: false, reason: "before-launch" });
    expect(reasonText("elements-stale", "ISS", cov)).toMatch(
      /more than 14 days from ISS's orbital elements \(epoch 2000-01-25\)/,
    );
  });

  it("VN-CAT-007: the catalog's satellites follow the spacecraft as scene objects", () => {
    const sats = SCENE_OBJECTS.filter((o) => o.kind === "satellite");
    expect(sats.map((o) => o.id).sort()).toEqual(
      CATALOG.objects
        .filter((o) => o.type === "satellite")
        .map((o) => o.id)
        .sort(),
    );
    expect(SCENE_OBJECTS.findIndex((o) => o.kind === "satellite")).toBeGreaterThan(
      SCENE_OBJECTS.map((o) => o.kind).lastIndexOf("spacecraft"),
    );
  });

  it("VN-CAT-006: every catalog spacecraft is a scene object after the bodies, as a marker-sized point", () => {
    expect(SCENE_OBJECTS.slice(0, DRAWN_BODIES.length).map((o) => o.id)).toEqual(DRAWN_BODIES.map((b) => b.horizonsId));
    const craft = SCENE_OBJECTS.filter((o) => o.kind === "spacecraft");
    expect(craft.map((o) => o.id).sort()).toEqual(
      CATALOG.objects
        .filter((o) => o.type === "spacecraft")
        .map((o) => o.id)
        .sort(),
    );
    for (const c of craft) expect(c.radiusKm).toBe(SPACECRAFT_RADIUS_KM);
  });
});
