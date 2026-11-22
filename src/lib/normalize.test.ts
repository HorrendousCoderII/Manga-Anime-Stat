import { describe, expect, it } from "vitest";
import jikanAnime from "./__fixtures__/jikan-anime.json";
import jikanManga from "./__fixtures__/jikan-manga.json";
import malAnimeList from "./__fixtures__/mal-animelist.json";
import malMangaList from "./__fixtures__/mal-mangalist.json";
import type { JikanAnime, JikanManga, MalAnimeListEntry, MalMangaListEntry } from "./jikan/raw";
import {
  mergeMedia,
  normalizeJikanAnime,
  normalizeJikanManga,
  normalizeJikanUser,
  normalizeListStatus,
  normalizeMalAnimeListEntry,
  normalizeMalMangaListEntry,
  normalizeReleaseStatus,
  parseDurationMinutes,
  parseMalShortDate,
} from "./normalize";

describe("parseDurationMinutes", () => {
  it.each([
    ["24 min per ep", 24],
    ["1 hr 55 min", 115],
    ["2 hr", 120],
    ["45 sec per ep", 0.75],
    ["Unknown", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(parseDurationMinutes(input)).toBe(expected);
  });
});

describe("status mapping", () => {
  it("maps Jikan release statuses for both media", () => {
    expect(normalizeReleaseStatus("Finished Airing")).toBe("finished");
    expect(normalizeReleaseStatus("Publishing")).toBe("airing");
    expect(normalizeReleaseStatus("Not yet published")).toBe("upcoming");
    expect(normalizeReleaseStatus("On Hiatus")).toBe("hiatus");
    expect(normalizeReleaseStatus(undefined)).toBe("unknown");
  });

  it("maps MAL list status codes (5 is unused by MAL)", () => {
    expect([1, 2, 3, 4, 6].map(normalizeListStatus)).toEqual(["in_progress", "completed", "on_hold", "dropped", "planned"]);
  });
});

describe("parseMalShortDate", () => {
  it("expands two-digit years relative to the reference year", () => {
    expect(parseMalShortDate("10-20-99", 2026)).toBe("1999-10-20");
    expect(parseMalShortDate("04-03-24", 2026)).toBe("2024-04-03");
    expect(parseMalShortDate("00-00-08", 2026)).toBe("2008-01-01");
    expect(parseMalShortDate(null)).toBeNull();
    expect(parseMalShortDate("garbage")).toBeNull();
  });
});

describe("normalizeJikanAnime", () => {
  const anime = normalizeJikanAnime(jikanAnime as JikanAnime);

  it("maps shared and anime-specific fields", () => {
    expect(anime).toMatchObject({
      medium: "anime",
      malId: 1,
      title: "Cowboy Bebop",
      type: "TV",
      score: 8.75,
      rank: 46,
      status: "finished",
      startDate: "1998-04-03",
      endDate: "1999-04-24",
      year: 1998,
      episodes: 26,
      episodeMinutes: 24,
      season: "spring",
      source: "Original",
      detailed: true,
    });
    expect(anime.studios).toEqual([{ id: 14, name: "Sunrise" }]);
    expect(anime.themes.map((t) => t.name)).toEqual(["Adult Cast", "Space"]);
    expect(anime.imageUrl).toMatch(/19644l\.jpg$/);
  });
});

describe("normalizeJikanManga", () => {
  const manga = normalizeJikanManga(jikanManga as JikanManga);

  it("maps manga-specific fields and keeps unknown counts null", () => {
    expect(manga).toMatchObject({
      medium: "manga",
      malId: 2,
      status: "airing",
      chapters: null,
      volumes: null,
      year: 1989,
      endDate: null,
    });
    expect(manga.serializations).toEqual([{ id: 2, name: "Young Animal" }]);
    expect(manga.authors).toEqual([
      { id: 1868, name: "Miura, Kentarou", role: "unknown" },
      { id: 49592, name: "Studio Gaga", role: "unknown" },
    ]);
    expect(manga.demographics.map((d) => d.name)).toEqual(["Seinen"]);
  });
});

describe("MAL list feed normalizers", () => {
  it("maps an anime list row to a list entry", () => {
    const entry = normalizeMalAnimeListEntry(malAnimeList[0] as MalAnimeListEntry);
    expect(entry.listStatus).toBe("in_progress");
    expect(entry.userScore).toBe(9);
    expect(entry.progress.episodes).toBe(623);
    expect(entry.media).toMatchObject({
      medium: "anime",
      malId: 21,
      title: "One Piece",
      url: "https://myanimelist.net/anime/21/One_Piece",
      score: 8.72,
      episodes: null,
      status: "airing",
      startDate: "1999-10-20",
      detailed: false,
    });
    expect(entry.media.genres.map((g) => g.name)).toEqual(["Action", "Adventure", "Fantasy"]);
  });

  it("maps a manga list row to a list entry", () => {
    const entry = normalizeMalMangaListEntry(malMangaList[0] as MalMangaListEntry);
    expect(entry.media).toMatchObject({ medium: "manga", malId: 14090, chapters: 178, volumes: 19, status: "finished" });
    expect(entry.progress).toEqual({ episodes: 0, chapters: 28, volumes: 0 });
    expect(entry.media.serializations).toEqual([]);
  });

  it("stringifies numeric titles (MAL returns e.g. 86 as a number)", () => {
    const row = { ...(malAnimeList[0] as MalAnimeListEntry), anime_title: 86 };
    expect(normalizeMalAnimeListEntry(row).media.title).toBe("86");
  });

  it("treats a 0 user score as unscored", () => {
    const row = { ...(malAnimeList[0] as MalAnimeListEntry), score: 0 };
    expect(normalizeMalAnimeListEntry(row).userScore).toBeNull();
  });
});

describe("mergeMedia", () => {
  it("overlays Jikan details while keeping list values Jikan lacks", () => {
    const base = normalizeMalAnimeListEntry(malAnimeList[0] as MalAnimeListEntry).media;
    const details = { ...normalizeJikanAnime(jikanAnime as JikanAnime), malId: 21, demographics: [] };
    const merged = mergeMedia(base, details);
    expect(merged.detailed).toBe(true);
    expect(merged.studios).toEqual([{ id: 14, name: "Sunrise" }]);
    expect(merged.episodeMinutes).toBe(24);
    expect(merged.demographics.map((d) => d.name)).toEqual(["Shounen"]);
  });
});

describe("normalizeJikanUser", () => {
  it("maps profile statistics", () => {
    const profile = normalizeJikanUser({
      mal_id: 1,
      username: "Xinil",
      url: "https://myanimelist.net/profile/Xinil",
      joined: "2004-11-05T00:00:00+00:00",
      statistics: {
        anime: { days_watched: 120.5, mean_score: 7.1, completed: 300, episodes_watched: 7000 },
        manga: { days_read: 10, mean_score: 7.5, completed: 40, chapters_read: 2000, volumes_read: 150 },
      },
    });
    expect(profile.joined).toBe("2004-11-05");
    expect(profile.statistics?.anime?.daysWatched).toBe(120.5);
    expect(profile.statistics?.manga?.volumesRead).toBe(150);
  });
});
