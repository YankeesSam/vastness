// VN-DAT-002, VN-DAT-003: the polite Horizons client. One request in flight, at least 1 s between request starts,
// exponential backoff with jitter on HTTP 503 and network errors, a request budget per run, the project User-Agent,
// and a disk cache keyed by the SHA-256 of the canonical query. Tests inject fetch, the clock and the cache folder.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalQuery, queryUrl } from "./horizons.ts";

/** Names the project only: no personal data in headers (VN-DAT-002). */
export const USER_AGENT = "vastness-ephemeris-pipeline (+https://github.com/YankeesSam/vastness)";

export interface ClientOptions {
  /** Folder for cached responses (`.cache/horizons` in the pipeline). */
  cacheDir: string;
  fetch?: typeof fetch;
  /** Milliseconds, like Date.now. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** In [0, 1), for backoff jitter. */
  random?: () => number;
  /** A cache miss fails instead of fetching. */
  offline?: boolean;
  /** Network requests allowed in this run, retries included. */
  budget?: number;
  minSpacingMs?: number;
  /** Retries after the first attempt on 503 or a network error. */
  maxRetries?: number;
  baseBackoffMs?: number;
}

export interface CachedResponse {
  /** The response body exactly as Horizons sent it. */
  body: string;
  /** UTC date (YYYY-MM-DD) of retrieval, from the response's own Date header. */
  retrieved: string;
  fromCache: boolean;
  /** The canonical query (VN-DAT-005 provenance). */
  query: string;
}

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

/** SHA-256 (hex) of the canonical query: the cache key. */
export function cacheKey(params: Record<string, string>): string {
  return createHash("sha256").update(canonicalQuery(params)).digest("hex");
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface Meta {
  query: string;
  retrieved: string;
}

export class HorizonsClient {
  private readonly o: Required<Omit<ClientOptions, "budget">> & { budget: number };
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  /** Network requests made so far, retries included. */
  requests = 0;
  cacheHits = 0;

  constructor(options: ClientOptions) {
    this.o = {
      fetch: (...a) => fetch(...a),
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      random: Math.random,
      offline: false,
      budget: Infinity,
      minSpacingMs: 1000,
      maxRetries: 5,
      baseBackoffMs: 2000,
      ...options,
    };
  }

  /** Cached body, or one polite fetch. Calls are serialised in arrival order. */
  get(params: Record<string, string>): Promise<CachedResponse> {
    const run = this.queue.then(() => this.load(params));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private paths(params: Record<string, string>): { body: string; meta: string } {
    const key = cacheKey(params);
    return { body: join(this.o.cacheDir, `${key}.json`), meta: join(this.o.cacheDir, `${key}.meta.json`) };
  }

  private async load(params: Record<string, string>): Promise<CachedResponse> {
    const query = canonicalQuery(params);
    const p = this.paths(params);
    if (existsSync(p.body) && existsSync(p.meta)) {
      this.cacheHits++;
      const meta = JSON.parse(readFileSync(p.meta, "utf8")) as Meta;
      return { body: readFileSync(p.body, "utf8"), retrieved: meta.retrieved, fromCache: true, query };
    }
    if (this.o.offline) throw new ClientError(`offline and not cached (query: ${query})`);
    const { body, retrieved } = await this.fetchPolitely(params, query);
    mkdirSync(this.o.cacheDir, { recursive: true });
    // Body first, meta last: a crash in between leaves a miss, never a body without its date.
    writeFileSync(`${p.body}.tmp`, body);
    renameSync(`${p.body}.tmp`, p.body);
    const meta: Meta = { query, retrieved };
    writeFileSync(`${p.meta}.tmp`, `${JSON.stringify(meta, null, 2)}\n`);
    renameSync(`${p.meta}.tmp`, p.meta);
    return { body, retrieved, fromCache: false, query };
  }

  private async fetchPolitely(
    params: Record<string, string>,
    query: string,
  ): Promise<Omit<Meta, "query"> & { body: string }> {
    const url = queryUrl(params);
    for (let attempt = 0; ; attempt++) {
      if (this.requests >= this.o.budget) {
        throw new ClientError(`request budget of ${this.o.budget} spent (query: ${query})`);
      }
      const wait = this.lastStart + this.o.minSpacingMs - this.o.now();
      if (wait > 0) await this.o.sleep(wait);
      this.lastStart = this.o.now();
      this.requests++;
      let retryable: string;
      try {
        const res = await this.o.fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
        if (res.status === 200) {
          const body = await res.text();
          const date = res.headers.get("date");
          const ms = date ? Date.parse(date) : NaN;
          return { body, retrieved: utcDate(Number.isFinite(ms) ? ms : this.o.now()) };
        }
        if (res.status !== 503) throw new ClientError(`HTTP ${res.status} from Horizons (query: ${query})`);
        retryable = "HTTP 503";
      } catch (e) {
        if (e instanceof ClientError) throw e;
        retryable = `network error: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (attempt >= this.o.maxRetries) {
        throw new ClientError(`${retryable} after ${attempt + 1} attempts (query: ${query})`);
      }
      // Exponential backoff with up to 50 % jitter, on top of the normal spacing.
      await this.o.sleep(this.o.baseBackoffMs * 2 ** attempt * (1 + 0.5 * this.o.random()));
    }
  }
}
