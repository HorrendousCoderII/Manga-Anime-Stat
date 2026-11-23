import type { Anime, ListEntry, ListStatus, Manga } from "@/lib/types";

export const tags = (...names: string[]) => names.map((name, id) => ({ id, name }));

type EntryOpts = { userScore?: number | null; listStatus?: ListStatus };

export function anime(id: number, o: Partial<Anime> & EntryOpts & { eps?: number } = {}): ListEntry<Anime> {
  const { userScore = null, listStatus = "completed", eps = 12, ...media } = o;
  return {
    media: {
      medium: "anime", malId: id, title: `A${id}`, titleEnglish: null, url: "", imageUrl: null, type: "TV",
      score: 7, scoredBy: null, rank: null, popularity: null, members: null, status: "finished",
      genres: [], themes: [], demographics: [], startDate: null, endDate: null, year: null, detailed: true,
      episodes: 12, episodeMinutes: 24, studios: [], season: null, source: null, ...media,
    },
    listStatus, userScore, progress: { episodes: eps, chapters: 0, volumes: 0 }, repeating: false, updatedAt: null,
  };
}

export function manga(id: number, o: Partial<Manga> & EntryOpts & { ch?: number } = {}): ListEntry<Manga> {
  const { userScore = null, listStatus = "completed", ch = 100, ...media } = o;
  return {
    media: {
      medium: "manga", malId: id, title: `M${id}`, titleEnglish: null, url: "", imageUrl: null, type: "Manga",
      score: 8, scoredBy: null, rank: null, popularity: null, members: null, status: "finished",
      genres: [], themes: [], demographics: [], startDate: null, endDate: null, year: null, detailed: true,
      chapters: 100, volumes: 10, authors: [], serializations: [], ...media,
    },
    listStatus, userScore, progress: { episodes: 0, chapters: ch, volumes: 0 }, repeating: false, updatedAt: null,
  };
}
