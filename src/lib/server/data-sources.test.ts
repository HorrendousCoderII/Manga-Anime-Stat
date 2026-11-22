import { describe, expect, it } from "vitest";
import { FakeClock } from "@/test/fake-clock";
import animeList from "../__fixtures__/mal-api-animelist.json";
import jikanAnime from "../__fixtures__/jikan-anime.json";
import feedAnimeList from "../__fixtures__/mal-animelist.json";
import { MemoryTtlCache } from "../http/cache";
import { ThrottledClient } from "../http/client";
import { RateLimiter } from "../http/rate-limiter";
import { createDataSources, UserListError } from "./data-sources";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(handlers: { malApi?: Handler; feed?: Handler; jikan?: Handler }) {
  const clock = new FakeClock();
  const calls: { client: string; url: URL; headers: Record<string, string> }[] = [];
  const make = (name: string, baseUrl: string, handler: Handler | undefined, headers?: Record<string, string>) =>
    new ThrottledClient({
      name,
      baseUrl,
      limiter: new RateLimiter({ perSecond: 3, perMinute: 60, clock }),
      cache: new MemoryTtlCache(100, clock),
      defaultTtlMs: 60_000,
      clock,
      headers,
      fetch: (async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        calls.push({ client: name, url, headers: (init?.headers ?? {}) as Record<string, string> });
        if (!handler) throw new TypeError("fetch failed");
        return handler(url, init);
      }) as typeof fetch,
    });

  const sources = createDataSources({
    malApi: handlers.malApi
      ? make("mal-api", "https://api.myanimelist.net/v2", handlers.malApi, { "X-MAL-CLIENT-ID": "test-id" })
      : null,
    malFeed: make("feed", "https://myanimelist.net", handlers.feed),
    jikan: make("jikan", "https://api.jikan.moe/v4", handlers.jikan),
  });
  return { sources, calls };
}

describe("fetchUserList", () => {
  it("uses the MAL API with client ID, nested fields and nsfw, following paging", async () => {
    let page = 0;
    const { sources, calls } = setup({
      malApi: () => json({ ...animeList, paging: page++ === 0 ? { next: "https://api.myanimelist.net/v2/next" } : {} }),
    });
    const result = await sources.fetchUserList("Xinil", "anime");
    expect(result.source).toBe("mal-api");
    expect(result.fallbackReason).toBeUndefined();
    expect(result.entries).toHaveLength(4);
    expect(result.entries[0].media.studios[0].name).toBe("Sunrise");

    expect(calls).toHaveLength(2);
    const first = calls[0];
    expect(first.url.pathname).toBe("/v2/users/Xinil/animelist");
    expect(first.headers["X-MAL-CLIENT-ID"]).toBe("test-id");
    expect(first.url.searchParams.get("nsfw")).toBe("true");
    expect(first.url.searchParams.get("limit")).toBe("1000");
    const fields = first.url.searchParams.get("fields")!;
    for (const f of ["list_status", "mean", "num_episodes", "average_episode_duration", "studios", "genres", "media_type"]) {
      expect(fields).toContain(f);
    }
    expect(calls[1].url.searchParams.get("offset")).toBe("1000");
  });

  it("requests manga authors with roles and serialization", async () => {
    const { sources, calls } = setup({ malApi: () => json({ data: [], paging: {} }) });
    await sources.fetchUserList("Xinil", "manga");
    const fields = calls[0].url.searchParams.get("fields")!;
    expect(fields).toContain("authors{first_name,last_name}");
    expect(fields).toContain("serialization{name}");
    expect(fields).toContain("num_volumes");
    expect(fields).toContain("num_chapters");
  });

  it("falls back to the list feed when no client ID is configured", async () => {
    const { sources, calls } = setup({ feed: () => json(feedAnimeList) });
    const result = await sources.fetchUserList("Xinil", "anime");
    expect(result).toMatchObject({ source: "mal-feed", fallbackReason: "MAL_CLIENT_ID not set" });
    expect(result.entries).toHaveLength(2);
    expect(calls.map((c) => c.client)).toEqual(["feed"]);
  });

  it("falls back to the list feed when the MAL API rejects the client ID", async () => {
    const { sources } = setup({
      malApi: () => json({ message: "Invalid client id", error: "bad_request" }, 400),
      feed: () => json(feedAnimeList),
    });
    const result = await sources.fetchUserList("Xinil", "anime");
    expect(result.source).toBe("mal-feed");
    expect(result.fallbackReason).toContain("Invalid client id");
  });

  it("reports unknown users without hitting the fallback", async () => {
    const { sources, calls } = setup({
      malApi: () => json({ message: "", error: "not_found" }, 404),
      feed: () => json(feedAnimeList),
    });
    await expect(sources.fetchUserList("nobody", "anime")).rejects.toBeInstanceOf(UserListError);
    expect(calls.map((c) => c.client)).toEqual(["mal-api"]);
  });
});

describe("fetchMediaDetails", () => {
  it("prefers the MAL API", async () => {
    const { sources, calls } = setup({ malApi: () => json(animeList.data[0].node) });
    const media = await sources.fetchMediaDetails("anime", 1);
    expect(media).toMatchObject({ malId: 1, episodeMinutes: 24, detailed: true });
    expect(calls[0].url.pathname).toBe("/v2/anime/1");
  });

  it("falls back to Jikan when the MAL API fails", async () => {
    const { sources, calls } = setup({
      malApi: () => json({ error: "forbidden" }, 403),
      jikan: () => json({ data: jikanAnime }),
    });
    const media = await sources.fetchMediaDetails("anime", 1);
    expect(media).toMatchObject({ malId: 1, studios: [{ id: 14, name: "Sunrise" }] });
    expect(calls.map((c) => c.client)).toEqual(["mal-api", "jikan"]);
  });

  it("reports details unavailable only when every source is down", async () => {
    const { sources } = setup({});
    expect(sources.detailsUnavailable()).toBe(false);
    await expect(sources.fetchMediaDetails("anime", 1)).rejects.toThrow();
    await expect(sources.fetchMediaDetails("anime", 2)).rejects.toThrow();
    expect(sources.detailsUnavailable()).toBe(true);
  });
});
