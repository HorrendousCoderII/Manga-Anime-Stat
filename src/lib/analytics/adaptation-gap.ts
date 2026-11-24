import type { ListEntry, Medium, MediumMode } from "../types";
import { mean, round } from "./math";

/** Relation labels that indicate a manga↔anime adaptation (MAL snake_case or Jikan title case). */
const ADAPTATION_RELATIONS = new Set([
  "adaptation",
  "source",
  "parent_story",
  "parent story",
  "full_story",
  "full story",
  "alternative_version",
  "alternative version",
  "other",
]);

export type MatchSource = "relation" | "title";

export interface RelatedLink {
  medium: Medium;
  malId: number;
  title: string;
  relation: string;
}

export interface AdaptationSide {
  malId: number;
  title: string;
  url: string;
  imageUrl: string | null;
  /** MAL community mean score. */
  score: number;
  userScore: number | null;
}

export interface AdaptationPair {
  key: string;
  /** Display title — prefer the manga title, then the anime title. */
  seriesTitle: string;
  relation: string;
  matchSource: MatchSource;
  anime: AdaptationSide;
  manga: AdaptationSide;
  /** manga.score − anime.score (positive ⇒ source outscores adaptation). */
  delta: number;
  absDelta: number;
}

export interface AdaptationGapSummary {
  pairs: AdaptationPair[];
  /** Mean of (manga − anime) over pairs. */
  meanDelta: number | null;
  meanAbsDelta: number | null;
  mangaWins: number;
  animeWins: number;
  ties: number;
  relationPairs: number;
  titlePairs: number;
}

export function isAdaptationRelation(relation: string): boolean {
  return ADAPTATION_RELATIONS.has(relation.trim().toLowerCase());
}

/** Collapse punctuation / season noise so "Death Note" and "Death Note: Rewrite" can still match. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(tv|ova|ona|movie|special|season|part|cour|arc|the|a|an)\b/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKeys(entry: ListEntry): string[] {
  const raw = [entry.media.title, entry.media.titleEnglish].filter((t): t is string => Boolean(t));
  const keys = new Set<string>();
  for (const t of raw) {
    const full = normalizeTitle(t);
    if (full.length >= 3) keys.add(full);
    const head = normalizeTitle(t.split(":")[0] ?? t);
    if (head.length >= 3) keys.add(head);
  }
  return [...keys];
}

/** Loose equality used for on-list title pairing when relation IDs are unavailable. */
export function titlesLooselyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const min = Math.min(na.length, nb.length);
  if (min >= 8 && (na.startsWith(nb) || nb.startsWith(na))) return true;
  const ha = normalizeTitle(a.split(":")[0] ?? a);
  const hb = normalizeTitle(b.split(":")[0] ?? b);
  return ha.length >= 6 && ha === hb;
}

function sideFrom(entry: ListEntry): AdaptationSide | null {
  if (entry.media.score === null) return null;
  return {
    malId: entry.media.malId,
    title: entry.media.title,
    url: entry.media.url,
    imageUrl: entry.media.imageUrl,
    score: entry.media.score,
    userScore: entry.userScore,
  };
}

function makePair(
  animeEntry: ListEntry,
  mangaEntry: ListEntry,
  relation: string,
  matchSource: MatchSource,
): AdaptationPair | null {
  const anime = sideFrom(animeEntry);
  const manga = sideFrom(mangaEntry);
  if (!anime || !manga) return null;
  const delta = round(manga.score - anime.score)!;
  return {
    key: `${anime.malId}:${manga.malId}`,
    seriesTitle: manga.title || anime.title,
    relation,
    matchSource,
    anime,
    manga,
    delta,
    absDelta: Math.abs(delta),
  };
}

/**
 * Pair manga and anime that appear together on the user's lists.
 *
 * 1. Prefer cross-medium links from `relations` (MAL / Jikan Adaptation etc.).
 * 2. Fall back to normalized title matching so Combined mode still works when
 *    MAL's cross-medium related fields are empty and Jikan is unreachable.
 *
 * `list` should already be scoped to the current medium mode + chart filters.
 * For Anime/Manga modes the counterpart medium must still be present in `list`
 * (pass both media, filtered only on the focus side — see `scopeForGaps`).
 */
