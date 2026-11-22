import type { Anime, Author, AuthorRole, ListEntry, ListStatus, Manga, ReleaseStatus } from "../types";
import { splitMalGenres } from "./genres";
import type { MalAnimeListStatus, MalAnimeNode, MalMangaListStatus, MalMangaNode } from "./raw";

const positiveOrNull = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

/** MAL dates may be "2017", "2017-10" or "2017-10-04"; missing parts become 01. */
export function normalizeMalDate(value: string | undefined): string | null {
  const match = value ? /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value) : null;
  if (!match) return null;
  return `${match[1]}-${match[2] ?? "01"}-${match[3] ?? "01"}`;
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  tv: "TV",
  ova: "OVA",
  ona: "ONA",
  pv: "PV",
  cm: "CM",
  tv_special: "TV Special",
  one_shot: "One-shot",
  oel: "OEL",
  light_novel: "Light Novel",
  "4_koma_manga": "4-koma Manga",
};

/** "light_novel" → "Light Novel", "tv" → "TV". */
export function malLabel(value: string | undefined): string | null {
  if (!value || value === "unknown") return null;
  return (
    MEDIA_TYPE_LABELS[value] ??
    value
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

const RELEASE_STATUS: Record<string, ReleaseStatus> = {
  finished_airing: "finished",
  finished: "finished",
  currently_airing: "airing",
  currently_publishing: "airing",
  not_yet_aired: "upcoming",
  not_yet_published: "upcoming",
  on_hiatus: "hiatus",
  discontinued: "discontinued",
};

const LIST_STATUS: Record<string, ListStatus> = {
  watching: "in_progress",
  reading: "in_progress",
  completed: "completed",
  on_hold: "on_hold",
  dropped: "dropped",
  plan_to_watch: "planned",
  plan_to_read: "planned",
};

export function normalizeMalAuthorRole(role: string | undefined): AuthorRole {
  const r = role?.toLowerCase().replace(/\s+/g, "") ?? "";
  if (r === "story&art") return "story_and_art";
  if (r === "story") return "story";
  if (r === "art") return "art";
  return "unknown";
}

const mediaUrl = (medium: "anime" | "manga", id: number) => `https://myanimelist.net/${medium}/${id}`;

function baseFields(node: MalAnimeNode | MalMangaNode) {
  const startDate = normalizeMalDate(node.start_date);
  return {
    malId: node.id,
    title: String(node.title),
    titleEnglish: node.alternative_titles?.en || null,
    imageUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    type: malLabel(node.media_type),
    score: positiveOrNull(node.mean),
    scoredBy: node.num_scoring_users ?? null,
    rank: positiveOrNull(node.rank),
    popularity: positiveOrNull(node.popularity),
    members: node.num_list_users ?? null,
    status: (node.status && RELEASE_STATUS[node.status]) || ("unknown" as ReleaseStatus),
    ...splitMalGenres(node.genres),
    startDate,
    endDate: normalizeMalDate(node.end_date),
    year: startDate ? Number(startDate.slice(0, 4)) : null,
    detailed: true,
  };
}

export function normalizeMalAnime(node: MalAnimeNode): Anime {
  const base = baseFields(node);
  const seconds = positiveOrNull(node.average_episode_duration);
  return {
    medium: "anime",
    ...base,
    url: mediaUrl("anime", node.id),
    year: node.start_season?.year ?? base.year,
    episodes: positiveOrNull(node.num_episodes),
    episodeMinutes: seconds === null ? null : Math.round((seconds / 60) * 100) / 100,
    studios: (node.studios ?? []).map(({ id, name }) => ({ id, name })),
    season: node.start_season?.season ?? null,
    source: malLabel(node.source),
  };
}

export function normalizeMalManga(node: MalMangaNode): Manga {
  const authors: Author[] = (node.authors ?? []).map(({ node: a, role }) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || `#${a.id}`,
    role: normalizeMalAuthorRole(role),
  }));
  return {
    medium: "manga",
    ...baseFields(node),
    url: mediaUrl("manga", node.id),
    chapters: positiveOrNull(node.num_chapters),
    volumes: positiveOrNull(node.num_volumes),
    authors,
    serializations: (node.serialization ?? []).map(({ node: s }) => ({ id: s.id, name: s.name })),
  };
}

export function normalizeMalApiAnimeEntry(node: MalAnimeNode, status: MalAnimeListStatus = {}): ListEntry<Anime> {
  return {
    media: normalizeMalAnime(node),
    listStatus: (status.status && LIST_STATUS[status.status]) || "planned",
    userScore: positiveOrNull(status.score),
    progress: { episodes: status.num_episodes_watched ?? 0, chapters: 0, volumes: 0 },
    repeating: Boolean(status.is_rewatching),
    updatedAt: status.updated_at ?? null,
  };
}

export function normalizeMalApiMangaEntry(node: MalMangaNode, status: MalMangaListStatus = {}): ListEntry<Manga> {
  return {
    media: normalizeMalManga(node),
    listStatus: (status.status && LIST_STATUS[status.status]) || "planned",
    userScore: positiveOrNull(status.score),
    progress: { episodes: 0, chapters: status.num_chapters_read ?? 0, volumes: status.num_volumes_read ?? 0 },
    repeating: Boolean(status.is_rereading),
    updatedAt: status.updated_at ?? null,
  };
}
