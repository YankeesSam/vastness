import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingIndicator } from "./LoadingIndicator";
import { chunkActivity } from "./loader";

afterEach(cleanup);

describe("loading indicator", () => {
  it("VN-UI-005: a quiet status line shows while chunks download and clears when they finish", () => {
    render(<LoadingIndicator />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    act(() => chunkActivity.begin());
    expect(status.textContent).toBe("Loading trajectories…");
    act(() => chunkActivity.end());
    expect(status.textContent).toBe("");
  });
});
