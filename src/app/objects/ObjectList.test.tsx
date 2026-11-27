import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "../catalog";
import { ObjectList, ObjectSearch } from "./ObjectList";
import { firstMatch, fold, matchRank, searchObjects } from "./search";

const ORDER = [10, 199, 299, 399, 301, 499, 599, 699, 799, 899];

function Harness({ onChoose }: { onChoose(id: number): void }) {
  const [q, setQ] = useState("");
  return (
    <>
      <ObjectSearch objects={CATALOG.objects} order={ORDER} query={q} onQuery={setQ} onChoose={onChoose} />
      <ObjectList objects={CATALOG.objects} order={ORDER} query={q} selection={null} onChoose={onChoose} />
    </>
  );
}

afterEach(cleanup);

describe("object search", () => {
  it("VN-CAT-003: names fold case, accents and punctuation", () => {
    expect(fold("  OSIRIS–APEX ")).toBe("osiris apex");
    expect(fold("Jüpiter")).toBe("jupiter");
  });

  it("VN-CAT-003: a name start ranks above a word start, above a substring; aliases count", () => {
    const jwst = CATALOG.objects.find((o) => o.id === -170)!;
    expect(matchRank(jwst, "james")).toBe(0);
    expect(matchRank(jwst, "webb")).toBe(0); // alias "Webb"
    expect(matchRank(jwst, "space tel")).toBe(1);
    expect(matchRank(jwst, "ebb")).toBe(2);
    expect(matchRank(jwst, "mars")).toBe(-1);
    expect(firstMatch(CATALOG.objects, "voy", ORDER)?.name).toBe("Voyager 1");
    expect(firstMatch(CATALOG.objects, "luna", ORDER)?.name).toBe("Moon");
    expect(firstMatch(CATALOG.objects, "lunar", ORDER)?.name).toBe("LRO");
    expect(firstMatch(CATALOG.objects, "zzz", ORDER)).toBeNull();
  });

  it("VN-CAT-003: groups in order, bodies from the Sun outwards, spacecraft by name", () => {
    const g = searchObjects(CATALOG.objects, "", ORDER);
    expect(g.map((x) => x.group)).toEqual(["Sun and planets", "Moons", "Spacecraft"]);
    expect(g[0]!.objects.map((o) => o.id)).toEqual([10, 199, 299, 399, 499, 599, 699, 799, 899]);
    const craft = g[2]!.objects.map((o) => o.name);
    expect(craft).toEqual([...craft].sort((a, b) => a.localeCompare(b)));
    expect(searchObjects(CATALOG.objects, "ju", ORDER).map((x) => [x.group, x.objects.map((o) => o.name)])).toEqual([
      ["Sun and planets", ["Jupiter"]],
      ["Spacecraft", ["JUICE", "Juno"]],
    ]);
  });
});

describe("ObjectList", () => {
  it("VN-CAT-003: type-ahead filters the grouped list as you type", () => {
    render(<Harness onChoose={() => {}} />);
    const box = screen.getByRole("searchbox", { name: "Search objects" });
    fireEvent.change(box, { target: { value: "vo" } });
    expect(screen.queryByRole("region", { name: "Sun and planets" })).toBeNull();
    const craft = screen.getByRole("region", { name: "Spacecraft" });
    expect(
      within(craft)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Voyager 1", "Voyager 2"]);
    fireEvent.change(box, { target: { value: "nothing like it" } });
    expect(screen.getByText(/No object matches/)).toBeTruthy();
  });

  it("VN-CAT-003: Enter selects the best match and flies to it; Escape clears the query", () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    const box = screen.getByRole("searchbox", { name: "Search objects" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "parker" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(-96);
    fireEvent.change(box, { target: { value: "sat" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChoose).toHaveBeenLastCalledWith(699);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Europa Clipper" }));
    expect(onChoose).toHaveBeenLastCalledWith(-159);
  });
});
