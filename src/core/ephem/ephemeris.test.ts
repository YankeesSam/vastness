import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeEphemeris } from "./format";
import { createEphemeris, type ChunkLoader, type EphemerisManifest } from "./ephemeris";

// Synthetic files test the mechanics (chunk index, lazy loading, composition); the committed F3 files are checked
// against held-out Horizons samples (F2), never against this code's own output.

/** A degree-1 file: x = a + b tau per segment, y = 2, z = -1, over [t0, t1] in `segs` equal segments. */
function linearFile(objectId: number, centerId: number, t0: number, t1: number, a: number, b: number, segs = 2) {
  const w = (t1 - t0) / segs;
  return writeEphemeris({
    objectId,
    centerId,
    degree: 1,
    segments: Array.from({ length: segs }, (_, i) => {
      // Continuous line x(t) = a + b (t - t0) / (t1 - t0) expressed per segment.
      const s0 = t0 + i * w;
      const s1 = s0 + w;
      const x0 = a + (b * (s0 - t0)) / (t1 - t0);
      const x1 = a + (b * (s1 - t0)) / (t1 - t0);
      return { t0: s0, t1: s1, coeffs: [(x0 + x1) / 2, (x1 - x0) / 2, 2, 0, -1, 0] };
    }),
  });
}

function synthetic() {
  const files = new Map<string, Uint8Array>([
    ["399/0.bin", linearFile(399, 10, 0, 100, 1000, 100)],
    ["399/100.bin", linearFile(399, 10, 100, 200, 1100, 100)],
    ["301/0.bin", linearFile(301, 399, 0, 100, 10, 1)],
    ["301/100.bin", linearFile(301, 399, 100, 200, 11, 1)],
  ]);
  const manifest: EphemerisManifest = {
    objects: [
      { id: 10, name: "Sun", origin: true },
      {
        id: 301,
        name: "Moon",
        center: 399,
        chunks: [
          { file: "301/0.bin", coverage: { start: 0, end: 100 } },
          { file: "301/100.bin", coverage: { start: 100, end: 200 } },
        ],
      },
      {
        id: 399,
        name: "Earth",
        center: 10,
        chunks: [
          { file: "399/100.bin", coverage: { start: 100, end: 200 } },
          { file: "399/0.bin", coverage: { start: 0, end: 100 } },
        ],
      },
    ],
  };
  const requested: string[] = [];
  const loader: ChunkLoader = async (file) => {
    requested.push(file);
    const b = files.get(file);
    if (!b) throw new Error(`no file ${file}`);
    return b;
  };
  return { manifest, loader, requested };
}

