import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { byId, isSafeUrl, satelliteId, validateCatalog, type CatalogObject } from "./schema";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const catalogJson = JSON.parse(readFileSync(`${root}data/catalog.json`, "utf8"));
const bodiesJson = JSON.parse(readFileSync(`${root}data/bodies.json`, "utf8")) as { bodies: { id: number }[] };

const craft = (over: Partial<CatalogObject> = {}): Record<string, unknown> => ({
  id: -31,
  name: "Voyager 1",
  aliases: [],
  type: "spacecraft",
  parent: 10,
  launch: "1977-09-05",
  status: { state: "operating", as_of: "2026-11-26" },
  agency: "NASA",
  summary: "A test summary long enough to be a paragraph, written only for the schema checker in this unit test.",
  goals: ["Study things"],
  sources: [{ title: "NASA", url: "https://science.nasa.gov/" }],
  colour: "#ffffff",
  priority: 50,
  ...over,
});
const sun = { ...craft({ id: 10, name: "Sun", type: "star" }), parent: undefined, launch: undefined };
delete (sun as Record<string, unknown>).status;
delete (sun as Record<string, unknown>).agency;
const check =
  (...objects: unknown[]) =>
  () =>
    validateCatalog({ objects: JSON.parse(JSON.stringify([sun, ...objects])) });

describe("catalog schema", () => {
  it("VN-CAT-001: data/catalog.json passes the schema", () => {
    expect(() => validateCatalog(catalogJson)).not.toThrow();
  });

  it("VN-CAT-002: lists every required spacecraft, including JWST", () => {
    const c = validateCatalog(catalogJson);
    const names = c.objects.filter((o) => o.type === "spacecraft").map((o) => o.name);
    for (const n of [
      "Voyager 1",
      "Voyager 2",
      "New Horizons",
      "Parker Solar Probe",
      "Juno",
      "Europa Clipper",
      "JUICE",
      "Lucy",
      "Psyche",
      "OSIRIS-APEX",
      "LRO",
      "CAPSTONE",
      "James Webb Space Telescope",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("VN-CAT-001: every body in data/bodies.json has a catalog entry; spacecraft IDs are negative", () => {
    const c = byId(validateCatalog(catalogJson));
    for (const b of bodiesJson.bodies) expect(c.has(b.id), `body ${b.id}`).toBe(true);
    for (const o of c.values()) if (o.type === "spacecraft") expect(o.id).toBeLessThan(0);
  });

  it("VN-CAT-001: status carries an as-of date no later than the catalog's newest check", () => {
    const c = validateCatalog(catalogJson);
    for (const o of c.objects.filter((x) => x.type === "spacecraft")) {
      expect(o.status!.as_of >= o.launch!, o.name).toBe(true);
    }
  });

  it("accepts a minimal valid catalog", () => {
    expect(check(craft())).not.toThrow();
  });

  it.each([
    ["unknown key", { extra: 1 }, /unknown key "extra"/],
    ["bad launch date", { launch: "1977-02-30" }, /launch/],
    ["status before launch", { status: { state: "operating", as_of: "1970-01-01" } }, /before launch/],
    ["unclear without note", { status: { state: "unclear", as_of: "2026-11-26" } }, /needs a note/],
    ["http link", { sources: [{ title: "x", url: "http://example.org/" }] }, /https/],
    ["javascript link", { sources: [{ title: "x", url: "javascript:alert(1)" }] }, /https/],
    ["no sources", { sources: [] }, /at least one source/],
    ["upper-case colour", { colour: "#FFFFFF" }, /colour/],
    ["short summary", { summary: "Too short." }, /summary/],
    ["two paragraphs", { summary: `${"a".repeat(60)}\n${"b".repeat(60)}` }, /one paragraph/],
    ["no parent", { parent: undefined }, /parent missing/],
    ["unknown parent", { parent: 599 }, /parent 599 is not in the catalog/],
    ["priority out of range", { priority: 101 }, /priority/],
    ["no goals", { goals: [] }, /goal/],
  ])("rejects %s", (_n, over, re) => {
    expect(check(craft(over as Partial<CatalogObject>))).toThrow(re);
  });

  it("rejects duplicate IDs and shared names, reporting all problems at once", () => {
    let msg = "";
    try {
      check(craft(), craft({ name: "Dup" }), craft({ id: -32, name: "V2", aliases: ["voyager 1"], colour: "bad" }))();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/duplicate id -31/);
    expect(msg).toMatch(/also used by -31/);
    expect(msg).toMatch(/colour/);
  });

  it("rejects a launch date on a planet", () => {
    const planet = { ...sun, id: 399, name: "Earth", type: "planet", parent: 10, launch: "2000-01-01" };
    expect(check(planet)).toThrow(/only spacecraft and satellites have a launch date/);
  });

  it("VN-CAT-007: a satellite carries its NORAD number, id -(100000 + NORAD) and Earth as parent", () => {
    const earth = { ...sun, id: 399, name: "Earth", type: "planet", parent: 10 };
    const sat = (over: Record<string, unknown> = {}) => ({
      ...craft({ id: -125544, name: "ISS", type: "satellite", parent: 399, goals: [] }),
      norad: 25544,
      ...over,
    });
    expect(satelliteId(25544)).toBe(-125544); // Horizons' ID for the ISS
    expect(check(earth, sat())).not.toThrow();
    expect(check(earth, sat({ id: -25544 }))).toThrow(/id must be -125544/);
    expect(check(earth, sat({ norad: undefined }))).toThrow(/norad must be/);
    expect(check(earth, sat({ parent: 10 }))).toThrow(/parent is Earth/);
    expect(check(craft({ norad: 1 } as Partial<CatalogObject>))).toThrow(/only satellites have a NORAD number/);
  });

  it("VN-CAT-007: the catalog names the ISS, Hubble, Tiangong, Starlink and geostationary satellites", () => {
    const c = validateCatalog(catalogJson);
    const sats = c.objects.filter((o) => o.type === "satellite");
    for (const n of [25544, 20580, 48274, 60133, 51850]) expect(sats.map((o) => o.norad)).toContain(n);
    expect(sats.filter((o) => o.name.startsWith("Starlink")).length).toBeGreaterThanOrEqual(3);
  });

  it("isSafeUrl accepts only https with a host and no credentials", () => {
    expect(isSafeUrl("https://ssd.jpl.nasa.gov/horizons/")).toBe(true);
    expect(isSafeUrl("https://user:pw@example.org/")).toBe(false);
    expect(isSafeUrl("data:text/html,x")).toBe(false);
    expect(isSafeUrl("/relative")).toBe(false);
  });
});
