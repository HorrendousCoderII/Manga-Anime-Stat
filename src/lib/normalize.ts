import type {
  JikanAnime,
  JikanEntity,
  JikanManga,
  JikanUserFull,
  MalAnimeListEntry,
  MalMangaListEntry,
} from "./jikan/raw";
import type {
  Anime,
  Author,
  ListEntry,
  ListStatus,
  Manga,
  Media,
  ReleaseStatus,
  Tag,
  UserProfile,
} from "./types";

const MAL_BASE = "https://myanimelist.net";

const toTags = (entities: readonly (JikanEntity | Tag)[] | null | undefined): Tag[] =>
  (entities ?? []).map((e) => ({ id: "mal_id" in e ? e.mal_id : e.id, name: e.name }));

const positiveOrNull = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

const isoDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
};

const yearOf = (iso: string | null): number | null => (iso ? Number(iso.slice(0, 4)) : null);

/** "24 min per ep" → 24, "1 hr 55 min" → 115, "45 sec" → 0.75; null when unknown. */
export function parseDurationMinutes(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const grab = (unit: RegExp) => Number(unit.exec(duration)?.[1] ?? 0);
  const minutes =
    grab(/(\d+(?:\.\d+)?)\s*hr/i) * 60 + grab(/(\d+(?:\.\d+)?)\s*min/i) + grab(/(\d+(?:\.\d+)?)\s*sec/i) / 60;
  return minutes > 0 ? Math.round(minutes * 100) / 100 : null;
}

export function normalizeReleaseStatus(status: string | null | undefined): ReleaseStatus {
  switch (status?.toLowerCase()) {
    case "finished airing":
    case "finished":
      return "finished";
    case "currently airing":
    case "publishing":
      return "airing";
    case "not yet aired":
    case "not yet published":
      return "upcoming";
    case "on hiatus":
      return "hiatus";
    case "discontinued":
      return "discontinued";
    default:
      return "unknown";
  }
}

const MAL_RELEASE_STATUS: Record<number, ReleaseStatus> = {
  1: "airing",
  2: "finished",
  3: "upcoming",
  4: "hiatus",
  5: "discontinued",
};

const MAL_LIST_STATUS: Record<number, ListStatus> = {
  1: "in_progress",
  2: "completed",
  3: "on_hold",
  4: "dropped",
  6: "planned",
};

export function normalizeListStatus(code: number): ListStatus {
  return MAL_LIST_STATUS[code] ?? "planned";
}

/**
 * MAL list feed dates are "MM-DD-YY" with "00" for unknown parts.
 * Two-digit years more than 5 years ahead of `referenceYear` are treated as 19xx.
 */
export function parseMalShortDate(
  value: string | null | undefined,
  referenceYear = new Date().getUTCFullYear(),
): string | null {
  const match = value ? /^(\d{2})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [, mm, dd, yy] = match;
  const century = Number(yy) > (referenceYear % 100) + 5 ? 1900 : 2000;
  const year = century + Number(yy);
  const month = mm === "00" ? "01" : mm;
  const day = dd === "00" ? "01" : dd;
  return `${year}-${month}-${day}`;
}

const imageOf = (images: JikanAnime["images"]): string | null =>
  images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? images?.webp?.image_url ?? null;

const defaultTitle = (raw: JikanAnime | JikanManga): string =>
  raw.titles?.find((t) => t.type === "Default")?.title ?? raw.title;

const englishTitle = (raw: JikanAnime | JikanManga): string | null =>
  raw.titles?.find((t) => t.type === "English")?.title ?? raw.title_english ?? null;

const jikanBase = (raw: JikanAnime | JikanManga) => ({
  malId: raw.mal_id,
  title: defaultTitle(raw),
  titleEnglish: englishTitle(raw),
  url: raw.url,
  imageUrl: imageOf(raw.images),
  type: raw.type ?? null,
  score: positiveOrNull(raw.score),
  scoredBy: raw.scored_by ?? null,
  rank: positiveOrNull(raw.rank),
  popularity: positiveOrNull(raw.popularity),
  members: raw.members ?? null,
  status: normalizeReleaseStatus(raw.status),
  genres: [...toTags(raw.genres), ...toTags(raw.explicit_genres)],
  themes: toTags(raw.themes),
  demographics: toTags(raw.demographics),
  detailed: true,
});

export function normalizeJikanAnime(raw: JikanAnime): Anime {
  const startDate = isoDate(raw.aired?.from);
  return {
    medium: "anime",
    ...jikanBase(raw),
    startDate,
    endDate: isoDate(raw.aired?.to),
    year: raw.year ?? yearOf(startDate),
    episodes: positiveOrNull(raw.episodes),
    episodeMinutes: parseDurationMinutes(raw.duration),
    studios: toTags(raw.studios),
    season: raw.season ?? null,
    source: raw.source ?? null,
  };
}

/** Jikan exposes authors without their story/art role, so role is always "unknown" here. */
const toAuthors = (entities: JikanEntity[] | undefined): Author[] =>
  toTags(entities).map((t) => ({ ...t, role: "unknown" }));