export function computeAdaptationGaps(
  list: ListEntry[],
  relations: ReadonlyMap<string, readonly RelatedLink[]> = new Map(),
): AdaptationGapSummary {
  const anime = new Map<number, ListEntry>();
  const manga = new Map<number, ListEntry>();
  for (const e of list) {
    if (e.media.medium === "anime") anime.set(e.media.malId, e);
    else manga.set(e.media.malId, e);
  }

  const pairs = new Map<string, AdaptationPair>();

  const remember = (pair: AdaptationPair | null) => {
    if (!pair) return;
    const existing = pairs.get(pair.key);
    // Relation matches beat title matches; keep the first relation we saw.
    if (!existing || (existing.matchSource === "title" && pair.matchSource === "relation")) {
      pairs.set(pair.key, pair);
    }
  };

  for (const [key, links] of relations) {
    const sep = key.indexOf(":");
    if (sep < 0) continue;
    const medium = key.slice(0, sep) as Medium;
    const id = Number(key.slice(sep + 1));
    if (!Number.isFinite(id)) continue;

    for (const link of links) {
      if (link.medium === medium) continue;
      if (!isAdaptationRelation(link.relation)) continue;
      if (medium === "anime" && link.medium === "manga") {
        const a = anime.get(id);
        const m = manga.get(link.malId);
        if (a && m) remember(makePair(a, m, link.relation, "relation"));
      } else if (medium === "manga" && link.medium === "anime") {
        const m = manga.get(id);
        const a = anime.get(link.malId);
        if (a && m) remember(makePair(a, m, link.relation, "relation"));
      }
    }
  }

  const mangaIndex = new Map<string, ListEntry[]>();
  for (const entry of manga.values()) {
    for (const k of titleKeys(entry)) {
      const bucket = mangaIndex.get(k);
      if (bucket) bucket.push(entry);
      else mangaIndex.set(k, [entry]);
    }
  }

  /** Title-match candidates: one manga may loosely match several seasons/movies — pick the best later. */
  const titleHits: { anime: ListEntry; manga: ListEntry }[] = [];
  for (const animeEntry of anime.values()) {
    const seen = new Set<number>();
    const animeTitles = [animeEntry.media.title, animeEntry.media.titleEnglish].filter(Boolean) as string[];
    for (const k of titleKeys(animeEntry)) {
      for (const mangaEntry of mangaIndex.get(k) ?? []) {
        if (seen.has(mangaEntry.media.malId)) continue;
        seen.add(mangaEntry.media.malId);
        const mangaTitles = [mangaEntry.media.title, mangaEntry.media.titleEnglish].filter(Boolean) as string[];
        const matched = animeTitles.some((at) => mangaTitles.some((mt) => titlesLooselyMatch(at, mt)));
        if (!matched) continue;
        titleHits.push({ anime: animeEntry, manga: mangaEntry });
      }
    }
  }

  const popularity = (e: ListEntry) => e.media.members ?? e.media.scoredBy ?? 0;
  const exactness = (a: ListEntry, m: ListEntry) => {
    const aKeys = new Set(titleKeys(a));
    return titleKeys(m).some((k) => aKeys.has(k)) ? 1 : 0;
  };
  // Prefer exact key overlap, then more popular anime, then more popular manga — one pair per manga and per anime.
  titleHits.sort(
    (x, y) =>
      exactness(y.anime, y.manga) - exactness(x.anime, x.manga) ||
      popularity(y.anime) - popularity(x.anime) ||
      popularity(y.manga) - popularity(x.manga),
  );
  const usedAnime = new Set<number>();
  const usedManga = new Set<number>();
  for (const hit of titleHits) {
    const aId = hit.anime.media.malId;
    const mId = hit.manga.media.malId;
    if (usedAnime.has(aId) || usedManga.has(mId)) continue;
    // Don't overwrite a relation pair for the same ids.
    if (pairs.has(`${aId}:${mId}`)) {
      usedAnime.add(aId);
      usedManga.add(mId);
      continue;
    }
    remember(makePair(hit.anime, hit.manga, "Title match", "title"));
    usedAnime.add(aId);
    usedManga.add(mId);
  }

  const sorted = [...pairs.values()].sort(
    (a, b) => b.absDelta - a.absDelta || a.seriesTitle.localeCompare(b.seriesTitle),
  );
  const deltas = sorted.map((p) => p.delta);
  return {
    pairs: sorted,
    meanDelta: round(mean(deltas)),
    meanAbsDelta: round(mean(deltas.map(Math.abs))),
    mangaWins: sorted.filter((p) => p.delta > 0).length,
    animeWins: sorted.filter((p) => p.delta < 0).length,
    ties: sorted.filter((p) => p.delta === 0).length,
    relationPairs: sorted.filter((p) => p.matchSource === "relation").length,
    titlePairs: sorted.filter((p) => p.matchSource === "title").length,
  };
}

/**
 * Build the entry list used for gap pairing.
 * Anime/Manga modes keep the opposite medium (unfiltered by year/units) so counterparts stay findable,
 * while the focus medium is limited to `filtered`. Combined requires both sides in `filtered`.
 */
export function scopeForGaps(
  allEntries: ListEntry[],
  filtered: ListEntry[],
  mode: MediumMode,
): ListEntry[] {
  if (mode === "combined") return filtered;
  const focus = new Set(filtered.map((e) => `${e.media.medium}:${e.media.malId}`));
  const opposite: Medium = mode === "anime" ? "manga" : "anime";
  const counterparts = allEntries.filter((e) => e.media.medium === opposite);
  const focused = filtered.filter((e) => e.media.medium === mode || focus.has(`${e.media.medium}:${e.media.malId}`));
  // Deduplicate by medium:id
  const map = new Map<string, ListEntry>();
  for (const e of [...focused, ...counterparts]) map.set(`${e.media.medium}:${e.media.malId}`, e);
  return [...map.values()];
}
