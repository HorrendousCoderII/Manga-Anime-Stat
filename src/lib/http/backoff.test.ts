import { describe, expect, it } from "vitest";
import { FakeClock } from "@/test/fake-clock";
import { backoffDelay, HttpError, parseRetryAfter, withBackoff } from "./backoff";

describe("backoffDelay", () => {
  it("grows exponentially and caps at maxMs", () => {
    const opts = { baseMs: 1000, maxMs: 8000, jitter: 0 };
    expect([0, 1, 2, 3, 4, 5].map((a) => backoffDelay(a, opts))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("honours Retry-After when it exceeds the computed delay", () => {
    expect(backoffDelay(0, { baseMs: 1000, jitter: 0 }, 5000)).toBe(5000);
  });

  it("adds bounded jitter", () => {
    expect(backoffDelay(1, { baseMs: 1000, jitter: 0.5, random: () => 1 })).toBe(3000);
  });
});

describe("withBackoff", () => {
  it("retries 429s with exponential delays until success", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const result = await withBackoff(
      async () => {
        calls++;
        if (calls < 4) throw new HttpError(429, "Too Many Requests");
        return "ok";
      },
      { clock, baseMs: 500, jitter: 0 },
    );
    expect(result).toBe("ok");
    expect(clock.sleeps).toEqual([500, 1000, 2000]);
  });

  it("gives up after the retry budget and rethrows", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const promise = withBackoff(
      async () => {
        calls++;
        throw new HttpError(429, "Too Many Requests");
      },
      { clock, retries: 2, jitter: 0 },
    );
    await expect(promise).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    const clock = new FakeClock();
    let calls = 0;
    await expect(
      withBackoff(
        async () => {
          calls++;
          throw new HttpError(404, "Not Found");
        },
        { clock },
      ),
    ).rejects.toThrow("Not Found");
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
