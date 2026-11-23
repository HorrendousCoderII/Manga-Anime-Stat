import { FALLBACK_EPISODE_MINUTES } from "../stats";
import type { ListEntry, Tag } from "../types";
import { mean, round } from "./math";

export type TagGroup = "genres" | "themes" | "demographics";

/** Rough reading time per manga chapter, used only to put manga on the same time axis as anime in Combined mode. */
export const READING_MINUTES_PER_CHAPTER = 5;

export const SCORE_BUCKETS = ["≤4", "5", "6", "7", "8", "9", "10", "—"] as const;

export function scoreBucket(score: number | null): number {
  if (score === null) return SCORE_BUCKETS.length - 1;
  return Math.max(0, Math.min(6, score - 4));
}

export interface TimeSpent {
  titles: number;
  /** Anime watch hours plus estimated manga reading hours. */
  hours: number;
  chapters: number;
}

export interface TagStat extends TimeSpent {
  name: string;
  scored: number;
  meanUser: number | null;
  meanGlobal: number | null;
  /** Time spent per user-score bucket, indexed like SCORE_BUCKETS. */
  buckets: TimeSpent[];
}

export function entryTime(e: ListEntry): { hours: number; chapters: number } {
  if (e.media.medium === "anime") {
    return { hours: (e.progress.episodes * (e.media.episodeMinutes ?? FALLBACK_EPISODE_MINUTES)) / 60, chapters: 0 };
  }
  return { hours: (e.progress.chapters * READING_MINUTES_PER_CHAPTER) / 60, chapters: e.progress.chapters };
}

const emptyTime = (): TimeSpent => ({ titles: 0, hours: 0, chapters: 0 });

function addTime(t: TimeSpent, time: { hours: number; chapters: number }) {
  t.titles++;
  t.hours += time.hours;
  t.chapters += time.chapters;
}

/** Totals over the titles themselves; summing per-tag totals would count multi-tag titles several times. */
export function totalTime(entries: ListEntry[]): TimeSpent {
  const t = emptyTime();
  for (const e of entries) addTime(t, entryTime(e));
  return t;
}

/** Per-tag counts, time spent and mean scores, sorted by title count. Each tag is counted once per title. */
export function computeTagBreakdown(entries: ListEntry[], group: TagGroup): TagStat[] {
  const acc = new Map<string, TimeSpent & { user: number[]; global: number[]; buckets: TimeSpent[] }>();
  for (const e of entries) {
    const tags: Tag[] = e.media[group];
    if (!tags.length) continue;
    const time = entryTime(e);
    for (const name of new Set(tags.map((t) => t.name))) {
      let a = acc.get(name);
      if (!a) {
        a = { ...emptyTime(), user: [], global: [], buckets: SCORE_BUCKETS.map(emptyTime) };
        acc.set(name, a);
      }
      addTime(a, time);
      addTime(a.buckets[scoreBucket(e.userScore)], time);
      if (e.userScore !== null) a.user.push(e.userScore);
      if (e.media.score !== null) a.global.push(e.media.score);
    }
  }
  return [...acc]
    .map(([name, a]) => ({
      name,
      titles: a.titles,
      hours: round(a.hours, 1)!,
      chapters: a.chapters,
      scored: a.user.length,
      meanUser: round(mean(a.user)),
      meanGlobal: round(mean(a.global)),
      buckets: a.buckets.map((b) => ({ ...b, hours: round(b.hours, 1)! })),
    }))
    .sort((a, b) => b.titles - a.titles || b.hours - a.hours || a.name.localeCompare(b.name));
}

export interface ShareSlice {
  name: string;
  value: number;
}

/** Top `limit` items by `value`, with everything else folded into one "Other" slice. */
export function topWithOther<T>(items: T[], value: (t: T) => number, name: (t: T) => string, limit = 8): ShareSlice[] {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const slices = sorted.slice(0, limit).map((t) => ({ name: name(t), value: value(t) }));
  const rest = sorted.slice(limit).reduce((sum, t) => sum + value(t), 0);
  if (rest > 0) slices.push({ name: "Other", value: rest });
  return slices.filter((s) => s.value > 0);
}
