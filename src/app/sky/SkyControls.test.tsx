import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SKY, viewStore } from "../store/view";
import { SkyControls } from "./SkyControls";

describe("SkyControls", () => {
  afterEach(() => viewStore.getState().setSky(DEFAULT_SKY));

  it("VN-SCN-007, VN-SCN-005: sliders dim the stars and set the Sun's glow brightness and size", () => {
    render(<SkyControls />);
    const stars = screen.getByRole("slider", { name: "Star brightness" });
    expect((stars as HTMLInputElement).value).toBe(String(DEFAULT_SKY.stars));
    fireEvent.change(stars, { target: { value: "0" } });
    expect(viewStore.getState().sky.stars).toBe(0);
    fireEvent.change(screen.getByRole("slider", { name: "Sun glow brightness" }), { target: { value: "1.5" } });
    fireEvent.change(screen.getByRole("slider", { name: "Sun glow size" }), { target: { value: "2" } });
    expect(viewStore.getState().sky).toEqual({ stars: 0, glow: 1.5, glowSize: 2 });
  });
});
