// T-086, T-100, T-102, T-104: the polite client the space weather sources share (DONKI, CDAW, SWPC, Helioviewer).
// Same manners as the Horizons and CelesTrak clients (VN-DAT-002): one request in flight, at least 1 s between
// request starts, a request budget, the project User-Agent and no personal data in headers, a disk cache keyed by
// the SHA-256 of the URL, `--offline`, and the run stops at the first non-200 without retrying. Secrets (the NASA
// API key) are passed apart from the URL: they never reach the cache key, the cache metadata or an error message.
// Tests inject fetch, the clock and the cache folder.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Names the project only. */
export const USER_AGENT = "vastness-spaceweather-pipeline (+https://github.com/YankeesSam/vastness)";

export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export interface PoliteOptions {
  /** e.g. `.cache/donki`. */
  cacheDir: string;
  /** Short source name for messages ("DONKI"). */
  name: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  offline?: boolean;
  /** Fetch again even when cached (a refresh run). Without it any cached copy is used: rebuilds are reproducible. */
  refresh?: boolean;
  budget?: number;
  minSpacingMs?: number;
  /** Abort a request after this long (ms). */
  timeoutMs?: number;
}

export interface PoliteResponse {
  body: string;
  /** The URL without secrets. */
  url: string;
  /** UTC instant of retrieval (ISO, seconds), from the response's own Date header. */
  retrieved: string;
  fromCache: boolean;
}

export class PoliteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoliteError";
  }
}

interface Meta {
  url: string;
  retrieved: string;
}

export class PoliteClient {
  private readonly o: Required<PoliteOptions>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  private stopped: string | null = null;
  requests = 0;
  cacheHits = 0;

  constructor(options: PoliteOptions) {
    this.o = {
      fetch: (...a) => fetch(...a),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      offline: false,
      refresh: false,
      budget: 300,
      minSpacingMs: 1000,
      timeoutMs: 120_000,
      ...options,
    };
  }

  /**
   * GET `url`, from the cache when there. `secret` query parameters (e.g. `{ api_key: KEY }`) are appended only to
   * the request itself. `binary` keeps the body as base64 text (images), so the cache stays one kind of file.
   */
  get(url: string, secret: Record<string, string> = {}, binary = false): Promise<PoliteResponse> {
    const run = this.queue.then(() => this.load(url, secret, binary));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(url: string, secret: Record<string, string>, binary: boolean): Promise<PoliteResponse> {
    const key = cacheKey(url);
    const bodyPath = join(this.o.cacheDir, `${key}.body`);
    const metaPath = join(this.o.cacheDir, `${key}.meta.json`);
    if (!this.o.refresh && existsSync(bodyPath) && existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Meta;
      this.cacheHits++;
      return { body: readFileSync(bodyPath, "utf8"), url, retrieved: meta.retrieved, fromCache: true };
    }
    if (this.o.offline) throw new PoliteError(`${this.o.name}: offline and not cached (${url})`);
    if (this.stopped) throw new PoliteError(`${this.o.name}: stopped after ${this.stopped}; not requesting ${url}`);
    if (this.requests >= this.o.budget)
      throw new PoliteError(`${this.o.name}: request budget of ${this.o.budget} spent (${url})`);
    const wait = this.lastStart + this.o.minSpacingMs - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
    this.lastStart = this.o.now();
    this.requests++;
    const extra = new URLSearchParams(secret).toString();
    const full = extra ? `${url}${url.includes("?") ? "&" : "?"}${extra}` : url;
    let res: Response;
    try {
      res = await this.o.fetch(full, {
        headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" },
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
    } catch (e) {
      this.stopped = `a network error from ${this.o.name} (${url})`;
      throw new PoliteError(`${this.stopped}: ${(e as Error).name}`);
    }
    if (res.status !== 200) {
      this.stopped = `HTTP ${res.status} from ${this.o.name} (${url})`;
      throw new PoliteError(this.stopped);
    }
    const text = binary ? Buffer.from(await res.arrayBuffer()).toString("base64") : await res.text();
    const date = Date.parse(res.headers.get("date") ?? "");
    const retrieved = new Date(Number.isFinite(date) ? date : this.o.now()).toISOString().slice(0, 19) + "Z";
    mkdirSync(this.o.cacheDir, { recursive: true });
    writeFileSync(`${bodyPath}.tmp`, text);
    renameSync(`${bodyPath}.tmp`, bodyPath);
    writeFileSync(`${metaPath}.tmp`, `${JSON.stringify({ url, retrieved } satisfies Meta, null, 2)}\n`);
    renameSync(`${metaPath}.tmp`, metaPath);
    return { body: text, url, retrieved, fromCache: false };
  }
}

/** The NASA API key from the environment or the repository's .env (never committed), or null. */
export function nasaApiKey(env: NodeJS.ProcessEnv, dotenv: string | null): string | null {
  if (env.NASA_API_KEY) return env.NASA_API_KEY;
  const m = dotenv?.match(/^NASA_API_KEY=(.*)$/m);
  return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : null;
}
