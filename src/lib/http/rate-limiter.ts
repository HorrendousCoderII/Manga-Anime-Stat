import { systemClock, type Clock } from "./clock";

export interface RateLimiterOptions {
  /** Max request starts per second; also enforced as an even spacing between starts. */
  perSecond: number;
  /** Max request starts in any rolling 60s window. */
  perMinute: number;
  clock?: Clock;
}

/**
 * FIFO request queue that spaces task starts evenly (1000 / perSecond ms apart)
 * and caps starts in any rolling minute. `pause()` lets callers push the whole
 * queue back, e.g. after a 429.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly perMinute: number;
  private readonly clock: Clock;
  private starts: number[] = [];
  private blockedUntil = 0;
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(options: RateLimiterOptions) {
    if (options.perSecond <= 0 || options.perMinute <= 0) {
      throw new Error("RateLimiter limits must be positive");
    }
    this.minIntervalMs = Math.ceil(1000 / options.perSecond);
    this.perMinute = options.perMinute;
    this.clock = options.clock ?? systemClock;
  }

  get queued(): number {
    return this.pending;
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    this.pending++;
    const slot = this.tail.then(() => this.acquire());
    this.tail = slot.catch(() => undefined);
    return slot.then(
      () => {
        this.pending--;
        return task();
      },
      (err) => {
        this.pending--;
        throw err;
      },
    );
  }

  /** Block all new starts for at least `ms` from now. */
  pause(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.clock.now() + ms);
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      this.starts = this.starts.filter((t) => t > now - 60_000);
      const last = this.starts[this.starts.length - 1];

      let wait = this.blockedUntil - now;
      if (last !== undefined) wait = Math.max(wait, last + this.minIntervalMs - now);
      if (this.starts.length >= this.perMinute) {
        wait = Math.max(wait, this.starts[this.starts.length - this.perMinute] + 60_000 - now);
      }

      if (wait <= 0) {
        this.starts.push(now);
        return;
      }
      await this.clock.sleep(wait);
    }
  }
}
