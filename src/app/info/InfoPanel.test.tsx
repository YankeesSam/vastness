import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ephemeris } from "../../core/ephem/ephemeris";
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

  it("VN-INF-001: nothing selected asks for a selection", () => {
    render(<InfoPanel selection={null} units="km" onUnits={() => {}} ephemeris={Promise.resolve(fakeEphemeris())} />);
    expect(screen.getByText(/select an object/i)).toBeTruthy();
  });
});
