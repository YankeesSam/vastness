import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUtc } from "../../core/time/scales";
import { createViewStore } from "../store/view";
import { Share, shareUrl } from "./Share";

afterEach(() => cleanup());

describe("share", () => {
  it("VN-WEB-002: the link is this page with the view in the fragment, without the query", () => {
    expect(shareUrl("https://example.org/vastness/?t=2026&still=1#old", "v=1&t=x")).toBe(
      "https://example.org/vastness/#v=1&t=x",
    );
  });

  it("VN-WEB-002: Share copies the link and says so", async () => {
    const store = createViewStore({ t: parseUtc("2026-01-01T00:00:00Z") });
    store.getState().select(-31);
    const copy = vi.fn(() => Promise.resolve());
    render(<Share store={store} copy={copy} href={() => "https://example.org/v/"} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    expect(copy).toHaveBeenCalledTimes(1);
    const url = (copy.mock.calls[0] as unknown as [string])[0];
    expect(url).toMatch(/^https:\/\/example\.org\/v\/#v=1&t=2026-01-01T00:00:00\.000Z&.*s=-31/);
    expect(screen.getByRole("status").textContent).toBe("Link copied");
  });

  it("VN-WEB-002: without clipboard access the link is shown to copy by hand", async () => {
    const store = createViewStore({ t: 0 });
    render(<Share store={store} copy={() => Promise.reject(new Error("denied"))} href={() => "https://e.org/"} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    const field = screen.getByRole("textbox", { name: "Link to this view" }) as HTMLInputElement;
    expect(field.value).toMatch(/^https:\/\/e\.org\/#v=1&/);
    expect(field.readOnly).toBe(true);
  });
});
