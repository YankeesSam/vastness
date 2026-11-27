// VN-DAT-009, ADR-0007: the polite CelesTrak GP client. Same manners as the Horizons client (VN-DAT-002): one
// request in flight, at least 1 s between request starts, a request budget, the project User-Agent, a disk cache keyed
// by the SHA-256 of the URL, `--offline`. CelesTrak's own rules on top: never download the same data twice within
// its 2-hour update window (it answers 403), ask for gzip, and stop the run at the first non-200 response without
// retrying (after a 500 or 503, wait 15 minutes). Tests inject fetch, the clock and the cache folder.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const GP_API = "https://celestrak.org/NORAD/elements/gp.php";
/** Names the project only: no personal data in headers. */
export const USER_AGENT = "vastness-gp-pipeline (+https://github.com/YankeesSam/vastness)";
/** CelesTrak updates GP data once every 2 hours. */
export const UPDATE_WINDOW_MS = 2 * 3600 * 1000;

export function gpUrl(norad: number): string {
  return `${GP_API}?CATNR=${norad}&FORMAT=JSON`;
}

export function gpCacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export interface GpClientOptions {
  /** `.cache/celestrak` in the pipeline. */
  cacheDir: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  offline?: boolean;
  /**
   * Fetch again when the cached copy is older than CelesTrak's update window (the refresh job). Without it any
   * cached copy is used, so a rebuild reproduces the committed data byte for byte.
   */
  refresh?: boolean;
  budget?: number;
  minSpacingMs?: number;
}

export interface GpResponse {
  body: string;
  url: string;
  /** UTC instant of retrieval (ISO, seconds), from the response's own Date header. */
  retrieved: string;
  fromCache: boolean;
}

export class GpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpError";
  }
}

interface Meta {
  url: string;
  retrieved: string;
}

export class GpClient {
  private readonly o: Required<GpClientOptions>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  /** Set after the first non-200: the run stops (CelesTrak asks machine clients to). */
  private stopped: string | null = null;
  requests = 0;
  cacheHits = 0;

  constructor(options: GpClientOptions) {
    this.o = {
      fetch: (...a) => fetch(...a),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      offline: false,
      refresh: false,
      budget: 100,
      minSpacingMs: 1000,
      ...options,
    };
  }

  get(norad: number): Promise<GpResponse> {
    const run = this.queue.then(() => this.load(gpUrl(norad)));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(url: string): Promise<GpResponse> {
    const key = gpCacheKey(url);
    const body = join(this.o.cacheDir, `${key}.json`);
    const metaPath = join(this.o.cacheDir, `${key}.meta.json`);
    if (existsSync(body) && existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Meta;
      const age = this.o.now() - Date.parse(meta.retrieved);
      // Within the update window the data cannot have changed (and CelesTrak would refuse): always the cache.
      if (!this.o.refresh || age < UPDATE_WINDOW_MS) {
        this.cacheHits++;
        return { body: readFileSync(body, "utf8"), url, retrieved: meta.retrieved, fromCache: true };
      }
    }
    if (this.o.offline) throw new GpError(`offline and not cached (${url})`);
    if (this.stopped) throw new GpError(`stopped after ${this.stopped}; not requesting ${url}`);
    if (this.requests >= this.o.budget) throw new GpError(`request budget of ${this.o.budget} spent (${url})`);
    const wait = this.lastStart + this.o.minSpacingMs - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
    this.lastStart = this.o.now();
    this.requests++;
    const res = await this.o.fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Encoding": "gzip" },
    });
    if (res.status !== 200) {
      const after = res.status === 500 || res.status === 503 ? "; wait 15 minutes before trying again" : "";
      this.stopped = `HTTP ${res.status} from CelesTrak (${url})`;
      throw new GpError(`${this.stopped}${after}`);
    }
    const text = await res.text();
    const date = Date.parse(res.headers.get("date") ?? "");
    const retrieved = new Date(Number.isFinite(date) ? date : this.o.now()).toISOString().slice(0, 19) + "Z";
    mkdirSync(this.o.cacheDir, { recursive: true });
    writeFileSync(`${body}.tmp`, text);
    renameSync(`${body}.tmp`, body);
    writeFileSync(`${metaPath}.tmp`, `${JSON.stringify({ url, retrieved } satisfies Meta, null, 2)}\n`);
    renameSync(`${metaPath}.tmp`, metaPath);
    return { body: text, url, retrieved, fromCache: false };
  }
}