export function normalizeJikanManga(raw: JikanManga): Manga {
  const startDate = isoDate(raw.published?.from);
  return {
    medium: "manga",
    ...jikanBase(raw),
    startDate,
    endDate: isoDate(raw.published?.to),
    year: yearOf(startDate),
    chapters: positiveOrNull(raw.chapters),
    volumes: positiveOrNull(raw.volumes),
    authors: toAuthors(raw.authors),
    serializations: toTags(raw.serializations),
  };
}

const text = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

export function normalizeMalAnimeListEntry(raw: MalAnimeListEntry): ListEntry<Anime> {
  const startDate = parseMalShortDate(raw.anime_start_date_string);
  return {
    media: {
      medium: "anime",
      malId: raw.anime_id,
      title: text(raw.anime_title) ?? `#${raw.anime_id}`,
      titleEnglish: text(raw.anime_title_eng),
      url: MAL_BASE + raw.anime_url,
      imageUrl: raw.anime_image_path ?? null,
      type: raw.anime_media_type_string ?? null,
      score: positiveOrNull(raw.anime_score_val),
      scoredBy: raw.anime_total_scores ?? null,
      rank: null,
      popularity: positiveOrNull(raw.anime_popularity),
      members: raw.anime_total_members ?? null,
      status: MAL_RELEASE_STATUS[raw.anime_airing_status] ?? "unknown",
      genres: toTags(raw.genres),
      themes: [],
      demographics: toTags(raw.demographics),
      startDate,
      endDate: parseMalShortDate(raw.anime_end_date_string),
      year: raw.anime_season?.year ?? yearOf(startDate),
      detailed: false,
      episodes: positiveOrNull(raw.anime_num_episodes),
      episodeMinutes: null,
      studios: toTags(raw.anime_studios),
      season: raw.anime_season?.season?.toLowerCase() ?? null,
      source: null,
    },
    listStatus: normalizeListStatus(raw.status),
    userScore: positiveOrNull(raw.score),
    progress: { episodes: raw.num_watched_episodes ?? 0, chapters: 0, volumes: 0 },
    repeating: Boolean(raw.is_rewatching),
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000).toISOString() : null,
  };
}

export function normalizeMalMangaListEntry(raw: MalMangaListEntry): ListEntry<Manga> {
  const startDate = parseMalShortDate(raw.manga_start_date_string);
  return {
    media: {
      medium: "manga",
      malId: raw.manga_id,
      title: text(raw.manga_title) ?? `#${raw.manga_id}`,
      titleEnglish: text(raw.manga_english),
      url: MAL_BASE + raw.manga_url,
      imageUrl: raw.manga_image_path ?? null,
      type: raw.manga_media_type_string ?? null,
      score: positiveOrNull(raw.manga_score_val),
      scoredBy: raw.manga_total_scores ?? null,
      rank: null,
      popularity: positiveOrNull(raw.manga_popularity),
      members: raw.manga_total_members ?? null,
      status: MAL_RELEASE_STATUS[raw.manga_publishing_status] ?? "unknown",
      genres: toTags(raw.genres),
      themes: [],
      demographics: toTags(raw.demographics),
      startDate,
      endDate: parseMalShortDate(raw.manga_end_date_string),
      year: yearOf(startDate),
      detailed: false,
      chapters: positiveOrNull(raw.manga_num_chapters),
      volumes: positiveOrNull(raw.manga_num_volumes),
      authors: [],
      serializations: toTags(raw.manga_magazines),
    },
    listStatus: normalizeListStatus(raw.status),
    userScore: positiveOrNull(raw.score),
    progress: { episodes: 0, chapters: raw.num_read_chapters ?? 0, volumes: raw.num_read_volumes ?? 0 },
    repeating: Boolean(raw.is_rereading),
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000).toISOString() : null,
  };
}

/** Overlay full catalog details onto a list-feed media record, keeping list values Jikan lacks. */
export function mergeMedia<M extends Media>(base: M, details: M): M {
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(details)) {
    const isEmpty = value === null || (Array.isArray(value) && value.length === 0);
    if (!isEmpty || !(key in merged)) merged[key] = value;
  }
  merged.detailed = true;
  return merged as M;
}

export function normalizeJikanUser(raw: JikanUserFull): UserProfile {
  const a = raw.statistics?.anime;
  const m = raw.statistics?.manga;
  return {
    username: raw.username,
    url: raw.url,
    imageUrl: raw.images?.webp?.image_url ?? raw.images?.jpg?.image_url ?? null,
    joined: isoDate(raw.joined),
    lastOnline: raw.last_online ?? null,
    statistics: raw.statistics
      ? {
          anime: a
            ? {
                daysWatched: a.days_watched,
                meanScore: a.mean_score,
                completed: a.completed,
                episodesWatched: a.episodes_watched,
              }
            : null,
          manga: m
            ? {
                daysRead: m.days_read,
                meanScore: m.mean_score,
                completed: m.completed,
                chaptersRead: m.chapters_read,
                volumesRead: m.volumes_read,
              }
            : null,
        }
      : null,
  };
}
