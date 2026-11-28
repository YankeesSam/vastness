import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tdbFromIso } from "../src/core/spaceweather/cme";
import {
  arrivalsNear,
  buildSpaceWeather,
  cmesInFlight,
  flaresLit,
  kpAt,
  stormAt,
  windAt,
  type CdawFile,
} from "../src/core/spaceweather/model";
import { matchCatalog, parseCatalog } from "../tools/cdaw/parse";
import { buildDonki } from "../tools/donki/parse";
import { buildSolarWind } from "../tools/swpc/parse";

// T-101, T-102: the three space weather files joined as the app sees them, built from the F1 fixtures.
const json = (p: string): unknown => JSON.parse(readFileSync(new URL(`../testdata/${p}`, import.meta.url), "utf8"));
const donki = buildDonki(
  {
    cme: [json("donki/cme-2024-05-08.json")],
    gst: [json("donki/gst-2024-05-08.json")],
    ips: [json("donki/ips-2024-05-08.json")],
  },
  { start: "2024-05-08", end: "2024-05-12", retrieved: "2026-11-27", flareNote: "n" },
);
const { matches } = matchCatalog(
  donki.cmes,
  parseCatalog(readFileSync(new URL("../testdata/cdaw/univ-sample.txt", import.meta.url), "utf8")).rows,
);
const cdaw: CdawFile = { credit: "cdaw", retrieved: "2026-11-27", rule: "r", matches };
const swpc = buildSolarWind(
  {
    wind: json("swpc/rtsw_wind_1m.json"),
    mag: json("swpc/rtsw_mag_1m.json"),
    kp: json("swpc/noaa-planetary-k-index.json"),
  },
  { retrieved: "2026-11-28", source: "s", credit: "swpc" },
);
const sw = buildSpaceWeather(donki, cdaw, swpc);

describe("space weather model (T-101, T-102)", () => {
  it("VN-EXT-006: CMEs carry their CDAW mass and energy, or say none", () => {
    const g = sw.cmes.find((c) => c.id === "2024-05-08T05:36:00-CME-001")!;
    expect(g.cdaw).toMatchObject({ mass: 2.7e16, poor: true });
    expect(sw.credits).toEqual([donki.credit, "cdaw", "swpc"]);
  });

  it("VN-EXT-005: in flight during the Gannon storm, flares lit near their begin time", () => {
    const ids = cmesInFlight(sw, tdbFromIso("2024-05-09T00:00Z")).map((x) => sw.cmes[x.index]!.id);
    expect(ids).toEqual(["2024-05-08T05:36:00-CME-001", "2024-05-08T19:12:00-CME-001"]);
    expect(flaresLit(sw, tdbFromIso("2024-05-08T05:00Z")).map((f) => f.id)).toEqual([
      "2024-05-08T04:20:00-FLR-001",
      "2024-05-08T04:37:00-FLR-001",
    ]);
    expect(flaresLit(sw, tdbFromIso("2024-05-08T09:00Z"))).toEqual([]);
  });

  it("VN-EXT-005: predicted and measured arrivals near a time, Earth's with Kp", () => {
    const near = arrivalsNear(sw, tdbFromIso("2024-05-10T17:00Z"));
    const measured = near.find((a) => a.kind === "measured" && a.location === "Earth")!;
    expect(measured.iso).toBe("2024-05-10T16:36Z");
    expect(measured.kp).toBe("9 observed");
    const predicted = near.filter((a) => a.kind === "predicted" && a.location === "Earth");
    expect(predicted.length).toBeGreaterThan(0);
    expect(predicted[0]!.kp).toMatch(/^\d+ to \d+$/);
  });

  it("VN-EXT-005: the storm under way and its Kp at the time", () => {
    expect(stormAt(sw, tdbFromIso("2024-05-10T12:00Z"))).toBeNull();
    const s = stormAt(sw, tdbFromIso("2024-05-11T01:00Z"))!;
    expect(s.storm.id).toBe("2024-05-10T15:00:00-GST-001");
    expect(s.kp).toBe(9);
  });

  it("VN-EXT-007: the L1 hour and Kp inside SWPC's span, none outside", () => {
    expect(windAt(sw, tdbFromIso("2026-11-27T22:30Z"))!.source).toBe("SOLAR1");
    expect(windAt(sw, tdbFromIso("2024-05-10T12:00Z"))).toBeNull();
    expect(kpAt(sw, tdbFromIso("2026-11-21T01:00Z"))!.kp).toBe(2.67);
    expect(sw.windSpan.start).toBe("2026-11-27T22:00Z");
  });
});
