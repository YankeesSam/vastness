import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nasaApiKey, PoliteClient, USER_AGENT } from "./polite";

function fake(status = 200, body = "[]") {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(body, { status, headers: { date: "Fri, 27 Nov 2026 12:00:00 GMT" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("polite client (T-086)", () => {
  it("VN-DAT-002: one request at a time, 1 s apart, project User-Agent, cached by URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polite-"));
    const { f, calls } = fake();
    let t = 0;
    const sleeps: number[] = [];
    const c = new PoliteClient({
      cacheDir: dir,
      name: "TEST",
      fetch: f,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await Promise.all([c.get("https://x/a"), c.get("https://x/b")]);
    expect(calls.map((x) => x.url)).toEqual(["https://x/a", "https://x/b"]);
    expect(sleeps).toEqual([1000]);
    expect(calls[0]!.headers["User-Agent"]).toBe(USER_AGENT);
    const again = await c.get("https://x/a");
    expect(again.fromCache).toBe(true);
    expect(again.retrieved).toBe("2026-11-27T12:00:00Z");
    expect(c.requests).toBe(2);
  });

  it("VN-DAT-002: a secret goes on the request only, never into the cache or a message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polite-"));
    const { f, calls } = fake();
    const c = new PoliteClient({ cacheDir: dir, name: "TEST", fetch: f, sleep: async () => {} });
    const r = await c.get("https://x/a?b=1", { api_key: "SECRET123" });
    expect(calls[0]!.url).toBe("https://x/a?b=1&api_key=SECRET123");
    expect(r.url).toBe("https://x/a?b=1");
    for (const name of readdirSync(dir)) expect(readFileSync(join(dir, name), "utf8")).not.toContain("SECRET123");
    const bad = new PoliteClient({ cacheDir: dir, name: "TEST", fetch: fake(404).f, sleep: async () => {} });
    await expect(bad.get("https://x/z", { api_key: "SECRET123" })).rejects.toThrow(/HTTP 404 from TEST/);
    await expect(bad.get("https://x/y", { api_key: "SECRET123" })).rejects.not.toThrow(/SECRET123/);
  });

  it("VN-DAT-002: stops at the first non-200, honours offline and the budget", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polite-"));
    const bad = fake(503);
    const c = new PoliteClient({ cacheDir: dir, name: "TEST", fetch: bad.f, sleep: async () => {} });
    await expect(c.get("https://x/1")).rejects.toThrow(/HTTP 503/);
    await expect(c.get("https://x/2")).rejects.toThrow(/stopped after/);
    expect(bad.calls).toHaveLength(1);
    const off = new PoliteClient({ cacheDir: dir, name: "TEST", offline: true });
    await expect(off.get("https://x/3")).rejects.toThrow(/offline/);
    const b = new PoliteClient({ cacheDir: dir, name: "TEST", fetch: fake().f, budget: 1, sleep: async () => {} });
    await b.get("https://x/4");
    await expect(b.get("https://x/5")).rejects.toThrow(/budget/);
  });

  it("reads the NASA API key from the environment first, then .env", () => {
    expect(nasaApiKey({ NASA_API_KEY: "A" }, "NASA_API_KEY=B")).toBe("A");
    expect(nasaApiKey({}, "X=1\nNASA_API_KEY='B'\n")).toBe("B");
    expect(nasaApiKey({}, null)).toBeNull();
  });
});

describe("records JSON (T-086)", () => {
  it("VN-GEN-010: sorted keys, one record per line, parses back", async () => {
    const { recordsJson } = await import("./json");
    const s = recordsJson({ b: [{ y: 1, x: 2 }, { x: 3 }], a: "z", c: [] });
    expect(s).toBe('{\n"a":"z",\n"b":[\n{"x":2,"y":1},\n{"x":3}\n],\n"c":[]\n}\n');
    expect(JSON.parse(s)).toEqual({ a: "z", b: [{ x: 2, y: 1 }, { x: 3 }], c: [] });
  });
});

describe("binary bodies (T-104)", () => {
  it("VN-DAT-002: an image is cached as base64 and comes back byte for byte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polite-"));
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const f = (async () => new Response(bytes, { status: 200 })) as unknown as typeof fetch;
    const c = new PoliteClient({ cacheDir: dir, name: "T", fetch: f, sleep: async () => {} });
    const a = await c.get("https://x/i.png", {}, true);
    const b = await c.get("https://x/i.png", {}, true);
    expect(b.fromCache).toBe(true);
    expect([...Buffer.from(a.body, "base64")]).toEqual([...bytes]);
    expect(b.body).toBe(a.body);
  });
});
