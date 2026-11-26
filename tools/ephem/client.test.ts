import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClientError, HorizonsClient, USER_AGENT, cacheKey, type ClientOptions } from "./client.ts";
import { canonicalQuery, parseVectors, vectorParams } from "./horizons.ts";
import { FIXTURES } from "./record.ts";

const EARTH = vectorParams(FIXTURES["earth-2000-01"]!);
const MOON = vectorParams(FIXTURES["moon-geocentric-2000-01"]!);
const VOYAGER = vectorParams(FIXTURES["voyager1-2000-01"]!);
const body = (name: string): string =>
  readFileSync(new URL(`../../testdata/horizons/${name}.json`, import.meta.url), "utf8");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Call {
  url: string;
  start: number;
  headers: Record<string, string>;
}

/** A virtual clock, and a fetch that answers from a script and records when each call started. */
function harness(script: Array<number | "neterr">, extra: Partial<ClientOptions> = {}) {
  let clock = 1_000_000;
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const responses = [...script];
  const fakeFetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: input, start: clock, headers: (init?.headers ?? {}) as Record<string, string> });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    clock += 300; // response time
    inFlight--;
    const next = responses.shift() ?? 200;
    if (next === "neterr") throw new TypeError("fetch failed");
    return new Response(next === 200 ? body("earth-2000-01") : "busy", {
      status: next,
      headers: { date: "Thu, 26 Nov 2026 23:21:09 GMT" },
    });
  }) as unknown as typeof fetch;
  const cacheDir = mkdtempSync(join(tmpdir(), "vastness-cache-"));
  dirs.push(cacheDir);
  const client = new HorizonsClient({
    cacheDir,
    fetch: fakeFetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0.5,
    ...extra,
  });
  return { client, calls, sleeps, cacheDir, maxInFlight: () => maxInFlight, now: () => clock };
}

describe("polite Horizons client (T-016)", () => {
  it("VN-DAT-002: one request in flight and at least 1 s between request starts", async () => {
    const h = harness([200, 200, 200]);
    await Promise.all([h.client.get(EARTH), h.client.get(MOON), h.client.get(VOYAGER)]);
    expect(h.calls).toHaveLength(3);
    expect(h.maxInFlight()).toBe(1);
    for (let i = 1; i < h.calls.length; i++) {
      expect(h.calls[i]!.start - h.calls[i - 1]!.start).toBeGreaterThanOrEqual(1000);
    }
    // Arrival order is kept.
    expect(h.calls.map((c) => c.url.includes("COMMAND='399'"))).toEqual([true, false, false]);
  });

  it("VN-DAT-002: a descriptive User-Agent naming the project, with no personal data", async () => {
    const h = harness([200]);
    await h.client.get(EARTH);
    const ua = h.calls[0]!.headers["User-Agent"];
    expect(ua).toBe(USER_AGENT);
    expect(ua).toMatch(/^vastness-ephemeris-pipeline \(\+https:\/\/github\.com\/YankeesSam\/vastness\)$/);
    expect(ua).not.toMatch(/@/);
  });

  it("VN-DAT-002: exponential backoff with jitter on 503 and network errors, then success", async () => {
    const h = harness([503, "neterr", 503, 200], { baseBackoffMs: 2000 });
    const r = await h.client.get(EARTH);
    expect(r.fromCache).toBe(false);
    expect(h.calls).toHaveLength(4);
    // random() = 0.5 gives 25 % jitter: 2000, 4000, 8000 ms times 1.25.
    expect(h.sleeps.filter((s) => s >= 2000)).toEqual([2500, 5000, 10000]);
    expect(h.client.requests).toBe(4);
  });

  it("VN-DAT-002: gives up after the retry limit, quoting the query", async () => {
    const h = harness([503, 503, 503], { maxRetries: 2 });
    await expect(h.client.get(EARTH)).rejects.toThrow(/HTTP 503 after 3 attempts \(query: CENTER=/);
    expect(h.calls).toHaveLength(3);
  });

  it("VN-DAT-002: other HTTP errors are not retried", async () => {
    const h = harness([400]);
    await expect(h.client.get(EARTH)).rejects.toThrow(ClientError);
    expect(h.calls).toHaveLength(1);
  });

  it("VN-DAT-002: the request budget per run counts retries and stops the run", async () => {
    const h = harness([503, 200, 200], { budget: 2 });
    await h.client.get(EARTH); // 503 then 200: two requests
    await expect(h.client.get(MOON)).rejects.toThrow(/request budget of 2 spent/);
    expect(h.calls).toHaveLength(2);
    // A failed call does not jam the queue: a cached query still answers.
    await expect(h.client.get(EARTH)).resolves.toMatchObject({ fromCache: true });
  });

  it("VN-DAT-003: responses are cached on disk by the SHA-256 of the canonical query, body exactly", async () => {
    const h = harness([200]);
    const first = await h.client.get(EARTH);
    const key = createHash("sha256").update(canonicalQuery(EARTH)).digest("hex");
    expect(cacheKey(EARTH)).toBe(key);
    expect(readFileSync(join(h.cacheDir, `${key}.json`), "utf8")).toBe(body("earth-2000-01"));
    expect(existsSync(join(h.cacheDir, `${key}.json.tmp`))).toBe(false);
    expect(first.retrieved).toBe("2026-11-26"); // the response's own Date header, UTC date only
    expect(parseVectors(first.body, first.query).records).toHaveLength(4);
  });

  it("VN-DAT-003: a rerun with a warm cache makes no request", async () => {
    const h = harness([200, 200]);
    await h.client.get(EARTH);
    await h.client.get(MOON);
    const rerun = new HorizonsClient({
      cacheDir: h.cacheDir,
      fetch: (() => {
        throw new Error("no request expected");
      }) as typeof fetch,
    });
    const [a, b] = await Promise.all([rerun.get(EARTH), rerun.get(MOON)]);
    expect([a.fromCache, b.fromCache]).toEqual([true, true]);
    expect(a.retrieved).toBe("2026-11-26");
    expect(rerun.requests).toBe(0);
    expect(rerun.cacheHits).toBe(2);
  });

  it("VN-DAT-003: --offline turns a miss into an error and still serves hits", async () => {
    const h = harness([200]);
    await h.client.get(EARTH);
    const offline = new HorizonsClient({ cacheDir: h.cacheDir, offline: true });
    await expect(offline.get(EARTH)).resolves.toMatchObject({ fromCache: true });
    await expect(offline.get(MOON)).rejects.toThrow(/offline and not cached \(query: CENTER='500%40399'/);
    expect(offline.requests).toBe(0);
  });

  it("VN-DAT-007: the test setup makes the global fetch throw", () => {
    expect(() => fetch("https://ssd.jpl.nasa.gov/api/horizons.api")).toThrow(/VN-DAT-007/);
  });
});
