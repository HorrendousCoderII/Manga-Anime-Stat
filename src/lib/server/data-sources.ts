import { isHttpError } from "../http/backoff";
import type { ThrottledClient } from "../http/client";
import type { JikanAnime, JikanManga, JikanResource, JikanUserFull, MalAnimeListEntry, MalMangaListEntry } from "../jikan/raw";
import {
  normalizeMalAnime,
  normalizeMalApiAnimeEntry,
  normalizeMalApiMangaEntry,
  normalizeMalManga,
} from "../mal/normalize";
import type { MalAnimeListStatus, MalAnimeNode, MalListPage, MalMangaListStatus, MalMangaNode } from "../mal/raw";
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

const COMMON_FIELDS = [
  "alternative_titles",
  "start_date",
  "end_date",
  "mean",
  "rank",
  "popularity",
  "num_list_users",
  "num_scoring_users",
  "media_type",
  "status",
  "genres",
];
export const MAL_ANIME_FIELDS = [
  ...COMMON_FIELDS,
  "num_episodes",
  "start_season",
  "source",
  "average_episode_duration",
  "studios",
].join(",");
export const MAL_MANGA_FIELDS = [
  ...COMMON_FIELDS,
  "num_volumes",
  "num_chapters",
  "authors{first_name,last_name}",
  "serialization{name}",
].join(",");

export type ListSource = "mal-api" | "mal-feed";

export interface UserListResult {
  entries: ListEntry[];
  source: ListSource;
  /** Why the primary MAL API source was skipped, when it was. */
  fallbackReason?: string;
}

export class UserListError extends Error {
  constructor(
    readonly code: "not_found_or_private" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "UserListError";
  }
}

export interface SourceClients {
  /** Official MAL API v2 client; null when no MAL_CLIENT_ID is configured. */
  malApi: ThrottledClient | null;
  /** Public myanimelist.net list feed (`load.json`). */
  malFeed: ThrottledClient;
  jikan: ThrottledClient;
}

const MAL_API_PAGE = 1000;
const FEED_PAGE = 300;
const MAX_PAGES = 20;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createDataSources({ malApi, malFeed, jikan }: SourceClients) {
  async function listFromMalApi(username: string, medium: Medium): Promise<ListEntry[]> {
    const entries: ListEntry[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await malApi!.get<MalListPage<MalAnimeNode | MalMangaNode, MalAnimeListStatus | MalMangaListStatus>>(
        `/users/${encodeURIComponent(username)}/${medium}list`,
        {
          params: {
            fields: `list_status,${medium === "anime" ? MAL_ANIME_FIELDS : MAL_MANGA_FIELDS}`,
            limit: MAL_API_PAGE,
            offset: page * MAL_API_PAGE,
            // Without this MAL silently omits NSFW titles from the list.
            nsfw: "true",
          },
          ttlMs: 15 * MINUTE,
        },
      );
      for (const { node, list_status } of res.data) {
        entries.push(
          medium === "anime"
            ? normalizeMalApiAnimeEntry(node as MalAnimeNode, list_status as MalAnimeListStatus)
            : normalizeMalApiMangaEntry(node as MalMangaNode, list_status as MalMangaListStatus),
        );
      }
      if (!res.paging?.next) break;
    }
    return entries;
  }

  async function listFromFeed(username: string, medium: Medium): Promise<ListEntry[]> {
    const entries: ListEntry[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let rows: unknown[];
      try {
        rows = await malFeed.get<unknown[]>(`/${medium}list/${encodeURIComponent(username)}/load.json`, {
          params: { status: 7, offset: page * FEED_PAGE },
          ttlMs: 15 * MINUTE,
        });
      } catch (err) {
        if (isHttpError(err) && [400, 403, 404].includes(err.status)) {
          throw new UserListError("not_found_or_private", `No public ${medium} list found for "${username}".`);
        }
        throw new UserListError("upstream", errorMessage(err));
      }
      for (const row of rows) {
        entries.push(
          medium === "anime"
            ? normalizeMalAnimeListEntry(row as MalAnimeListEntry)
            : normalizeMalMangaListEntry(row as MalMangaListEntry),
        );
      }
      if (rows.length < FEED_PAGE) break;
    }
    return entries;
  }

  /** MAL API v2 first; the public list feed when no client ID is set or the API fails. */
  async function fetchUserList(username: string, medium: Medium): Promise<UserListResult> {
    if (!malApi) {
      return { entries: await listFromFeed(username, medium), source: "mal-feed", fallbackReason: "MAL_CLIENT_ID not set" };
    }
    try {
      return { entries: await listFromMalApi(username, medium), source: "mal-api" };
    } catch (err) {
      if (isHttpError(err) && err.status === 404) {
        throw new UserListError("not_found_or_private", `No MyAnimeList user named "${username}".`);
      }
      return {
        entries: await listFromFeed(username, medium),
        source: "mal-feed",
        fallbackReason: `MAL API failed: ${errorMessage(err)}`,
      };
    }
  }

  /** MAL API v2 has no public profile endpoint, so profile statistics come from Jikan only. */
  async function fetchUserProfile(username: string): Promise<UserProfile> {
    const res = await jikan.get<JikanResource<JikanUserFull>>(`/users/${encodeURIComponent(username)}/full`, {
      ttlMs: HOUR,
    });
    return normalizeJikanUser(res.data);
  }

  /** Title details: MAL API v2 first, Jikan as fallback. */
  async function fetchMediaDetails(medium: Medium, malId: number): Promise<Media> {
    if (malApi && !malApi.isCircuitOpen) {
      try {
        const fields = medium === "anime" ? MAL_ANIME_FIELDS : MAL_MANGA_FIELDS;
        const node = await malApi.get<MalAnimeNode | MalMangaNode>(`/${medium}/${malId}`, {
          params: { fields },
          ttlMs: 7 * DAY,
        });
        return medium === "anime" ? normalizeMalAnime(node as MalAnimeNode) : normalizeMalManga(node as MalMangaNode);
      } catch (err) {
        if (isHttpError(err) && err.status === 404) throw err;
      }
    }
    if (medium === "anime") {
      const res = await jikan.get<JikanResource<JikanAnime>>(`/anime/${malId}`, { ttlMs: 7 * DAY });
      return normalizeJikanAnime(res.data);
    }
    const res = await jikan.get<JikanResource<JikanManga>>(`/manga/${malId}`, { ttlMs: 7 * DAY });
    return normalizeJikanManga(res.data);
  }

  /** True when no source can currently serve title details. */
  const detailsUnavailable = () => (!malApi || malApi.isCircuitOpen) && jikan.isCircuitOpen;

  return { fetchUserList, fetchUserProfile, fetchMediaDetails, detailsUnavailable };
}
