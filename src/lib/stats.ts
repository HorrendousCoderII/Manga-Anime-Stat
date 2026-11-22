import type { Anime, ListEntry, Manga, MediumMode, Tag, UserStatistics } from "./types";

/** Used when an anime's per-episode runtime is not known yet (typical TV episode). */
export const FALLBACK_EPISODE_MINUTES = 24;

export interface RankedTag {
  name: string;
  count: number;
  /** Share of the counted entries carrying this tag (0–1). */
  share: number;
}

export interface KpiSummary {
  mode: MediumMode;
  totalEntries: number;
  completed: number;
  score: {
    meanUser: number | null;
    meanGlobal: number | null;
    /** Mean of (user − global) over titles that have both scores. */
    delta: number | null;
    paired: number;
  };
  watch: { hours: number; episodes: number; source: "profile" | "list"; estimatedShare: number } | null;
  read: { chapters: number; volumes: number } | null;
  topGenre: RankedTag | null;
  topStudio: (RankedTag & { coverage: number }) | null;
  topMagazine: (RankedTag & { coverage: number }) | null;
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

const round = (n: number | null, digits = 2): number | null =>
  n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;

function rankTags(entries: ListEntry[], pick: (e: ListEntry) => Tag[]): RankedTag | null {
  const counts = new Map<string, number>();
  let counted = 0;
  for (const entry of entries) {
    const tags = pick(entry);
    if (!tags.length) continue;
    counted++;
    for (const name of new Set(tags.map((t) => t.name))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: RankedTag | null = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count || (count === best.count && name < best.name)) {
      best = { name, count, share: count / counted };
    }
  }
  return best;
}

/** Ranks among completed titles, falling back to everything started when nothing is completed yet. */
function rankingPool(entries: ListEntry[]): ListEntry[] {
  const completed = entries.filter((e) => e.listStatus === "completed");
  return completed.length ? completed : entries.filter((e) => e.listStatus !== "planned");
}

function rankCredits(entries: ListEntry[], pick: (e: ListEntry) => Tag[]) {
  const pool = rankingPool(entries);
  const known = pool.filter((e) => e.media.detailed || pick(e).length > 0);
  const top = rankTags(known, pick);
  return top ? { ...top, coverage: pool.length ? known.length / pool.length : 0 } : null;
}

export function computeKpis(
  entries: ListEntry[],
  mode: MediumMode,
  statistics: UserStatistics | null = null,
): KpiSummary {
  const scoped = mode === "combined" ? entries : entries.filter((e) => e.media.medium === mode);
  const anime = scoped.filter((e): e is ListEntry<Anime> => e.media.medium === "anime");
  const manga = scoped.filter((e): e is ListEntry<Manga> => e.media.medium === "manga");

  // User and global means use the same title set so the delta is their difference.
  const paired = scoped.filter((e) => e.userScore !== null && e.media.score !== null);

  let watch: KpiSummary["watch"] = null;
  if (mode !== "manga") {
    const episodes = anime.reduce((sum, e) => sum + e.progress.episodes, 0);
    const watched = anime.filter((e) => e.progress.episodes > 0);
    const estimated = watched.filter((e) => e.media.episodeMinutes === null).length;
    const listMinutes = watched.reduce(
      (sum, e) => sum + e.progress.episodes * (e.media.episodeMinutes ?? FALLBACK_EPISODE_MINUTES),
      0,
    );
    const profileDays = statistics?.anime?.daysWatched;
    watch =
      profileDays !== undefined && profileDays > 0
        ? { hours: round(profileDays * 24, 1)!, episodes, source: "profile", estimatedShare: 0 }
        : {
            hours: round(listMinutes / 60, 1)!,
            episodes,
            source: "list",
            estimatedShare: watched.length ? estimated / watched.length : 0,
          };
  }

  const read: KpiSummary["read"] =
    mode === "anime"
      ? null
      : {
          chapters: manga.reduce((sum, e) => sum + e.progress.chapters, 0),
          volumes: manga.reduce((sum, e) => sum + e.progress.volumes, 0),
        };

  return {
    mode,
    totalEntries: scoped.length,
    completed: scoped.filter((e) => e.listStatus === "completed").length,
    score: {
      meanUser: round(mean(paired.map((e) => e.userScore!))),
      meanGlobal: round(mean(paired.map((e) => e.media.score!))),
      delta: round(mean(paired.map((e) => e.userScore! - e.media.score!))),
      paired: paired.length,
    },
    watch,
    read,
    topGenre: rankTags(rankingPool(scoped), (e) => e.media.genres),
    topStudio: mode === "manga" ? null : rankCredits(anime, (e) => (e.media as Anime).studios),
    topMagazine: mode === "anime" ? null : rankCredits(manga, (e) => (e.media as Manga).serializations),
  };
}
