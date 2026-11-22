import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "@/test/fake-clock";
import { FileTtlCache, MemoryTtlCache } from "./cache";
import { ThrottledClient, UpstreamUnavailableError } from "./client";
import { RateLimiter } from "./rate-limiter";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function makeClient(fetchImpl: typeof fetch, clock = new FakeClock()) {
  return new ThrottledClient({
    name: "Test",
    baseUrl: "https://api.example.test/v4",
    limiter: new RateLimiter({ perSecond: 3, perMinute: 60, clock }),
    cache: new MemoryTtlCache(100, clock),
    defaultTtlMs: 60_000,
    fetch: fetchImpl,
    clock,
  });
}

describe("ThrottledClient", () => {
  it("serves repeated requests from cache until the TTL expires", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const client = makeClient(async () => json({ n: ++calls }), clock);
    expect(await client.get("/anime/1")).toEqual({ n: 1 });
    expect(await client.get("/anime/1")).toEqual({ n: 1 });
    clock.advance(60_001);
    expect(await client.get("/anime/1")).toEqual({ n: 2 });
  });

  it("dedupes concurrent identical requests", async () => {
    let calls = 0;
    const client = makeClient(async () => json({ n: ++calls }));
    const [a, b] = await Promise.all([client.get("/anime/1"), client.get("/anime/1")]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it("backs off on 429 and pauses the shared queue", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const client = makeClient(async () => (++calls === 1 ? json({ message: "slow down" }, 429, { "retry-after": "2" }) : json({ ok: true })), clock);
    expect(await client.get("/anime/1")).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(clock.now()).toBeGreaterThanOrEqual(2000);
  });

  it("surfaces upstream error messages", async () => {
    const client = makeClient(async () => json({ status: 404, message: "Resource does not exist" }, 404));
    await expect(client.get("/anime/999999")).rejects.toThrow("Resource does not exist");
  });

  it("opens the circuit after repeated network failures", async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      throw new TypeError("fetch failed");
    });
    await expect(client.get("/a")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(client.get("/b")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(client.isCircuitOpen).toBe(true);
    await expect(client.get("/c")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(calls).toBe(2);
  });
});

describe("FileTtlCache", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persists across instances and respects TTL", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ttl-cache-"));
    const clock = new FakeClock(1_000);
    await new FileTtlCache(dir, clock).set("k", { v: 1 }, 5_000);
    const fresh = new FileTtlCache(dir, clock);
    expect(await fresh.get("k")).toEqual({ v: 1 });
    clock.advance(5_001);
    expect(await new FileTtlCache(dir, clock).get("k")).toBeUndefined();
  });
});
