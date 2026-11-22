import type { Clock } from "@/lib/http/clock";

/** Virtual clock whose sleep() advances time instantly, so throttling is deterministic in tests. */
export class FakeClock implements Clock {
  readonly sleeps: number[] = [];
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += Math.max(0, ms);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
