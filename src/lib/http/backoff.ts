import { systemClock, type Clock } from "./clock";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  /** 0..1 fraction of the computed delay added as random jitter. */
  jitter?: number;
  clock?: Clock;
  random?: () => number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, delayMs: number, attempt: number) => void;
}

/** Name-based so it also works across Next.js route bundles, which each get their own class copy. */
export const isHttpError = (error: unknown): error is HttpError =>
  error instanceof Error && error.name === "HttpError" && typeof (error as HttpError).status === "number";

export const isRateLimited = (error: unknown): error is HttpError => isHttpError(error) && error.status === 429;

export function backoffDelay(
  attempt: number,
  { baseMs = 1000, maxMs = 30_000, jitter = 0.25, random = Math.random }: BackoffOptions = {},
  retryAfterMs?: number,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  const delay = Math.max(exp, retryAfterMs ?? 0);
  return Math.round(delay + delay * jitter * random());
}

/** Retries `fn` with exponential backoff; by default only on HTTP 429. */
export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const { retries = 4, clock = systemClock, shouldRetry = isRateLimited, onRetry } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const retryAfter = isHttpError(error) ? error.retryAfterMs : undefined;
      const delay = backoffDelay(attempt, options, retryAfter);
      onRetry?.(error, delay, attempt);
      await clock.sleep(delay);
    }
  }
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
