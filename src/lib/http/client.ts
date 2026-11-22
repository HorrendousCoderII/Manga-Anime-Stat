import { HttpError, isHttpError, parseRetryAfter, withBackoff } from "./backoff";
import type { TtlCache } from "./cache";
import { systemClock, type Clock } from "./clock";
import type { RateLimiter } from "./rate-limiter";

export class UpstreamUnavailableError extends Error {
  constructor(
    readonly upstream: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamUnavailableError";
  }
}

export interface ThrottledClientOptions {
  name: string;
  baseUrl: string;
  limiter: RateLimiter;
  cache: TtlCache;
  defaultTtlMs: number;
  timeoutMs?: number;
  retries?: number;
  /** Consecutive network failures before failing fast for `circuitOpenMs`. */
  circuitThreshold?: number;
  circuitOpenMs?: number;
  fetch?: typeof fetch;
  clock?: Clock;
  headers?: Record<string, string>;
}

export interface GetOptions {
  params?: Record<string, string | number | undefined>;
  ttlMs?: number;
}

/**
 * GET-only JSON client: cache → in-flight dedupe → rate-limited queue → fetch,
 * with exponential backoff on 429/5xx and a small circuit breaker for dead upstreams.
 */
export class ThrottledClient {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private networkFailures = 0;
  private circuitOpenUntil = 0;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ThrottledClientOptions) {
    this.clock = opts.clock ?? systemClock;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  get name(): string {
    return this.opts.name;
  }

  get isCircuitOpen(): boolean {
    return this.clock.now() < this.circuitOpenUntil;
  }

  buildUrl(pathname: string, params?: GetOptions["params"]): string {
    const url = new URL(this.opts.baseUrl.replace(/\/$/, "") + pathname);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async get<T>(pathname: string, options: GetOptions = {}): Promise<T> {
    const url = this.buildUrl(pathname, options.params);
    const cached = await this.opts.cache.get<T>(url);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<T>;

    const request = this.fetchWithRetry<T>(url).then(async (data) => {
      await this.opts.cache.set(url, data, options.ttlMs ?? this.opts.defaultTtlMs);
      return data;
    });
    this.inflight.set(url, request);
    try {
      return await request;
    } finally {
      this.inflight.delete(url);
    }
  }

  private fetchWithRetry<T>(url: string): Promise<T> {
    return withBackoff(
      () => this.opts.limiter.schedule(() => this.fetchOnce<T>(url)),
      {
        retries: this.opts.retries ?? 4,
        clock: this.clock,
        shouldRetry: (err, attempt) =>
          isHttpError(err) && (err.status === 429 || (err.status >= 500 && attempt < 1)),
        onRetry: (err, delay) => {
          if (isHttpError(err) && err.status === 429) this.opts.limiter.pause(delay);
        },
      },
    );
  }

  private async fetchOnce<T>(url: string): Promise<T> {
    if (this.isCircuitOpen) {
      throw new UpstreamUnavailableError(this.opts.name, `${this.opts.name} is unreachable; skipping request`);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json", ...this.opts.headers },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
        cache: "no-store",
      });
    } catch (err) {
      this.networkFailures++;
      if (this.networkFailures >= (this.opts.circuitThreshold ?? 2)) {
        this.circuitOpenUntil = this.clock.now() + (this.opts.circuitOpenMs ?? 60_000);
      }
      // undici reports "fetch failed" and puts the useful reason (e.g. connect timeout) on `cause`.
      const cause = (err as { cause?: unknown })?.cause;
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      const reason = timedOut
        ? `timed out after ${(this.opts.timeoutMs ?? 10_000) / 1000}s`
        : cause instanceof Error
          ? cause.message
          : err instanceof Error
            ? err.message
            : String(err);
      throw new UpstreamUnavailableError(this.opts.name, `${this.opts.name} request failed: ${reason}`);
    }
    this.networkFailures = 0;

    if (!res.ok) {
      let message = `${this.opts.name} responded ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string; errors?: { message?: string }[] };
        message = body.message ?? body.errors?.[0]?.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new HttpError(res.status, message, parseRetryAfter(res.headers.get("retry-after")));
    }
    return (await res.json()) as T;
  }
}
