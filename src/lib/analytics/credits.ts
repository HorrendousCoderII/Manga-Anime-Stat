import type { Anime, ListEntry, Manga, Medium, Tag } from "../types";
import { mean, quantile, round, stdDev } from "./math";

export type ScoreSource = "user" | "global";

export interface CreditStat {
  name: string;
  /** Titles on the (filtered) list credited to this studio / magazine. */
  titles: number;
  /** Titles that have a score from the chosen source; all score stats below use these. */
  scored: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  /** Mean MAL score of the same titles, for comparison with the user's mean. */
  meanGlobal: number | null;
}

export function creditsOf(e: ListEntry): Tag[] {
  return e.media.medium === "anime" ? (e.media as Anime).studios : (e.media as Manga).serializations;
}

export function computeCreditStats(
  entries: ListEntry[],
  medium: Medium,
  { source = "user", minTitles = 2 }: { source?: ScoreSource; minTitles?: number } = {},
): CreditStat[] {
  const acc = new Map<string, { titles: number; scores: number[]; global: number[] }>();
  for (const e of entries) {
    if (e.media.medium !== medium) continue;
    const score = source === "user" ? e.userScore : e.media.score;
    for (const name of new Set(creditsOf(e).map((t) => t.name))) {
      let a = acc.get(name);
      if (!a) acc.set(name, (a = { titles: 0, scores: [], global: [] }));
      a.titles++;
      if (score !== null) {
        a.scores.push(score);
        if (e.media.score !== null) a.global.push(e.media.score);
      }
    }
  }
  return [...acc]
    .filter(([, a]) => a.titles >= minTitles)
    .map(([name, a]) => {
      const s = [...a.scores].sort((x, y) => x - y);
      return {
        name,
        titles: a.titles,
        scored: s.length,
        mean: round(mean(s)),
        std: round(stdDev(s)),
        min: s.length ? s[0] : null,
        q1: round(quantile(s, 0.25)),
        median: round(quantile(s, 0.5)),
        q3: round(quantile(s, 0.75)),
        max: s.length ? s[s.length - 1] : null,
        meanGlobal: round(mean(a.global)),
      };
    })
    .sort((a, b) => b.titles - a.titles || (b.mean ?? 0) - (a.mean ?? 0) || a.name.localeCompare(b.name));
}

/** Share of titles of `medium` that carry at least one studio / magazine credit. */
export function creditCoverage(entries: ListEntry[], medium: Medium): number {
  const scoped = entries.filter((e) => e.media.medium === medium);
  return scoped.length ? scoped.filter((e) => creditsOf(e).length > 0).length / scoped.length : 0;
}