describe("runtime ephemeris: chunk index and injected loader", () => {
  it("VN-EPH-010: chunksAt names only the chunk covering t, with the parent's chunk", () => {
    const { manifest, loader } = synthetic();
    const e = createEphemeris(manifest, loader);
    expect(e.ids).toEqual([10, 301, 399]);
    expect(e.center(301)).toBe(399);
    expect(e.center(10)).toBeNull();
    expect(e.coverage(399)).toEqual({ start: 0, end: 200 });
    expect(e.chunksAt(50, [301]).map((c) => c.file)).toEqual(["301/0.bin", "399/0.bin"]);
    expect(
      e
        .chunksAt(150)
        .map((c) => c.file)
        .sort(),
    ).toEqual(["301/100.bin", "399/100.bin"]);
    expect(e.chunksAt(250)).toEqual([]);
  });

  it("VN-EPH-010: load fetches the covering chunks once; other chunks are not fetched", async () => {
    const { manifest, loader, requested } = synthetic();
    const e = createEphemeris(manifest, loader);
    await e.load(50);
    await e.load(60);
    expect(requested.sort()).toEqual(["301/0.bin", "399/0.bin"]);
    const out = new Float64Array(6);
    expect(e.relativeState(399, 50, out)).toBe("ok");
    expect(out[0]).toBeCloseTo(1050, 9);
    expect(out[3]).toBeCloseTo(1, 12); // km/s: 100 km over 100 s
  });

  it("VN-EPH-010: a chunk not yet loaded is requested lazily and reported as loading, then evaluates", async () => {
    const { manifest, loader, requested } = synthetic();
    const e = createEphemeris(manifest, loader);
    const out = new Float64Array(6);
    expect(e.relativeState(399, 150, out)).toBe("loading");
    expect(e.relativeState(399, 151, out)).toBe("loading");
    expect(requested).toEqual(["399/100.bin"]);
    await e.load(150, [399]);
    expect(requested).toEqual(["399/100.bin"]);
    expect(e.relativeState(399, 150, out)).toBe("ok");
    expect(out[0]).toBeCloseTo(1150, 9);
    expect(e.relativeState(399, 250, out)).toBe("outside");
    expect(e.relativeState(399, -1, out)).toBe("outside");
  });

  it("VN-EPH-010: peek evaluates loaded chunks only and never requests one", async () => {
    const { manifest, loader, requested } = synthetic();
    const e = createEphemeris(manifest, loader);
    const out = new Float64Array(6);
    expect(e.peek(399, 150, out)).toBe("loading");
    expect(e.peek(301, 50, out)).toBe("loading");
    expect(requested).toEqual([]);
    await e.load(50);
    expect(e.peek(301, 50, out)).toBe("ok");
    expect(out[0]).toBeCloseTo(1050 + 10.5, 9); // Earth plus the Moon relative to it
    expect(e.peek(399, 150, out)).toBe("loading");
    expect(requested.sort()).toEqual(["301/0.bin", "399/0.bin"]);
    expect(e.state(399, 150, out)).toBe("loading"); // state still requests lazily
    expect(requested).toContain("399/100.bin");
  });

  it("a time on a chunk boundary evaluates from either side to the same state", async () => {
    const { manifest, loader } = synthetic();
    const e = createEphemeris(manifest, loader);
    await e.load(99);
    await e.load(100);
    const a = new Float64Array(6);
    e.relativeState(399, 100, a);
    expect(a[0]).toBeCloseTo(1100, 9);
  });

  it("a failed load reports error and can be retried", async () => {
    const { manifest } = synthetic();
    let fail = true;
    const e = createEphemeris(manifest, async () => {
      if (fail) throw new Error("offline");
      return linearFile(399, 10, 0, 100, 1000, 100);
    });
    await expect(e.load(50, [399])).rejects.toThrow("offline");
    const out = new Float64Array(6);
    expect(e.relativeState(399, 50, out)).toBe("error");
    fail = false;
    await e.load(50, [399]);
    expect(e.relativeState(399, 50, out)).toBe("ok");
  });

  it("rejects a chunk that holds a different object or coverage than the manifest says", async () => {
    const { manifest } = synthetic();
    const e = createEphemeris(manifest, async () => linearFile(499, 10, 0, 100, 0, 0));
    await expect(e.load(50, [399])).rejects.toThrow(/holds object 499/);
  });

  it("rejects manifests with unknown centres, duplicates or gaps", () => {
    const loader: ChunkLoader = async () => new Uint8Array();
    expect(() => createEphemeris({ objects: [{ id: 301, name: "Moon", center: 399 }] }, loader)).toThrow(/centre 399/);
    expect(() =>
      createEphemeris(
        {
          objects: [
            { id: 10, name: "Sun", origin: true },
            { id: 10, name: "Sun", origin: true },
          ],
        },
        loader,
      ),
    ).toThrow(/twice/);
    expect(() =>
      createEphemeris(
        {
          objects: [
            { id: 10, name: "Sun", origin: true },
            {
              id: 399,
              name: "Earth",
              center: 10,
              chunks: [
                { file: "a", coverage: { start: 0, end: 10 } },
                { file: "b", coverage: { start: 11, end: 20 } },
              ],
            },
          ],
        },
        loader,
      ),
    ).toThrow(/contiguous/);
  });
});

