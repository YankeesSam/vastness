import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSourceLocation } from "../../src/core/spaceweather/types";
import { buildDonki, monthChunks, parseCmes, parseShocks, parseStorms } from "./parse";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../testdata/donki/${name}`, import.meta.url), "utf8"));

describe("DONKI parser (T-086)", () => {
  const cmes = parseCmes(fixture("cme-2024-05-08.json"));

  it("VN-EXT-001: keeps one analysis per CME: the most accurate, leading edge first", () => {
    const c = cmes.cmes.find((x) => x.id === "2024-05-08T05:36:00-CME-001")!;
    // DONKI marks both a leading-edge and a shock analysis most accurate for this one; the LE is kept.
    expect(c).toMatchObject({
      start: "2024-05-08T05:36Z",
      feature: "LE",
      lat: -7,
      lon: 9,
      halfAngle: 43,
      speed: 870,
      type: "C",
      source: "S22W10",
      activeRegion: 13664,
    });
    expect(c.t21).toBe("2024-05-08T09:30Z");
    expect(c.storms).toEqual(["2024-05-10T15:00:00-GST-001"]);
    expect(c.shocks).toContain("2024-05-10T16:36:00-IPS-001");
  });

  it("VN-EXT-001: the WSA-Enlil prediction is the latest model run, with the Earth arrival and Kp", () => {
    const c = cmes.cmes.find((x) => x.id === "2024-05-08T05:36:00-CME-001")!;
    expect(c.enlil).not.toBeNull();
    const runs = (fixture("cme-2024-05-08.json") as Array<Record<string, any>>)
      .find((x) => x.activityID === c.id)!
      .cmeAnalyses.find((a: Record<string, unknown>) => a.featureCode === "LE").enlilList as Array<{
      modelCompletionTime: string;
    }>;
    const latest = runs
      .map((r) => r.modelCompletionTime)
      .sort()
      .at(-1);
    expect(c.enlil!.modelCompletion).toBe(latest);
    expect(c.enlil!.earthArrival).toMatch(/^2024-05-1\dT\d\d:\d\dZ$/);
    expect(c.enlil!.kp90).toBeGreaterThan(0);
    expect(c.enlil!.impacts.map((i) => i.location)).toContain("STEREO A");
  });

  it("VN-EXT-001: flares come from the CME's linked flare IDs, with the CME's source", () => {
    expect(cmes.flares.map((f) => f.id)).toEqual(["2024-05-08T04:20:00-FLR-001", "2024-05-08T04:37:00-FLR-001"]);
    expect(cmes.flares[1]).toEqual({
      id: "2024-05-08T04:37:00-FLR-001",
      begin: "2024-05-08T04:37Z",
      class: null,
      source: "S22W10",
    });
  });

  it("VN-EXT-001: a CME without an Enlil run is kept; one without a full direction is counted, not kept", () => {
    expect(cmes.cmes.find((x) => x.id === "2024-05-10T02:12:00-CME-001")!.enlil).toBeNull();
    // 2024-05-10T16:36: DONKI's analysis has no longitude, so it cannot be drawn.
    expect(cmes.cmes.find((x) => x.id === "2024-05-10T16:36:00-CME-001")).toBeUndefined();
    expect(cmes.skipped).toEqual(["2024-05-10T16:36:00-CME-001"]);
  });

  it("VN-EXT-001: storms keep the observed Kp and the maximum; shocks their place", () => {
    const [g] = parseStorms(fixture("gst-2024-05-08.json"));
    expect(g!.kpMax).toBe(9);
    expect(g!.kp[0]).toEqual(["2024-05-10T18:00Z", 7.67]);
    expect(g!.cmes).toContain("2024-05-08T05:36:00-CME-001");
    const shocks = parseShocks(fixture("ips-2024-05-08.json"));
    expect(shocks.find((s) => s.id === "2024-05-10T16:36:00-IPS-001")).toMatchObject({
      location: "Earth",
      time: "2024-05-10T16:36Z",
    });
  });

  it("VN-GEN-010: building twice gives the same sorted output, without duplicates across chunks", () => {
    const raw = {
      cme: [fixture("cme-2024-05-08.json"), fixture("cme-2024-05-08.json")],
      gst: [fixture("gst-2024-05-08.json")],
      ips: [fixture("ips-2024-05-08.json")],
    };
    const a = buildDonki(raw, { start: "2024-05-08", end: "2024-05-12", retrieved: "2026-11-27", flareNote: null });
    const b = buildDonki(raw, { start: "2024-05-08", end: "2024-05-12", retrieved: "2026-11-27", flareNote: null });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cmes).toHaveLength(3);
    expect(a.skipped).toEqual(["2024-05-10T16:36:00-CME-001"]);
    expect(a.cmes.map((c) => c.start)).toEqual([...a.cmes.map((c) => c.start)].sort());
    expect(a.credit).toMatch(/DONKI/);
  });

  it("splits the archive into calendar months", () => {
    expect(monthChunks("2010-01-01", "2010-03-15")).toEqual([
      ["2010-01-01", "2010-01-31"],
      ["2010-02-01", "2010-02-28"],
      ["2010-03-01", "2010-03-15"],
    ]);
  });

  it("reads DONKI source locations", () => {
    expect(parseSourceLocation("S22W10")).toEqual({ lat: -22, lon: 10 });
    expect(parseSourceLocation("N30E90")).toEqual({ lat: 30, lon: -90 });
    expect(parseSourceLocation("")).toBeNull();
  });
});
