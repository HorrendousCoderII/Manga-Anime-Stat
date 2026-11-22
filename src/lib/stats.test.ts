import { describe, expect, it } from "vitest";
import { computeKpis } from "./stats";
import type { Anime, ListEntry, ListStatus, Manga } from "./types";

const tags = (...names: string[]) => names.map((name, id) => ({ id, name }));

function anime(id: number, o: Partial<Anime> & { userScore?: number | null; listStatus?: ListStatus; eps?: number } = {}): ListEntry<Anime> {
  const { userScore = null, listStatus = "completed", eps = 12, ...media } = o;
  return {
    media: {
      medium: "anime", malId: id, title: `A${id}`, titleEnglish: null, url: "", imageUrl: null, type: "TV",
      score: 7, scoredBy: null, rank: null, popularity: null, members: null, status: "finished",
      genres: [], themes: [], demographics: [], startDate: null, endDate: null, year: null, detailed: false,
      episodes: 12, episodeMinutes: null, studios: [], season: null, source: null, ...media,
    },
    listStatus, userScore, progress: { episodes: eps, chapters: 0, volumes: 0 }, repeating: false, updatedAt: null,
  };
}

function manga(id: number, o: Partial<Manga> & { userScore?: number | null; ch?: number; vol?: number } = {}): ListEntry<Manga> {
  const { userScore = null, ch = 100, vol = 10, ...media } = o;
  return {
    media: {
      medium: "manga", malId: id, title: `M${id}`, titleEnglish: null, url: "", imageUrl: null, type: "Manga",
      score: 8, scoredBy: null, rank: null, popularity: null, members: null, status: "finished",
      genres: [], themes: [], demographics: [], startDate: null, endDate: null, year: null, detailed: false,
      chapters: 100, volumes: 10, authors: [], serializations: [], ...media,
    },
    listStatus: "completed", userScore, progress: { episodes: 0, chapters: ch, volumes: vol }, repeating: false, updatedAt: null,
  };
}

describe("computeKpis", () => {
  it("computes completion, paired score means and delta", () => {
    const entries = [
      anime(1, { userScore: 9, score: 8 }),
      anime(2, { userScore: 5, score: 7 }),
      anime(3, { userScore: null, score: 9, listStatus: "dropped" }),
      anime(4, { userScore: 8, score: null }),
    ];
    const k = computeKpis(entries, "anime");
    expect(k.completed).toBe(3);
    expect(k.totalEntries).toBe(4);
    expect(k.score).toEqual({ meanUser: 7, meanGlobal: 7.5, delta: -0.5, paired: 2 });
  });

  it("estimates watch hours with 24 min/ep fallback and real runtimes", () => {
    const k = computeKpis([anime(1, { eps: 10, episodeMinutes: 30 }), anime(2, { eps: 5 })], "anime");
    expect(k.watch).toEqual({ hours: 7, episodes: 15, source: "list", estimatedShare: 0.5 });
  });

  it("prefers profile watch days when available", () => {
    const k = computeKpis([anime(1)], "anime", { anime: { daysWatched: 2, meanScore: 0, completed: 0, episodesWatched: 0 }, manga: null });
    expect(k.watch?.hours).toBe(48);
    expect(k.watch?.source).toBe("profile");
  });

  it("ranks top genre among completed titles and studio among detailed ones", () => {
    const entries = [
      anime(1, { genres: tags("Action", "Drama"), studios: tags("Bones"), detailed: true }),
      anime(2, { genres: tags("Action"), studios: tags("Madhouse"), detailed: true }),
      anime(3, { genres: tags("Drama"), studios: tags("Bones"), detailed: true }),
      anime(4, { genres: tags("Action") }),
      anime(5, { genres: tags("Romance"), listStatus: "planned" }),
    ];
    const k = computeKpis(entries, "anime");
    expect(k.topGenre).toEqual({ name: "Action", count: 3, share: 0.75 });
    expect(k.topStudio).toMatchObject({ name: "Bones", count: 2, coverage: 0.75 });
    expect(k.topMagazine).toBeNull();
  });

  it("sums chapters/volumes and ranks magazines for manga", () => {
    const entries = [
      manga(1, { ch: 50, vol: 5, serializations: tags("Weekly Shounen Jump"), detailed: true }),
      manga(2, { ch: 25, vol: 2, serializations: tags("Weekly Shounen Jump"), detailed: true }),
    ];
    const k = computeKpis(entries, "manga");
    expect(k.read).toEqual({ chapters: 75, volumes: 7 });
    expect(k.watch).toBeNull();
    expect(k.topMagazine).toMatchObject({ name: "Weekly Shounen Jump", count: 2, coverage: 1 });
  });

  it("combines both media and filters by mode", () => {
    const entries = [anime(1, { userScore: 8, score: 7 }), manga(2, { userScore: 6, score: 8 })];
    const combined = computeKpis(entries, "combined");
    expect(combined.completed).toBe(2);
    expect(combined.score.delta).toBe(-0.5);
    expect(combined.watch).not.toBeNull();
    expect(combined.read).not.toBeNull();
    expect(computeKpis(entries, "manga").totalEntries).toBe(1);
  });

  it("handles an empty list", () => {
    const k = computeKpis([], "combined");
    expect(k.score).toEqual({ meanUser: null, meanGlobal: null, delta: null, paired: 0 });
    expect(k.topGenre).toBeNull();
  });
});
