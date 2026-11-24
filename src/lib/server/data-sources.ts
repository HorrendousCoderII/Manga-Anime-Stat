import type { RelatedLink } from "../analytics/adaptation-gap";
import { isHttpError } from "../http/backoff";
import type { ThrottledClient } from "../http/client";
import type {
  JikanAnime,
  JikanManga,
  JikanRelationGroup,
  JikanResource,
  JikanUserFull,
  MalAnimeListEntry,
  MalMangaListEntry,
} from "../jikan/raw";
import {
  normalizeMalAnime,
  normalizeMalApiAnimeEntry,
  normalizeMalApiMangaEntry,
  normalizeMalManga,
} from "../mal/normalize";
import type {
  MalAnimeListStatus,
  MalAnimeNode,
  MalListPage,
  MalMangaListStatus,
  MalMangaNode,
  MalRelatedNode,
} from "../mal/raw";
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
export type RelationSource = "mal-api" | "jikan";

export interface UserListResult {
  entries: ListEntry[];
  source: ListSource;
  /** Why the primary MAL API source was skipped, when it was. */
  fallbackReason?: string;
}

export interface RelationsResult {
  medium: Medium;
  malId: number;
  related: RelatedLink[];
  source: RelationSource;
  /** Set when MAL returned no cross-medium links and Jikan was used (or attempted). */
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

  function fromMalRelated(rows: MalRelatedNode[] | undefined, medium: Medium): RelatedLink[] {
    if (!rows?.length) return [];
    return rows.map((r) => ({
      medium,
      malId: r.node.id,
      title: r.node.title,
      relation: r.relation_type_formatted || r.relation_type,
    }));
  }

  function fromJikanRelations(groups: JikanRelationGroup[]): RelatedLink[] {
    const out: RelatedLink[] = [];
    for (const g of groups) {
      for (const e of g.entry ?? []) {
        const type = (e.type ?? "").toLowerCase();
        if (type !== "anime" && type !== "manga") continue;
        out.push({ medium: type, malId: e.mal_id, title: e.name, relation: g.relation });
      }
    }
    return out;
  }

  function crossMedium(related: RelatedLink[], self: Medium): RelatedLink[] {
    return related.filter((r) => r.medium !== self);
  }

  /**
   * Cross-medium related titles for adaptation pairing.
   * Prefers MAL v2 `related_anime` / `related_manga`; falls back to Jikan `/relations`
   * (MAL's cross-medium fields are often empty — a known API bug).
   */
  async function fetchRelations(medium: Medium, malId: number): Promise<RelationsResult> {
    let fallbackReason: string | undefined;

    if (malApi && !malApi.isCircuitOpen) {
      try {
        const node = await malApi.get<MalAnimeNode | MalMangaNode>(`/${medium}/${malId}`, {
          params: { fields: "related_anime,related_manga" },
          ttlMs: 7 * DAY,
        });
        const related = [
          ...fromMalRelated(node.related_anime, "anime"),
          ...fromMalRelated(node.related_manga, "manga"),
        ];
        const cross = crossMedium(related, medium);
        if (cross.length) return { medium, malId, related: cross, source: "mal-api" };
        fallbackReason = "MAL returned no cross-medium related titles";
      } catch (err) {
        if (isHttpError(err) && err.status === 404) throw err;
        fallbackReason = `MAL relations failed: ${errorMessage(err)}`;
      }
    } else {
      fallbackReason = malApi ? "MAL circuit open" : "MAL_CLIENT_ID not set";
    }

    if (!jikan.isCircuitOpen) {
      try {
        const res = await jikan.get<JikanResource<JikanRelationGroup[]>>(`/${medium}/${malId}/relations`, {
          ttlMs: 7 * DAY,
        });
        return {
          medium,
          malId,
          related: crossMedium(fromJikanRelations(res.data ?? []), medium),
          source: "jikan",
          fallbackReason,
        };
      } catch (err) {
        if (isHttpError(err) && err.status === 404) throw err;
        fallbackReason = `${fallbackReason ?? "relations unavailable"}; Jikan failed: ${errorMessage(err)}`;
      }
    } else {
      fallbackReason = `${fallbackReason ?? "relations unavailable"}; Jikan circuit open`;
    }

    // Both sources empty/unavailable — callers can still pair via on-list title matching.
    return { medium, malId, related: [], source: "jikan", fallbackReason };
  }

  return { fetchUserList, fetchUserProfile, fetchMediaDetails, fetchRelations, detailsUnavailable };
}
