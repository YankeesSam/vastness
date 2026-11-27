import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { parseUtc } from "../../core/time/scales";
import { satelliteTracks, withSatellites, type SatellitesData } from "../../scene/satellites/satellites";
import satellites from "../../../data/satellites.json";
import { viewStore } from "../store/view";
import { InfoPanel } from "./InfoPanel";

const AU = 149_597_870.7;

/** Earth at 1 AU on x, Mars at 1.5 AU on y; velocities 30 and 24 km/s. */
function fakeEphemeris(): Ephemeris {
  const states: Record<number, number[]> = {
    399: [AU, 0, 0, 0, 30, 0],
    499: [0, 1.5 * AU, 0, -24, 0, 0],
    10: [0, 0, 0, 0, 0, 0],
  };
  return {
    has: (id: number) => id in states || id === -170,
    coverage: (id: number) => (id === -170 ? { start: 693_700_000, end: 1_005_826_000 } : null),
    state(id: number, _t: number, out: Float64Array) {
      const s = states[id];
      if (!s) return "outside";
      out.set(s);
      return "ok";
    },
  } as unknown as Ephemeris;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("info panel", () => {
  it("VN-INF-001, VN-INF-002: name, type, distances, light-time and speeds for the selected body", async () => {
    render(<InfoPanel selection={499} units="au" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    expect(await screen.findByRole("heading", { name: "Mars" })).toBeTruthy();
    expect(screen.getByText("Planet")).toBeTruthy();
    const dl = await screen.findByLabelText("Read-outs");
    expect(dl.textContent).toContain("1.50000 AU"); // from the Sun
    expect(dl.textContent).toContain(`${Math.hypot(1, 1.5).toPrecision(6)} AU`); // from Earth
    expect(dl.textContent).toContain("15 m 00 s"); // sqrt(3.25) au x 499.005 s = 899.6 s
    expect(dl.textContent).toContain("24.000 km/s");
    expect(dl.textContent).toContain(`${Math.hypot(24, 30).toFixed(3)} km/s`);
    expect(dl.textContent).toMatch(/command/);
  });

  it("VN-INF-004: the unit choice is reported, and Earth shows no distance from itself", async () => {
    const onUnits = vi.fn();
    render(<InfoPanel selection={399} units="km" onUnits={onUnits} ephemeris={Promise.resolve(fakeEphemeris())} />);
    const dl = await screen.findByLabelText("Read-outs");
    expect(dl.textContent).toContain("149,597,871 km");
    expect(dl.textContent).toContain("—");
    fireEvent.change(screen.getByRole("combobox", { name: "Distance units" }), { target: { value: "mi" } });
    expect(onUnits).toHaveBeenCalledWith("mi");
  });

  it("VN-INF-004: updates on a 250 ms timer, not per frame", async () => {
    vi.useFakeTimers();
    const eph = fakeEphemeris();
    const spy = vi.spyOn(eph, "state");
    render(<InfoPanel selection={499} units="km" onUnits={() => {}} ephemeris={Promise.resolve(eph)} />);
    await act(async () => {
      await Promise.resolve();
    });
    const first = spy.mock.calls.length;
    expect(first).toBe(2);
    act(() => {
      for (let i = 0; i < 60; i++) viewStore.getState().tick(1 / 60);
      vi.advanceTimersByTime(1000);
    });
    expect(spy.mock.calls.length - first).toBe(2 * 4);
  });

  it("VN-EPH-007: a spacecraft outside its coverage shows why instead of read-outs", async () => {
    viewStore.getState().setTime(0); // 2000: before JWST's launch
    render(<InfoPanel selection={-170} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    expect(await screen.findByRole("heading", { name: "James Webb Space Telescope" })).toBeTruthy();
    expect(screen.getByText("Spacecraft")).toBeTruthy();
    expect((await screen.findByText(/has not launched yet/)).textContent).toBe(
      "James Webb Space Telescope has not launched yet at this time (launch 2021-12-25).",
    );
    viewStore.getState().setTime(1_100_000_000); // 2034: beyond the predictions
    cleanup();
    render(<InfoPanel selection={-170} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    expect((await screen.findByText(/beyond Horizons' predictions/)).textContent).toMatch(/end on 2031-11-16/);
  });

  it("VN-EPH-011: an orbiter past its stored span says it is drawn on an illustrative orbit, with no read-outs", async () => {
    const edge = { t: 1_000_000_000, mu: 4902.800118, elements: [1800, 0.04, 1.57, 0, 0, 0] as const };
    const eph = {
      has: (id: number) => id === -85,
      coverage: () => ({ start: 300_000_000, end: 1_000_000_000 }),
      illustrativeEdge: (_id: number, t: number) => (t > 1_000_000_000 ? edge : undefined),
      state: () => "outside",
    } as unknown as Ephemeris;
    viewStore.getState().setTime(1_100_000_000);
    render(<InfoPanel selection={-85} units="km" onUnits={() => {}} ephemeris={Promise.resolve(eph)} />);
    const p = await screen.findByTestId("no-position");
    await vi.waitFor(() => expect(p.textContent).toMatch(/illustrative orbit \(period 1 h 54 min\)/));
    expect(p.textContent).toMatch(/not at its true position\.$/);
    expect(screen.queryByLabelText("Read-outs")).toBeNull();
  });

  it("VN-INF-003: a spacecraft adds launch, status with its as-of date, agency, summary, goals and safe links", async () => {
    viewStore.getState().setTime(0);
    render(<InfoPanel selection={-170} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    const mission = await screen.findByRole("region", { name: "Mission" });
    expect(mission.textContent).toContain("Launch2021-12-25");
    expect(mission.textContent).toContain("Operating (as of 2026-11-26)");
    expect(mission.textContent).toContain("NASA, ESA and CSA");
    expect(mission.textContent).toMatch(/6\.5 m segmented gold mirror/);
    const goals = screen.getByRole("list", { name: "Science goals" });
    expect(goals.querySelectorAll("li").length).toBe(3);
    const links = screen.getByRole("list", { name: "Sources" }).querySelectorAll("a");
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(links[0]!.textContent).toBe("NASA Science: Webb");
  });

  it("VN-INF-003: an unclear status shows its note", async () => {
    render(<InfoPanel selection={-61} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    const mission = await screen.findByRole("region", { name: "Mission" });
    expect(mission.textContent).toMatch(/Unclear \(as of \d{4}-\d{2}-\d{2}\)/);
    expect(mission.querySelector("[data-status-note]")?.textContent?.length).toBeGreaterThan(10);
  });

  it("VN-INF-003: a planet has no mission section", async () => {
    render(<InfoPanel selection={499} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    await screen.findByLabelText("Read-outs");
    expect(screen.queryByRole("region", { name: "Mission" })).toBeNull();
  });

  it("VN-CAT-007: a satellite shows its type, read-outs, the element epoch with its age, and its facts", async () => {
    const eph = withSatellites(
      { ...fakeEphemeris(), ids: [10, 399], illustrativeEdge: () => undefined } as unknown as Ephemeris,
      satelliteTracks(satellites as SatellitesData),
    );
    viewStore.getState().setTime(parseUtc("2026-11-28T22:39:00"));
    render(<InfoPanel selection={-125544} units="km" onUnits={() => {}} ephemeris={Promise.resolve(eph)} />);
    expect(await screen.findByRole("heading", { name: "International Space Station" })).toBeTruthy();
    expect(screen.getByText("Earth satellite")).toBeTruthy();
    const dl = await screen.findByLabelText("Read-outs");
    // About 420 km up: 6,700..6,900 km from Earth's centre.
    const km = Number(/Distance from Earth(\d[\d,.]*) km/.exec(dl.textContent!)![1]!.replace(/,/g, ""));
    expect(km).toBeGreaterThan(6700);
    expect(km).toBeLessThan(6900);
    expect(screen.getByLabelText("Orbital elements").textContent).toContain(
      "2026-11-26 22:39 UTC, 2.0 days before the time shown",
    );
    expect(screen.getByText(/1998-11-20/)).toBeTruthy();
  });

  it("VN-CAT-007, VN-EPH-011: a satellite more than 14 days from its elements says so, with no read-outs", async () => {
    const eph = withSatellites(
      { ...fakeEphemeris(), ids: [10, 399], illustrativeEdge: () => undefined } as unknown as Ephemeris,
      satelliteTracks(satellites as SatellitesData, () => parseUtc("1998-11-20")),
    );
    viewStore.getState().setTime(parseUtc("2027-01-15T00:00:00"));
    render(<InfoPanel selection={-125544} units="km" onUnits={() => {}} ephemeris={Promise.resolve(eph)} />);
    expect(
      await screen.findByText(
        /more than 14 days from International Space Station's orbital elements \(epoch 2026-11-26\)/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/illustrative orbit \(period 1 h 3\d min\)/)).toBeTruthy();
    expect(screen.queryByLabelText("Read-outs")).toBeNull();
    expect(screen.getByLabelText("Orbital elements").textContent).toContain("49.1 days before");
  });

  it("VN-INF-001: nothing selected asks for a selection", () => {
    render(<InfoPanel selection={null} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    expect(screen.getByText(/select an object/i)).toBeTruthy();
  });
});
