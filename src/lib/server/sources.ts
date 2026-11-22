import "server-only";
import path from "node:path";
import { isHttpError } from "../http/backoff";
import { FileTtlCache } from "../http/cache";
import { ThrottledClient } from "../http/client";
import { RateLimiter } from "../http/rate-limiter";
import type { JikanAnime, JikanManga, JikanResource, JikanUserFull, MalAnimeListEntry, MalMangaListEntry } from "../jikan/raw";
import {
  normalizeJikanAnime,
  normalizeJikanManga,
  normalizeJikanUser,
  normalizeMalAnimeListEntry,
  normalizeMalMangaListEntry,
} from "../normalize";
import type { ListEntry, Media, Medium, UserProfile } from "../types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Clients {
  jikan: ThrottledClient;
  mal: ThrottledClient;
}

const globalForClients = globalThis as unknown as { __mangaAnimeClients?: Clients };

function clients(): Clients {
  if (!globalForClients.__mangaAnimeClients) {
    const cache = new FileTtlCache(path.join(process.cwd(), ".cache", "http"));
    globalForClients.__mangaAnimeClients = {
      jikan: new ThrottledClient({
        name: "Jikan",
        baseUrl: process.env.JIKAN_BASE_URL ?? "https://api.jikan.moe/v4",
        // Jikan allows 3/s and 60/min; stay under both.
        limiter: new RateLimiter({ perSecond: 2.5, perMinute: 55 }),
        cache,
        defaultTtlMs: DAY,
        timeoutMs: 12_000,
      }),
      mal: new ThrottledClient({
        name: "MyAnimeList",
        baseUrl: "https://myanimelist.net",
        limiter: new RateLimiter({ perSecond: 1, perMinute: 30 }),
        cache,
        defaultTtlMs: 15 * MINUTE,
        timeoutMs: 15_000,
        headers: { "User-Agent": "Manga-Anime-Stat/0.1 (+https://github.com/HorrendousCoderII/Manga-Anime-Stat)" },
      }),
    };
  }
  return globalForClients.__mangaAnimeClients;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,16}$/;

export class UserListError extends Error {
  constructor(
    readonly code: "not_found_or_private" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "UserListError";
  }
}

const PAGE_SIZE = 300;
const MAX_PAGES = 20;

/**
 * Jikan's `/users/{username}/animelist|mangalist` were discontinued in May 2022, so user lists
 * come from MAL's public list feed (same data the MAL list page renders), paged 300 at a time.
 */
export async function fetchUserList(username: string, medium: Medium): Promise<ListEntry[]> {
  const entries: ListEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let rows: unknown[];
    try {
      rows = await clients().mal.get<unknown[]>(`/${medium}list/${encodeURIComponent(username)}/load.json`, {
        params: { status: 7, offset: page * PAGE_SIZE },
      });
    } catch (err) {
      if (isHttpError(err) && (err.status === 400 || err.status === 404 || err.status === 403)) {
        throw new UserListError("not_found_or_private", `No public ${medium} list found for "${username}".`);
      }
      throw new UserListError("upstream", err instanceof Error ? err.message : String(err));
    }
    for (const row of rows) {
      entries.push(
        medium === "anime"
          ? normalizeMalAnimeListEntry(row as MalAnimeListEntry)
          : normalizeMalMangaListEntry(row as MalMangaListEntry),
      );
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return entries;
}

export async function fetchUserProfile(username: string): Promise<UserProfile> {
  const res = await clients().jikan.get<JikanResource<JikanUserFull>>(`/users/${encodeURIComponent(username)}/full`, {
    ttlMs: HOUR,
  });
  return normalizeJikanUser(res.data);
}

export async function fetchMediaDetails(medium: Medium, malId: number): Promise<Media> {
  if (medium === "anime") {
    const res = await clients().jikan.get<JikanResource<JikanAnime>>(`/anime/${malId}`, { ttlMs: 7 * DAY });
    return normalizeJikanAnime(res.data);
  }
  const res = await clients().jikan.get<JikanResource<JikanManga>>(`/manga/${malId}`, { ttlMs: 7 * DAY });
  return normalizeJikanManga(res.data);
}

export const jikanIsDown = () => clients().jikan.isCircuitOpen;
