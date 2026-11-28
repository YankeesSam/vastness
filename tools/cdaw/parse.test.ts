import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCmes } from "../donki/parse";
import { matchCatalog, parseCatalog, skyPa } from "./parse";

const text = readFileSync(new URL("../../testdata/cdaw/univ-sample.txt", import.meta.url), "utf8");
const donki = parseCmes(
  JSON.parse(readFileSync(new URL("../../testdata/donki/cme-2024-05-08.json", import.meta.url), "utf8")),
).cmes;

describe("CDAW catalog (T-100)", () => {
  const { rows, updated } = parseCatalog(text);

  it("VN-EXT-006: reads rows, halos, missing values and the catalog's uncertainty marks", () => {
    expect(updated).toBe("2026-11-19");
    const first = rows[0]!;
    expect(first).toMatchObject({ time: "1996-01-11T00:14:36Z", pa: 267, width: 18, linearSpeed: 499, mass: null });
    const halo = rows.find((r) => r.time === "2024-05-08T05:36:06Z")!;
    expect(halo).toMatchObject({ pa: null, width: 360, mass: 2.7e16, massUncertain: true, energy: 3.8e31 });
    const plain = rows.find((r) => r.time === "2024-05-08T19:24:06Z")!;
    expect(plain).toMatchObject({ mass: 2.5e14, massUncertain: false, energyUncertain: false, remarks: "" });
    expect(rows.find((r) => r.time === "1996-01-22T03:11:01Z")!.remarks).toBe("Very Poor Event; Only C3");
  });

  it("VN-EXT-006: matches DONKI CMEs by time and position angle, nearest first, and flags poor values", () => {
    const { matches, unmatched } = matchCatalog(donki, rows);
    const m = new Map(matches.map((x) => [x.id, x]));
    // DONKI 05:36 is the LASCO halo first seen at 05:36:06.
    expect(m.get("2024-05-08T05:36:00-CME-001")).toMatchObject({
      cdaw: "2024-05-08T05:36:06Z",
      dtMin: 0,
      mass: 2.7e16,
      poor: true,
    });
    // DONKI 19:12 (N10E20, heading east): the partial halo at PA 82 at 19:12:06, not the PA 217 CME at 19:24.
    expect(m.get("2024-05-08T19:12:00-CME-001")!.cdaw).toBe("2024-05-08T19:12:06Z");
    expect(unmatched.every((id) => !m.has(id))).toBe(true);
    expect(matches.length + unmatched.length).toBe(donki.length);
  });

  it("projects a Stonyhurst direction to a sky position angle", () => {
    expect(skyPa(0, 90).pa).toBeCloseTo(270); // west limb
    expect(skyPa(0, -90).pa).toBeCloseTo(90); // east limb
    expect(skyPa(90, 0).pa).toBeCloseTo(0); // north
    expect(skyPa(0, 0).r).toBeCloseTo(0);
  });
});
