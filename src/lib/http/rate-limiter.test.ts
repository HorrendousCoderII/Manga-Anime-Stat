import { describe, expect, it } from "vitest";
import { FakeClock } from "@/test/fake-clock";
import { RateLimiter } from "./rate-limiter";

async function runTasks(limiter: RateLimiter, clock: FakeClock, n: number): Promise<number[]> {
  const starts: number[] = [];
  await Promise.all(
    Array.from({ length: n }, () =>
      limiter.schedule(async () => {
        starts.push(clock.now());
      }),
    ),
  );
  return starts;
}

describe("RateLimiter", () => {
  it("spaces starts evenly to respect the per-second limit", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 2.5, perMinute: 1000, clock });
    const starts = await runTasks(limiter, clock, 10);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(400);
    for (const s of starts) expect(starts.filter((t) => t >= s && t < s + 1000).length).toBeLessThanOrEqual(3);
  });

  it("caps starts in any rolling 60s window", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 60, clock });
    const starts = await runTasks(limiter, clock, 150);
    for (const s of starts) {
      expect(starts.filter((t) => t >= s && t < s + 60_000).length).toBeLessThanOrEqual(60);
    }
    // The 61st start must wait for the first to leave the window.
    expect(starts[60]).toBeGreaterThanOrEqual(starts[0] + 60_000);
  });

  it("does not delay a request when the window is idle", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 2, perMinute: 60, clock });
    await runTasks(limiter, clock, 1);
    clock.advance(5_000);
    const [start] = await runTasks(limiter, clock, 1);
    expect(start).toBe(5_000);
  });

  it("runs tasks in FIFO order", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 60, clock });
    const order: number[] = [];
    await Promise.all([1, 2, 3, 4, 5].map((n) => limiter.schedule(async () => order.push(n))));
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("pause() pushes back subsequent starts", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 60, clock });
    await runTasks(limiter, clock, 1);
    limiter.pause(10_000);
    const [start] = await runTasks(limiter, clock, 1);
    expect(start).toBeGreaterThanOrEqual(10_000);
  });

  it("keeps the queue moving when a task throws", async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 60, clock });
    const failing = limiter.schedule(async () => {
      throw new Error("boom");
    });
    const ok = limiter.schedule(async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(ok).resolves.toBe("ok");
  });

  it("rejects non-positive limits", () => {
    expect(() => new RateLimiter({ perSecond: 0, perMinute: 60 })).toThrow();
  });
});