describe("runtime ephemeris: body tree composition", () => {
  it("VN-EPH-009: the Moon is stored relative to Earth and composed into a heliocentric state", async () => {
    const { manifest, loader } = synthetic();
    const e = createEphemeris(manifest, loader);
    await e.load(25);
    const moon = new Float64Array(8);
    expect(e.state(301, 25, moon, 2)).toBe("ok");
    // Earth x = 1025, y = 2, z = -1, vx = 1; Moon geocentric x = 10.25, y = 2, z = -1, vx = 0.01.
    expect(moon[2]).toBeCloseTo(1035.25, 9);
    expect(moon[3]).toBeCloseTo(4, 12);
    expect(moon[4]).toBeCloseTo(-2, 12);
    expect(moon[5]).toBeCloseTo(1.01, 12);
    const rel = new Float64Array(6);
    expect(e.relativeState(301, 25, rel)).toBe("ok");
    expect(rel[0]).toBeCloseTo(10.25, 9);
    const sun = new Float64Array(6).fill(7);
    expect(e.state(10, 25, sun)).toBe("ok");
    expect([...sun]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("VN-EPH-009: a composed state waits for the parent's chunk", async () => {
    const { manifest, loader } = synthetic();
    const e = createEphemeris(manifest, loader);
    await e.load(25, [301]);
    const out = new Float64Array(6);
    expect(e.state(301, 25, out)).toBe("ok");
    // At t = 125 the Moon's own chunk is loaded but Earth's is not: the composed state is still loading.
    expect(e.relativeState(301, 125, out)).toBe("loading");
    await new Promise((r) => setTimeout(r, 0));
    expect(e.relativeState(301, 125, out)).toBe("ok");
    expect(e.state(301, 125, out)).toBe("loading");
    await new Promise((r) => setTimeout(r, 0));
    expect(e.state(301, 125, out)).toBe("ok");
  });
});

describe("runtime ephemeris over the committed files (F3) against Horizons (F2)", () => {
  const root = new URL("../../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("public/ephem/manifest.json", root), "utf8")) as EphemerisManifest;
  const loader: ChunkLoader = async (file) => readFileSync(new URL(`public/ephem/${file}`, root));
  const t2025 = 25 * 365.25 * 86400;

  it("VN-EPH-010: the Sun, planets and Moon for the current decade are under 1 MB", () => {
    const e = createEphemeris(manifest, loader);
    const bodies = e.ids.filter((id) => id > 0); // spacecraft (negative IDs) stream separately (T-046)
    const chunks = e.chunksAt(t2025, bodies);
    expect(chunks.length).toBe(bodies.length - 1); // every body but the origin
    const bytes = chunks.reduce((s, c) => s + (c.bytes ?? 0), 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(1_000_000);
  });

  it("VN-EPH-005: relative states agree with held-out Horizons samples within each object's tolerance", async () => {
    const e = createEphemeris(manifest, loader);
    const out = new Float64Array(6);
    for (const id of e.ids) {
      if (id === 10) continue;
      const ref = JSON.parse(readFileSync(new URL(`testdata/reference/${id}.json`, root), "utf8")) as {
        center: number;
        samples: Array<{ t: number; x: number; y: number; z: number }>;
      };
      expect(ref.center).toBe(e.center(id));
      const tol = manifest.objects.find((o) => o.id === id) as unknown as { tolerance_km: number };
      for (const s of ref.samples.slice(0, 12)) {
        await e.load(s.t, [id]);
        expect(e.relativeState(id, s.t, out)).toBe("ok");
        expect(Math.hypot(out[0]! - s.x, out[1]! - s.y, out[2]! - s.z)).toBeLessThan(tol.tolerance_km);
      }
    }
  });

  it("VN-EPH-009: the heliocentric Moon is Earth plus the geocentric Moon and lies about 384,400 km from Earth", async () => {
    const e = createEphemeris(manifest, loader);
    await e.load(t2025);
    const moon = new Float64Array(6);
    const earth = new Float64Array(6);
    const geo = new Float64Array(6);
    expect(e.state(301, t2025, moon)).toBe("ok");
    expect(e.state(399, t2025, earth)).toBe("ok");
    expect(e.relativeState(301, t2025, geo)).toBe("ok");
    for (let k = 0; k < 6; k++) expect(moon[k]).toBeCloseTo(earth[k]! + geo[k]!, 6);
    const d = Math.hypot(moon[0]! - earth[0]!, moon[1]! - earth[1]!, moon[2]! - earth[2]!);
    expect(d).toBeGreaterThan(356_000); // perigee/apogee extremes
    expect(d).toBeLessThan(407_000);
  });
});
