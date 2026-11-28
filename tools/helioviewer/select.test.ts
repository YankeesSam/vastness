import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DonkiFile } from "../../src/core/spaceweather/types";
import {
  closestUrl,
  fileName,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_BYTES,
  pngSize,
  readClosest,
  screenshotUrl,
  selectDates,
  SIZE_PX,
  verifyImage,
  type SunManifest,
} from "./select";

const root = new URL("../../", import.meta.url);

describe("Helioviewer selection (T-104)", () => {
  const donki = {
    cmes: [
      { id: "2024-05-08T05:36:00-CME-001", start: "2024-05-08T05:36Z" },
      { id: "2024-05-09T09:24:00-CME-001", start: "2024-05-09T09:24Z" },
    ],
    storms: [
      {
        id: "g1",
        start: "2024-05-10T15:00Z",
        kpMax: 9,
        kp: [],
        cmes: ["2024-05-08T05:36:00-CME-001", "2024-05-09T09:24:00-CME-001"],
      },
      { id: "g2", start: "2024-06-01T00:00Z", kpMax: 6, kp: [], cmes: [] },
      { id: "g3", start: "2024-07-01T03:00Z", kpMax: 8, kp: [], cmes: [] },
    ],
  } as unknown as DonkiFile;

  it("VN-EXT-009: storms of Kp 8 and more at their latest linked eruption, and a quarterly series", () => {
    const w = selectDates(donki, "2024-12-31");
    expect(w.find((x) => x.date === "2024-05-09T09:24Z")!.why).toMatch(/Kp 9 storm of 2024-05-10/);
    expect(w.some((x) => x.why.includes("Kp 6"))).toBe(false);
    // a storm on a quarter day wins over the series image
    expect(w.filter((x) => x.date.startsWith("2024-07-01"))).toEqual([
      { date: "2024-07-01T03:00Z", why: "eruption before the Kp 8 storm of 2024-07-01" },
    ]);
    expect(w[0]!.date).toBe("2010-07-01T00:00Z");
    expect(w.at(-1)!.date).toBe("2024-10-01T00:00Z");
    expect(w.map((x) => x.date)).toEqual([...w.map((x) => x.date)].sort());
  });

  it("VN-EXT-009: requests SDO AIA 171 at 256 px without a watermark; reads the image time and disk size", () => {
    const u = new URL(screenshotUrl("2024-05-09T09:24Z"));
    expect(u.searchParams.get("date")).toBe("2024-05-09T09:24:00Z");
    expect(u.searchParams.get("layers")).toBe("[SDO,AIA,AIA,171,1,100]");
    expect(u.searchParams.get("watermark")).toBe("false");
    expect(u.searchParams.get("width")).toBe(String(SIZE_PX));
    expect(closestUrl("2024-05-09T09:24Z")).toContain("sourceId=10");
    // Helioviewer's answer for 2024-05-10T12:00 (recorded 2026-11-28)
    const c = readClosest(
      '{"id":"156611963","date":"2024-05-10 12:00:09","name":"AIA 171","scale":0.6059792067733836,"rsun":1583.6266}',
    );
    expect(c.imageDate).toBe("2024-05-10T12:00:09Z");
    // 1583.6 px x 0.606 arcsec = 959.6 arcsec, at 9.6 arcsec per px over a 128 px half-width
    expect(c.diskFraction).toBeCloseTo(0.781, 3);
    expect(fileName("2024-05-09T09:24Z")).toBe("20240509-0924.png");
  });

  it("VN-DOC-002, VN-PRF-004: every file in public/sun is in data/sun.json, matches it, and fits the budget", () => {
    if (!existsSync(new URL("data/sun.json", root))) return;
    const m = JSON.parse(readFileSync(new URL("data/sun.json", root), "utf8")) as SunManifest;
    expect(readdirSync(new URL("public/sun/", root)).sort()).toEqual(m.images.map((i) => i.file).sort());
    let total = 0;
    for (const e of m.images) {
      const b = new Uint8Array(readFileSync(new URL(`public/sun/${e.file}`, root)));
      expect(verifyImage(e, b)).toEqual([]);
      expect(pngSize(b)).toEqual({ width: SIZE_PX, height: SIZE_PX });
      expect(e.bytes).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
      total += e.bytes;
    }
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
    expect(m.credit).toContain("Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams");
  });
});
