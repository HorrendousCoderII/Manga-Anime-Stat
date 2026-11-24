import "server-only";
import path from "node:path";
import { FileTtlCache } from "../http/cache";
import { ThrottledClient } from "../http/client";
import { RateLimiter } from "../http/rate-limiter";
import { createDataSources } from "./data-sources";

export { UserListError, type ListSource, type RelationSource, type RelationsResult, type UserListResult } from "./data-sources";

const MINUTE = 60_000;
const USER_AGENT = "Manga-Anime-Stat/0.1 (+https://github.com/HorrendousCoderII/Manga-Anime-Stat)";

type DataSources = ReturnType<typeof createDataSources>;

const globalForSources = globalThis as unknown as { __mangaAnimeSources?: DataSources };

function sources(): DataSources {
  if (!globalForSources.__mangaAnimeSources) {
    const cache = new FileTtlCache(path.join(process.cwd(), ".cache", "http"));
    // Server-only: never expose this through a NEXT_PUBLIC_ variable.
    const clientId = process.env.MAL_CLIENT_ID?.trim();
    globalForSources.__mangaAnimeSources = createDataSources({
      malApi: clientId
        ? new ThrottledClient({
            name: "MyAnimeList API",
            baseUrl: "https://api.myanimelist.net/v2",
            // MAL doesn't publish limits; this mirrors the Jikan budget.
            limiter: new RateLimiter({ perSecond: 2, perMinute: 55 }),
            cache,
            defaultTtlMs: 15 * MINUTE,
            timeoutMs: 15_000,
            headers: { "X-MAL-CLIENT-ID": clientId, "User-Agent": USER_AGENT },
          })
        : null,
      malFeed: new ThrottledClient({
        name: "MyAnimeList feed",
        baseUrl: "https://myanimelist.net",
        limiter: new RateLimiter({ perSecond: 1, perMinute: 30 }),
        cache,
        defaultTtlMs: 15 * MINUTE,
        timeoutMs: 15_000,
        headers: { "User-Agent": USER_AGENT },
      }),
      jikan: new ThrottledClient({
        name: "Jikan",
        baseUrl: process.env.JIKAN_BASE_URL ?? "https://api.jikan.moe/v4",
        // Jikan allows 3/s and 60/min; stay under both.
        limiter: new RateLimiter({ perSecond: 2.5, perMinute: 55 }),
        cache,
        defaultTtlMs: 24 * 60 * MINUTE,
        timeoutMs: 12_000,
      }),
    });
  }
  return globalForSources.__mangaAnimeSources;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,16}$/;

export const fetchUserList: DataSources["fetchUserList"] = (...args) => sources().fetchUserList(...args);
export const fetchUserProfile: DataSources["fetchUserProfile"] = (...args) => sources().fetchUserProfile(...args);
export const fetchMediaDetails: DataSources["fetchMediaDetails"] = (...args) => sources().fetchMediaDetails(...args);
export const fetchRelations: DataSources["fetchRelations"] = (...args) => sources().fetchRelations(...args);
export const detailsUnavailable = () => sources().detailsUnavailable();
