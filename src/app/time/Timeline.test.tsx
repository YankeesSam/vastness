import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogObject } from "../../core/catalog/schema";
import { PLANET_COVERAGE } from "../../core/time/clock";
import { parseUtc } from "../../core/time/scales";
import { CATALOG_BY_ID } from "../catalog";
import { createViewStore } from "../store/view";
import { Timeline, timelineModel } from "./Timeline";

afterEach(() => cleanup());

const V1 = CATALOG_BY_ID.get(-31)!;
const cov = { start: parseUtc("1977-09-05T14:00:00Z"), end: parseUtc("2030-01-01T00:00:00Z") };

describe("timeline model", () => {
  it("VN-TIM-005: spans the selected object's coverage and marks its launch and events", () => {
    const m = timelineModel(V1, cov, parseUtc("1990-01-01T00:00:00Z"));
    expect(m.lo).toBeLessThan(cov.start);
    expect(m.hi).toBeGreaterThan(cov.end);
    expect(m.band).toEqual({ from: (cov.start - m.lo) / (m.hi - m.lo), to: (cov.end - m.lo) / (m.hi - m.lo) });
    expect(m.marks.map((k) => k.label)).toEqual([
      "Launch",
      "Jupiter flyby",
      "Saturn and Titan flyby",
      "Crosses the heliopause into interstellar space",
    ]);
    expect(m.marks[0]!.kind).toBe("launch");
    expect(m.marks[1]!.t).toBe(parseUtc("1979-03-05"));
    for (const k of m.marks) expect(k.x).toBeGreaterThanOrEqual(0);
    expect(m.thumb).toBeCloseTo((parseUtc("1990-01-01T00:00:00Z") - m.lo) / (m.hi - m.lo), 12);
  });

  it("VN-TIM-005: with no selection or no trajectory it spans the planets' coverage, without a band", () => {
    const m = timelineModel(undefined, null, 0);
    expect([m.lo, m.hi]).toEqual([PLANET_COVERAGE.start, PLANET_COVERAGE.end]);
    expect(m.band).toBeNull();
    expect(m.marks).toEqual([]);
    const { launch: _launch, events: _events, status: _status, ...rest } = V1;
    const planet: CatalogObject = { ...rest, id: 499, type: "planet" };
    expect(timelineModel(planet, { start: PLANET_COVERAGE.start, end: PLANET_COVERAGE.end }, 0).band).toBeNull();
  });

  it("VN-TIM-005: the span stays inside the planets' coverage", () => {
    const m = timelineModel(V1, { start: PLANET_COVERAGE.start + 10, end: PLANET_COVERAGE.end - 10 }, 0);
    expect(m.lo).toBe(PLANET_COVERAGE.start);
    expect(m.hi).toBe(PLANET_COVERAGE.end);
  });
});

describe("timeline", () => {
  it("VN-TIM-005: dragging the scrubber moves time; an event mark jumps to it", () => {
    const store = createViewStore({ t: parseUtc("1990-01-01T00:00:00Z") });
    render(<Timeline store={store} object={V1} coverage={cov} />);
    const slider = screen.getByRole("slider", { name: "Timeline" }) as HTMLInputElement;
    const m = timelineModel(V1, cov, 0);
    fireEvent.change(slider, { target: { value: String(m.lo + (m.hi - m.lo) / 2) } });
    expect(store.getState().t).toBeCloseTo(m.lo + (m.hi - m.lo) / 2, 0);
    fireEvent.click(screen.getByRole("button", { name: /Saturn and Titan flyby, 1980-11-12/ }));
    expect(store.getState().t).toBe(parseUtc("1980-11-12"));
    expect(screen.getByText(/Voyager 1/)).toBeTruthy();
  });
});
