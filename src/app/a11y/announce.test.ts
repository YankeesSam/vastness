import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCE_INTERVAL_MS, createAnnouncer, describeView, followMessage, selectionMessage } from "./announce";

const names = new Map([
  [499, "Mars"],
  [-31, "Voyager 1"],
]);
const name = (id: number) => names.get(id) ?? `object ${id}`;

describe("live-region announcer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("VN-ACC-002: says the first message at once, then at most one per interval, the latest winning", () => {
    const said: string[] = [];
    const a = createAnnouncer((t) => said.push(t));
    a.say("Selected Mars.");
    expect(said).toEqual(["Selected Mars."]);
    a.say("Selected Jupiter.");
    a.say("Selected Saturn.");
    expect(said).toHaveLength(1);
    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS - 1);
    expect(said).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(said).toEqual(["Selected Mars.", "Selected Saturn."]);
    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 3);
    expect(said).toHaveLength(2);
    a.say("Following Saturn.");
    expect(said.at(-1)).toBe("Following Saturn.");
    a.dispose();
  });

  it("VN-ACC-002: dispose drops a pending message", () => {
    const said: string[] = [];
    const a = createAnnouncer((t) => said.push(t));
    a.say("one");
    a.say("two");
    a.dispose();
    vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2);
    expect(said).toEqual(["one"]);
  });
});

describe("messages", () => {
  it("VN-ACC-002: selection and arrival messages", () => {
    expect(selectionMessage(499, name)).toBe("Selected Mars.");
    expect(selectionMessage(null, name)).toBe("Selection cleared.");
    expect(followMessage(-31, null, name)).toBe("Arrived at Voyager 1, following it.");
    expect(followMessage(null, 499, name)).toBe("Stopped following Mars.");
    expect(followMessage(null, null, name)).toBeNull();
  });

  it("VN-ACC-002: the canvas text alternative names the date, centre, scale and how to explore", () => {
    const d = describeView(
      { dateUtc: "2026-11-27", following: 499, selection: -31, scale: "true", rate: 86400, paused: false },
      name,
    );
    expect(d).toContain("2026-11-27");
    expect(d).toContain("following Mars");
    expect(d).toContain("Voyager 1 selected");
    expect(d).toContain("true scale");
    expect(d).toContain("1 day per second");
    expect(d).toMatch(/object list/i);
    const free = describeView(
      { dateUtc: "2000-01-01", following: null, selection: null, scale: "exaggerated", rate: 1, paused: true },
      name,
    );
    expect(free).toContain("not following");
    expect(free).toContain("exaggerated scale");
    expect(free).toContain("paused");
  });
});
