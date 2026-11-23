import type { ListEntry, ListStatus, MediumMode } from "../types";

export interface ChartFilters {
  /** Inclusive release-year bounds; null means unbounded. */
  yearFrom: number | null;
  yearTo: number | null;
  /** Anime only. */
  minEpisodes: number;
  /** Manga only. */
  minChapters: number;
  statuses: ListStatus[];
}

export const ALL_STATUSES: ListStatus[] = ["completed", "in_progress", "on_hold", "dropped", "planned"];

export const DEFAULT_FILTERS: ChartFilters = {
  yearFrom: null,
  yearTo: null,
  minEpisodes: 0,
  minChapters: 0,
  statuses: ["completed", "in_progress", "on_hold", "dropped"],
};

export function scopeEntries(entries: ListEntry[], mode: MediumMode): ListEntry[] {
  return mode === "combined" ? entries : entries.filter((e) => e.media.medium === mode);
}

export function releaseYear(entry: ListEntry): number | null {
  if (entry.media.year) return entry.media.year;
  const y = entry.media.startDate ? Number.parseInt(entry.media.startDate.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}

/**
 * Episode or chapter count of the title. MAL reports 0/null for ongoing or unknown counts, so the
 * user's own progress stands in as a lower bound.
 */
export function unitCount(entry: ListEntry): number {
  const m = entry.media;
  if (m.medium === "anime") return m.episodes || entry.progress.episodes;
  return m.chapters || entry.progress.chapters;
}

export function yearExtent(entries: ListEntry[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of entries) {
    const y = releaseYear(e);
    if (y === null) continue;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return lo <= hi ? [lo, hi] : null;
}

export function applyFilters(entries: ListEntry[], mode: MediumMode, f: ChartFilters): ListEntry[] {
  const statuses = new Set(f.statuses);
  const bounded = f.yearFrom !== null || f.yearTo !== null;
  return scopeEntries(entries, mode).filter((e) => {
    if (!statuses.has(e.listStatus)) return false;
    if (bounded) {
      const y = releaseYear(e);
      if (y === null) return false;
      if (f.yearFrom !== null && y < f.yearFrom) return false;
      if (f.yearTo !== null && y > f.yearTo) return false;
    }
    const min = e.media.medium === "anime" ? f.minEpisodes : f.minChapters;
    return min <= 0 || unitCount(e) >= min;
  });
}
