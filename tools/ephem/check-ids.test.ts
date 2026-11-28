import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CachedResponse } from "./client.ts";
import { checkIds, claimsFrom, formatReport, judge, lookupParams, normalizeName, parseLookup } from "./check-ids.ts";
import { HORIZONS_LOOKUP_API, canonicalQuery } from "./horizons.ts";
import type { BodiesFile, Fetcher } from "./main.ts";
import { LOOKUP_FIXTURES } from "./record.ts";

// Recorded lookup responses (testdata/horizons/lookup-*.json, F1); no network (VN-DAT-007).

const fixture = (sstr: string): string =>
  readFileSync(new URL(`../../testdata/horizons/lookup-${sstr}.json`, import.meta.url), "utf8");
const bodies = JSON.parse(readFileSync(new URL("../../data/bodies.json", import.meta.url), "utf8")) as BodiesFile;

/** Serves the recorded lookups and records which endpoint and queries were asked. */
function recorded(): Fetcher & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async get(params, endpoint) {
      expect(endpoint).toBe(HORIZONS_LOOKUP_API);
      asked.push(params.sstr!);
      const r: CachedResponse = {
        body: fixture(params.sstr!),
        retrieved: "2026-11-27",
        fromCache: true,
        query: `${endpoint}?${canonicalQuery(params)}`,
      };
      return r;
    },
  };
}

describe("check-ids (VN-DAT-008)", () => {
  it('VN-DAT-008: parses the lookup API\'s JSON, including count "0" with no result', () => {
    const e = parseLookup(fixture("399"), "q");
    expect(e.map((x) => [x.spkid, x.name])).toEqual([
      ["399", "Earth"],
      ["20000399", "399 Persephone"],
    ]);
    expect(e[0]!.alias).toEqual(["Geocenter"]);
    expect(parseLookup(fixture("9999999"), "q")).toEqual([]);
    expect(() => parseLookup("<html>", "Q1")).toThrow(/not JSON \(query: Q1\)/);
    expect(() => parseLookup('{"error":"bad sstr","signature":{"source":"x"}}', "Q2")).toThrow(/bad sstr.*Q2/);
    expect(() =>
      parseLookup('{"count":2,"result":[],"signature":{"source":"NASA/JPL Horizons Lookup API"}}', "Q3"),
    ).toThrow(/count 2/);
  });

  it("VN-DAT-008: every ID in data/bodies.json is the body we name, by the recorded lookups", async () => {
    const f = recorded();
    const rows = await checkIds(claimsFrom(bodies), f);
    expect(rows.length).toBe(bodies.bodies.length);
    expect(rows.filter((r) => !r.pass)).toEqual([]);
    expect(f.asked).toEqual(bodies.bodies.map((b) => String(b.id)).sort((a, b) => Number(a) - Number(b)));
    // Earth is 399 (not 3, the barycentre, nor asteroid 399 Persephone, which shares the search string).
    expect(rows.find((r) => r.claim.id === 399)!.found).toBe("Earth");
  });

  it('VN-DAT-008: spacecraft match with the "(spacecraft)" suffix or an alias', () => {
    const v1 = parseLookup(fixture("-31"), "q");
    expect(judge({ id: -31, name: "Voyager 1", source: "t" }, v1, "q").pass).toBe(true);
    const jwst = parseLookup(fixture("-170"), "q");
    expect(judge({ id: -170, name: "James Webb Space Telescope", source: "t" }, jwst, "q").pass).toBe(true);
    expect(judge({ id: -170, name: "JWST", source: "t" }, jwst, "q").pass).toBe(true);
    expect(judge({ id: -170, name: "Webb", horizonsName: "JWST", source: "t" }, jwst, "q").pass).toBe(true);
    expect(normalizeName("Voyager 1 (spacecraft)")).toBe("voyager 1");
  });

  it("VN-DAT-008: a wrong ID or an unknown ID fails, naming what Horizons has and the query", async () => {
    const f = recorded();
    const rows = await checkIds(
      [
        { id: -31, name: "Voyager 2", source: "data/catalog.json" },
        { id: 9999999, name: "Nothing", source: "data/catalog.json" },
        { id: 10, name: "Pioneer 10", source: "data/catalog.json" },
      ],
      f,
    );
    const by = new Map(rows.map((r) => [r.claim.id, r]));
    expect(rows.every((r) => !r.pass)).toBe(true);
    expect(by.get(-31)!.note).toBe('ID -31 is "Voyager 1 (spacecraft)", not "Voyager 2"');
    expect(by.get(9999999)!.note).toMatch(/knows no object 9999999/);
    // Pioneer 10 appears in the search for "10" but under its own ID (-23): ID 10 is the Sun.
    expect(by.get(10)!.note).toBe('ID 10 is "Sun", not "Pioneer 10"');
    expect(by.get(-31)!.query).toBe(`${HORIZONS_LOOKUP_API}?${canonicalQuery(lookupParams("-31"))}`);
    const report = formatReport(rows);
    expect(report).toContain("| -31 | Voyager 2 | data/catalog.json | Voyager 1 (spacecraft) | FAIL:");
  });

  it("VN-DAT-008: claims come from data/bodies.json and the catalog's objects with an optional Horizons name", () => {
    const c = claimsFrom(bodies, {
      objects: [
        { id: -170, name: "Webb", horizons_name: "JWST" },
        { id: -125544, name: "ISS", type: "satellite" }, // VN-CAT-007: by NORAD number, checked by tools/gp
      ],
    });
    expect(c.at(-1)).toEqual({ id: -170, name: "Webb", horizonsName: "JWST", source: "data/catalog.json" });
    expect(c.filter((x) => x.source === "data/bodies.json").length).toBe(bodies.bodies.length);
  });

  it("T-107, VN-DAT-008: a comet matches by name and must carry the designation we query by", () => {
    const hb = [
      { name: "Hale-Bopp (C/1995 O1)", spkid: "1000132", type: "comet", alias: ["J95O010"], pdes: "C/1995 O1" },
    ];
    expect(judge({ id: 1000132, name: "Hale-Bopp", designation: "C/1995 O1", source: "t" }, hb, "q").pass).toBe(true);
    const wrong = judge({ id: 1000132, name: "Hale-Bopp", designation: "C/1995 O2", source: "t" }, hb, "q");
    expect(wrong.pass).toBe(false);
    expect(wrong.note).toMatch(/designated C\/1995 O1, not C\/1995 O2/);
  });

  it("T-084, VN-DAT-008: a numbered dwarf planet matches by its numbered name; Eris's barycentre entry does not confuse it", () => {
    const eris = [
      { name: "Eris (system barycenter)", spkid: "20136199", type: "asteroid barycenter", alias: [], pdes: null },
      { name: "136199 Eris", spkid: "20136199", type: "asteroid", alias: ["2136199"], pdes: "2003 UB313" },
    ];
    const ok = judge({ id: 20136199, name: "Eris", designation: "136199", source: "t" }, eris, "q");
    expect(ok.pass).toBe(true);
    expect(ok.found).toBe("136199 Eris");
    expect(judge({ id: 20136199, name: "Eris", designation: "136108", source: "t" }, eris, "q").pass).toBe(false);
  });

  it("the recorded fixtures cover every ID in data/bodies.json", () => {
    for (const b of bodies.bodies) expect(LOOKUP_FIXTURES).toContain(String(b.id));
  });
});
