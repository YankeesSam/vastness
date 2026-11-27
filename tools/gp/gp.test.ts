import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCatalog } from "../../src/core/catalog/schema.ts";
import { parseVectors, vectorParams } from "../ephem/horizons.ts";
import { GpClient, UPDATE_WINDOW_MS, USER_AGENT, gpUrl } from "./client.ts";
import {
  GP_CREDIT,
  catalogSatellites,
  fetchSatellites,
  issCheck,
  issQuery,
  parseGp,
  satellitesFile,
  worst,
  type SatellitesFile,
} from "./gp.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, "utf8");
const issBody = read("testdata/gp/25544.json");
const catalog = validateCatalog(JSON.parse(read("data/catalog.json")));

/** A fake fetch serving `bodies` by NORAD number; records each call. */
function fakeFetch(bodies: Record<number, string>, status = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const n = Number(/CATNR=(\d+)/.exec(url)![1]);
    return new Response(bodies[n] ?? "No GP data found", {
      status,
      headers: { date: "Fri, 27 Nov 2026 05:40:38 GMT" },
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function client(over: Partial<ConstructorParameters<typeof GpClient>[0]> = {}) {
  let t = Date.parse("2026-11-27T06:00:00Z");
  return new GpClient({
    cacheDir: mkdtempSync(join(tmpdir(), "gp-")),
    now: () => t,
    sleep: async (ms) => void (t += ms),
    ...over,
  });
}

describe("GP elements (VN-DAT-009)", () => {
  it("VN-DAT-009: parses CelesTrak's OMM JSON for the ISS", () => {
    const e = parseGp(issBody, 25544);
    expect(e.OBJECT_NAME).toBe("ISS (ZARYA)");
    expect(e.NORAD_CAT_ID).toBe(25544);
    expect(e.EPOCH).toBe("2026-11-26T22:39:22.268736");
    expect(e.MEAN_MOTION).toBeCloseTo(15.4962989, 7);
    expect(e.ELEMENT_SET_NO).toBe(999);
  });

  it("VN-DAT-009: rejects text answers, a record for another number and missing keywords", () => {
    expect(() => parseGp("No GP data found", 1)).toThrow(/NORAD 1: CelesTrak returned no elements: No GP data found/);
    expect(() => parseGp(issBody, 20580)).toThrow(/record is for NORAD 25544/);
    const noBstar = JSON.stringify([{ ...JSON.parse(issBody)[0], BSTAR: undefined }]);
    expect(() => parseGp(noBstar, 25544)).toThrow(/BSTAR/);
    expect(() => parseGp("[]", 25544)).toThrow(/one OMM record/);
  });

  it("VN-DAT-009: polite client: project User-Agent, gzip, 1 s spacing, cache, offline", async () => {
    const { f, calls } = fakeFetch({ 25544: issBody, 20580: issBody.replace("25544", "20580") });
    const starts: number[] = [];
    let t = 0;
    const dir = mkdtempSync(join(tmpdir(), "gp-"));
    const c = new GpClient({
      cacheDir: dir,
      fetch: (async (u: string, i?: RequestInit) => (starts.push(t), f(u, i))) as typeof fetch,
      now: () => t,
      sleep: async (ms) => void (t += ms),
    });
    await c.get(25544);
    await c.get(20580);
    const again = await c.get(25544);
    expect(calls.map((x) => x.url)).toEqual([gpUrl(25544), gpUrl(20580)]);
    expect(gpUrl(25544)).toBe("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON");
    expect(calls[0]!.headers["User-Agent"]).toBe(USER_AGENT);
    expect(calls[0]!.headers["Accept-Encoding"]).toBe("gzip");
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
    expect(again).toMatchObject({ fromCache: true, retrieved: "2026-11-27T05:40:38Z" });
    const off = new GpClient({ cacheDir: dir, offline: true, fetch: f });
    await expect(off.get(25544)).resolves.toMatchObject({ fromCache: true });
    await expect(off.get(1)).rejects.toThrow(/offline and not cached/);
  });

  it("VN-DAT-009: never fetches the same data twice within CelesTrak's 2-hour update window", async () => {
    const { f, calls } = fakeFetch({ 25544: issBody });
    let t = Date.parse("2026-11-27T05:40:38Z");
    const dir = mkdtempSync(join(tmpdir(), "gp-"));
    const opts = { cacheDir: dir, fetch: f, now: () => t, sleep: async () => {}, refresh: true };
    await new GpClient(opts).get(25544);
    t += UPDATE_WINDOW_MS - 1000;
    await new GpClient(opts).get(25544);
    expect(calls).toHaveLength(1);
    t += 2000;
    await new GpClient(opts).get(25544);
    expect(calls).toHaveLength(2);
  });

  it("VN-DAT-009: stops the run at the first non-200, without retrying, and says to wait after a 503", async () => {
    const { f, calls } = fakeFetch({}, 503);
    const c = client({ fetch: f });
    await expect(c.get(25544)).rejects.toThrow(/HTTP 503 from CelesTrak .*wait 15 minutes/);
    await expect(c.get(20580)).rejects.toThrow(/stopped after HTTP 503/);
    expect(calls).toHaveLength(1);
    const forbidden = client({ fetch: fakeFetch({}, 403).f });
    await expect(forbidden.get(25544)).rejects.toThrow(/HTTP 403/);
  });

  it("VN-CAT-007: the catalog's satellites are fetched serially; a wrong NORAD number fails by name", async () => {
    const entries = catalogSatellites(catalog as never);
    expect(entries.map((e) => e.norad)).toEqual([...entries.map((e) => e.norad)].sort((a, b) => a! - b!));
    const iss = entries.find((e) => e.norad === 25544)!;
    const recs = await fetchSatellites([iss], client({ fetch: fakeFetch({ 25544: issBody }).f }));
    expect(recs[0]).toMatchObject({
      id: -125544,
      norad: 25544,
      epoch: "2026-11-26T22:39:22.268736Z",
      retrieved: "2026-11-27T05:40:38Z",
      source: gpUrl(25544),
    });
    const wrong = { ...iss, norad: 20580, name: "Hubble Space Telescope", aliases: ["HST"] };
    const hubbleAsIss = issBody.replace("25544", "20580");
    await expect(fetchSatellites([wrong], client({ fetch: fakeFetch({ 20580: hubbleAsIss }).f }))).rejects.toThrow(
      /NORAD 20580: CelesTrak names it "ISS \(ZARYA\)", the catalog "Hubble Space Telescope"/,
    );
  });

  it("VN-DAT-009: data/satellites.json holds every catalog satellite with provenance, written deterministically", () => {
    const text = read("data/satellites.json");
    const file = JSON.parse(text) as SatellitesFile;
    expect(file.credit).toBe(GP_CREDIT);
    expect(file.frame).toBe("TEME");
    const want = catalogSatellites(catalog as never).map((e) => e.norad);
    expect(file.satellites.map((s) => s.norad)).toEqual(want);
    for (const s of file.satellites) {
      expect(s.id).toBe(-(100000 + s.norad));
      expect(s.omm.NORAD_CAT_ID).toBe(s.norad);
      expect(s.epoch).toBe(`${s.omm.EPOCH}Z`);
      expect(s.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(s.source).toBe(gpUrl(s.norad));
      expect(() => parseGp(JSON.stringify([s.omm]), s.norad)).not.toThrow();
    }
    expect(satellitesFile([...file.satellites].reverse())).toBe(text);
  });
});

describe("ISS against Horizons -125544 (VN-CAT-007)", () => {
  const omm = parseGp(issBody, 25544);
  const q = issQuery(omm.EPOCH);
  const body = read("testdata/horizons/iss-2026-11-26.json");
  const recs = parseVectors(body, JSON.stringify(vectorParams(q))).records;

  it("asks Horizons for the day after the element epoch, Earth-centred, every 10 minutes", () => {
    expect(q).toEqual({
      command: "-125544",
      center: "500@399",
      start: "2026-11-26 22:40",
      stop: "2026-11-27 22:40",
      step: "10 m",
    });
    expect(recs).toHaveLength(145);
  });

  it("VN-CAT-007: SGP4 through TEME -> J2000 ecliptic agrees with Horizons over one day", () => {
    const rows = issCheck(omm, recs);
    // Frames: a rotation error shows across the track and in the radius. Measured 0.25 km radial, 0.13 km cross.
    expect(worst(rows, "radialKm")).toBeLessThan(1);
    expect(worst(rows, "crossKm")).toBeLessThan(1);
    // Along the track, GP mean elements and Horizons' predicted ISS trajectory drift apart: measured 6.8 km at the
    // epoch growing to 22.7 km after a day (a mean-motion difference of 2e-5). A time-scale slip shows here at
    // 7.7 km per second: a missing TT-UTC (69 s) would be about 530 km.
    expect(worst(rows, "alongKm")).toBeLessThan(30);
    expect(Math.abs(rows[0]!.alongKm)).toBeLessThan(10);
  });

  it("VN-CAT-007: the check catches a frame or time error", () => {
    // A minute's slip in the element epoch: hundreds of km along the track.
    const late = issCheck({ ...omm, EPOCH: "2026-11-26T22:40:22.268736" }, recs);
    expect(worst(late, "alongKm")).toBeGreaterThan(300);
    // The node off by 0.1 degree: about 12 km across the track.
    const turned = issCheck({ ...omm, RA_OF_ASC_NODE: omm.RA_OF_ASC_NODE + 0.1 }, recs);
    expect(worst(turned, "crossKm")).toBeGreaterThan(5);
  });
});
