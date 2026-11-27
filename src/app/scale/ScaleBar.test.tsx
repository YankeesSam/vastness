import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AU_KM } from "../../core/constants";
import { ScaleBar } from "./ScaleBar";

afterEach(() => cleanup());

describe("scale bar", () => {
  it("VN-SCL-004: the width of the view in km, AU and light-time, with the reference marks", () => {
    render(<ScaleBar readout={{ widthKm: AU_KM, voyager1Km: 170 * AU_KM }} />);
    const fig = screen.getByRole("figure", { name: "Scale" });
    expect(fig.textContent).toContain("150 million km · 1 AU · 8.32 light-minutes");
    for (const name of ["Earth–Moon", "Earth–Sun", "Sun–Neptune", "Voyager 1"])
      expect(screen.getByTitle(name)).toBeTruthy();
    expect(screen.getByTitle("Voyager 1").hidden).toBe(false);
  });

  it("VN-SCL-004: without Voyager 1's position its mark is hidden", () => {
    render(<ScaleBar readout={{ widthKm: 1e6, voyager1Km: null }} />);
    expect(screen.getByTitle("Voyager 1").hidden).toBe(true);
  });
});
