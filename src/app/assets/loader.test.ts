import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-046 (VN-UI-005, VN-PRF-004): the first frame waits only for the planets' chunks; spacecraft chunks stream in
// after it, and the loader reports how many chunk downloads are in flight for the quiet indicator.
// fetch is replaced by a reader of public/ (own-origin files on disk), so nothing touches the network.

const PUBLIC = join(process.cwd(), "public");
const T_2026 = 820_497_669.184; // 2026-01-01T00:00:00Z as TDB seconds since J2000

let requested: string[] = [];
let release: (() => void)[] = [];
let hold = false;

beforeEach(() => {
  vi.resetModules();
  requested = [];
  release = [];
  hold = false;
  vi.stubGlobal("fetch", async (url: URL) => {
    const path = url.pathname.replace(/^\//, "");
    requested.push(path);
    if (hold && path.endsWith(".bin")) await new Promise<void>((r) => release.push(r));
    const bytes = readFileSync(join(PUBLIC, path));
    return new Response(bytes);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const chunks = () => requested.filter((p) => p.endsWith(".bin"));
const isCraft = (p: string) => /^ephem\/-\d+\//.test(p);

describe("asset loader", () => {
  it("VN-UI-005, VN-PRF-004: the first-frame preload fetches the planets' chunks and no spacecraft chunk", async () => {
    const { preloadEphemeris } = await import("./loader");
    const eph = await preloadEphemeris(T_2026);
    expect(chunks().length).toBeGreaterThan(0);
    expect(chunks().filter(isCraft)).toEqual([]);
    const out = new Float64Array(6);
    expect(eph.state(499, T_2026, out)).toBe("ok"); // Mars is ready for the first frame
  });

  it("VN-UI-005: spacecraft chunks stream after the first frame and the in-flight count goes up and back to 0", async () => {
    const { chunkActivity, preloadEphemeris, streamSpacecraft } = await import("./loader");
    const eph = await preloadEphemeris(T_2026);
    const seen: number[] = [];
    const off = chunkActivity.subscribe((n) => seen.push(n));
    hold = true;
    const done = streamSpacecraft(eph, T_2026);
    await vi.waitFor(() => expect(chunkActivity.pending()).toBeGreaterThan(0));
    expect(eph.state(-170, T_2026, new Float64Array(6))).toBe("loading"); // JWST not in memory yet
    hold = false;
    await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
    for (const r of release) r();
    // later requests may queue behind the first ones: keep releasing until the stream resolves
    const drain = setInterval(() => release.splice(0).forEach((r) => r()), 5);
    await done;
    clearInterval(drain);
    off();
    expect(chunks().filter(isCraft).length).toBeGreaterThan(0);
    expect(chunkActivity.pending()).toBe(0);
    expect(Math.max(...seen)).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(0);
    expect(eph.state(-170, T_2026, new Float64Array(6))).toBe("ok");
  });

  it("VN-UI-005: a failed chunk still brings the count back to 0", async () => {
    const { chunkActivity, loadAsset } = await import("./loader");
    vi.stubGlobal("fetch", async () => new Response("no", { status: 404 }));
    await expect(loadAsset("ephem/missing.bin")).rejects.toThrow(/404/);
    expect(chunkActivity.pending()).toBe(0);
  });
});
