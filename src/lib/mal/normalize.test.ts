import { describe, expect, it } from "vitest";
import animeList from "../__fixtures__/mal-api-animelist.json";
import mangaList from "../__fixtures__/mal-api-mangalist.json";
import { splitMalGenres } from "./genres";
import {
  malLabel,
  normalizeMalApiAnimeEntry,
  normalizeMalApiMangaEntry,
  normalizeMalAuthorRole,
  normalizeMalDate,
  normalizeMalManga,
} from "./normalize";
import type { MalAnimeListStatus, MalAnimeNode, MalMangaListStatus, MalMangaNode } from "./raw";

const anime = (i: number) =>
  normalizeMalApiAnimeEntry(animeList.data[i].node as MalAnimeNode, animeList.data[i].list_status as MalAnimeListStatus);
const manga = (i: number) =>
  normalizeMalApiMangaEntry(mangaList.data[i].node as MalMangaNode, mangaList.data[i].list_status as MalMangaListStatus);

describe("splitMalGenres", () => {
  it("separates genres, themes and demographics by name", () => {
    const split = splitMalGenres([
      { id: 1, name: "Action" },
      { id: 50, name: "Adult Cast" },
      { id: 27, name: "Shounen" },
      { id: 41, name: "Seinen" },
      { id: 23, name: "School" },
      { id: 999, name: "Brand New Tag" },
    ]);
    expect(split.genres.map((t) => t.name)).toEqual(["Action", "Brand New Tag"]);
    expect(split.themes.map((t) => t.name)).toEqual(["Adult Cast", "School"]);
    expect(split.demographics.map((t) => t.name)).toEqual(["Shounen", "Seinen"]);
  });

  it("handles a missing list", () => {
    expect(splitMalGenres(undefined)).toEqual({ genres: [], themes: [], demographics: [] });
  });
});

describe("MAL v2 helpers", () => {
  it("pads partial dates", () => {
    expect(normalizeMalDate("2017-10-04")).toBe("2017-10-04");
    expect(normalizeMalDate("2017-10")).toBe("2017-10-01");
    expect(normalizeMalDate("2017")).toBe("2017-01-01");
    expect(normalizeMalDate(undefined)).toBeNull();
  });

  it("labels media types and sources", () => {
    expect(malLabel("tv")).toBe("TV");
    expect(malLabel("light_novel")).toBe("Light Novel");
    expect(malLabel("manhwa")).toBe("Manhwa");
    expect(malLabel("one_shot")).toBe("One-shot");
    expect(malLabel("4_koma_manga")).toBe("4-koma Manga");
    expect(malLabel("unknown")).toBeNull();
  });

  it("maps author roles", () => {
    expect(normalizeMalAuthorRole("Story & Art")).toBe("story_and_art");
    expect(normalizeMalAuthorRole("Story")).toBe("story");
    expect(normalizeMalAuthorRole("Art")).toBe("art");
    expect(normalizeMalAuthorRole("Original Creator")).toBe("unknown");
  });
});

describe("normalizeMalApiAnimeEntry", () => {
  it("maps a completed anime with nested fields", () => {
    const e = anime(0);
    expect(e).toMatchObject({ listStatus: "completed", userScore: 10, progress: { episodes: 26 }, repeating: false });
    expect(e.media).toMatchObject({
      medium: "anime",
      malId: 1,
      title: "Cowboy Bebop",
      titleEnglish: "Cowboy Bebop",
      url: "https://myanimelist.net/anime/1",
      type: "TV",
      score: 8.75,
      scoredBy: 1009341,
      members: 1988211,
      status: "finished",
      startDate: "1998-04-03",
      year: 1998,
      season: "spring",
      source: "Original",
      episodes: 26,
      episodeMinutes: 24,
      detailed: true,
    });
    expect(e.media.imageUrl).toMatch(/19644l\.jpg$/);
    expect(e.media.studios).toEqual([{ id: 14, name: "Sunrise" }]);
    expect(e.media.genres.map((g) => g.name)).toEqual(["Action", "Award Winning", "Sci-Fi"]);
    expect(e.media.themes.map((g) => g.name)).toEqual(["Adult Cast", "Space"]);
    expect(e.media.demographics).toEqual([]);
  });

  it("treats 0 counts and scores as unknown", () => {
    const e = anime(1);
    expect(e.listStatus).toBe("in_progress");
    expect(e.userScore).toBeNull();
    expect(e.media.episodes).toBeNull();
    expect(e.media.status).toBe("airing");
    expect(e.media.startDate).toBe("1999-10-01");
    expect(e.media.demographics.map((d) => d.name)).toEqual(["Shounen"]);
    expect(e.media.imageUrl).toMatch(/138851\.jpg$/);
  });
});

describe("normalizeMalApiMangaEntry", () => {
  it("maps manga-specific fields including author roles", () => {
    const e = manga(0);
    expect(e).toMatchObject({ listStatus: "in_progress", userScore: 9, progress: { chapters: 364, volumes: 41, episodes: 0 } });
    expect(e.media).toMatchObject({
      medium: "manga",
      type: "Manga",
      status: "hiatus",
      chapters: null,
      volumes: null,
      year: 1989,
    });
    expect(e.media.authors).toEqual([
      { id: 1868, name: "Kentarou Miura", role: "story_and_art" },
      { id: 49592, name: "Studio Gaga", role: "art" },
    ]);
    expect(e.media.themes.map((t) => t.name)).toEqual(["Gore", "Mythology"]);
    expect(e.media.demographics.map((t) => t.name)).toEqual(["Seinen"]);
  });

  it("leaves list entries without serialization undetailed so magazines get enriched", () => {
    const e = manga(0);
    expect(e.media.serializations).toEqual([]);
    expect(e.media.detailed).toBe(false);
  });

  it("keeps serialization when the node includes it", () => {
    const node = {
      ...(mangaList.data[0].node as MalMangaNode),
      serialization: [{ node: { id: 2, name: "Young Animal" } }],
    };
    const e = normalizeMalApiMangaEntry(node);
    expect(e.media.serializations).toEqual([{ id: 2, name: "Young Animal" }]);
    expect(e.media.detailed).toBe(true);
    expect(normalizeMalManga(node).serializations).toEqual([{ id: 2, name: "Young Animal" }]);
  });
});
