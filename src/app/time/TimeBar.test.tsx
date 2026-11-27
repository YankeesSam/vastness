import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLANET_COVERAGE } from "../../core/time/clock";
import { parseUtc } from "../../core/time/scales";
import { createViewStore } from "../store/view";
import { TimeBar } from "./TimeBar";
import { formatTimeLabel, inputValue, tdbFromInput } from "./zone";

afterEach(() => cleanup());

const EST = () => -300; // UTC-5, minutes east of UTC
const T0 = parseUtc("2026-01-01T12:00:00Z");
/** Browsers show a datetime-local value without ":00" seconds. */
const norm = (v: string): string => v.replace(/^(.{16}):00$/, "$1");

describe("time zone edge", () => {
  it("VN-TIM-001: picker values in UTC and in local time", () => {
    expect(inputValue(T0, "utc")).toBe("2026-01-01T12:00:00");
    expect(inputValue(T0, "local", EST)).toBe("2026-01-01T07:00:00");
    expect(tdbFromInput("2026-01-01T12:00:00", "utc")).toBe(T0);
    expect(tdbFromInput("2026-01-01T07:00:00", "local", EST)).toBe(T0);
    expect(tdbFromInput("2026-01-01T07:00", "local", EST)).toBe(T0); // browsers drop :00 seconds
    expect(tdbFromInput("", "utc")).toBeNull();
    expect(tdbFromInput("2026-02-30T00:00:00", "utc")).toBeNull();
  });

  it("VN-TIM-004: the label says which zone it shows", () => {
    expect(formatTimeLabel(T0, "utc")).toBe("2026-01-01 12:00:00 UTC");
    expect(formatTimeLabel(T0, "local", EST)).toBe("2026-01-01 07:00:00 UTC−05:00");
    expect(formatTimeLabel(T0, "local", () => 330)).toBe("2026-01-01 17:30:00 UTC+05:30");
  });

  it("VN-TIM-001: a leap second shows as the last whole second of the minute in the picker", () => {
    const leap = parseUtc("2016-12-31T23:59:60.5Z");
    expect(inputValue(leap, "utc")).toBe("2016-12-31T23:59:59");
  });
});

describe("time bar", () => {
  it("VN-TIM-002: play, pause, reverse, slower, faster and the named rate", () => {
    const store = createViewStore({ t: T0 });
    render(<TimeBar store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(store.getState().paused).toBe(true);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(store.getState().paused).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Faster" }));
    expect(store.getState().rate).toBe(60);
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(store.getState().rate).toBe(-60);
    expect(screen.getByRole("contentinfo", { name: "Time" }).textContent).toContain("−1 min/s");
    fireEvent.click(screen.getByRole("button", { name: "Slower" }));
    expect(store.getState().rate).toBe(-1);
    const rate = screen.getByRole("combobox", { name: "Rate" }) as HTMLSelectElement;
    fireEvent.change(rate, { target: { value: "3" } });
    expect(store.getState().rate).toBe(-86400); // the chosen speed keeps the direction
  });

  it("VN-TIM-003: Now jumps to the current time at real time", () => {
    const store = createViewStore({ t: T0 });
    store.getState().setRate(3600);
    store.getState().setPaused(true);
    render(<TimeBar store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    const s = store.getState();
    expect(s.rate).toBe(1);
    expect(s.paused).toBe(false);
    expect(Math.abs(s.t - parseUtc(new Date().toISOString().slice(0, 19)))).toBeLessThan(5);
  });

  it("VN-TIM-001: the picker moves time on commit, in UTC or local time", () => {
    const store = createViewStore({ t: T0 });
    render(<TimeBar store={store} offsetMinutes={EST} />);
    const picker = screen.getByLabelText("Date and time") as HTMLInputElement;
    expect(norm(picker.value)).toBe(norm("2026-01-01T12:00:00"));
    expect(picker.min).toMatch(/^1899-12-31T23:59:\d\d$/); // 1900-01-01 TDB falls in the last minute of 1899 in UTC
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "1977-09-05T12:56:00" } });
    act(() => store.getState().tick(0.1)); // the clock running does not overwrite the draft
    expect(norm(picker.value)).toBe(norm("1977-09-05T12:56:00"));
    fireEvent.blur(picker);
    expect(store.getState().t).toBe(parseUtc("1977-09-05T12:56:00Z"));

    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), { target: { value: "local" } });
    expect(norm(picker.value)).toBe(norm("1977-09-05T07:56:00"));
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "2026-01-01T07:00:00" } });
    fireEvent.keyDown(picker, { key: "Enter" });
    expect(store.getState().t).toBe(T0);
    expect(screen.getByRole("contentinfo", { name: "Time" }).textContent).toContain("UTC−05:00");
  });

  it("VN-TIM-001: a time outside the planets' coverage is held at its edge", () => {
    const store = createViewStore({ t: T0 });
    render(<TimeBar store={store} />);
    const picker = screen.getByLabelText("Date and time");
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "1850-01-01T00:00:00" } });
    fireEvent.blur(picker);
    expect(store.getState().t).toBe(PLANET_COVERAGE.start);
  });
});
