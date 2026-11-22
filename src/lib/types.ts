export type Medium = "anime" | "manga";
export type MediumMode = Medium | "combined";

export interface Tag {
  id: number;
  name: string;
}

export type ReleaseStatus =
  | "airing"
  | "finished"
  | "upcoming"
  | "hiatus"
  | "discontinued"
  | "unknown";

export interface MediaBase {
  medium: Medium;
  malId: number;
  title: string;
  titleEnglish: string | null;
  url: string;
  imageUrl: string | null;
  /** MAL media type, e.g. "TV", "Movie", "Manga", "Manhwa", "Light Novel". */
  type: string | null;
  score: number | null;
  scoredBy: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  status: ReleaseStatus;
  genres: Tag[];
  themes: Tag[];
  demographics: Tag[];
  /** ISO date (YYYY-MM-DD) of first air / publish. */
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  /** True once full catalog details (studios, durations, themes, …) have been merged in. */
  detailed: boolean;
}

export interface Anime extends MediaBase {
  medium: "anime";
  episodes: number | null;
  /** Runtime of a single episode in minutes. */
  episodeMinutes: number | null;
  studios: Tag[];
  season: string | null;
  source: string | null;
}

export type AuthorRole = "story" | "art" | "story_and_art" | "unknown";

export interface Author extends Tag {
  role: AuthorRole;
}

export interface Manga extends MediaBase {
  medium: "manga";
  chapters: number | null;
  volumes: number | null;
  authors: Author[];
  serializations: Tag[];
}

export type Media = Anime | Manga;

export type ListStatus = "in_progress" | "completed" | "on_hold" | "dropped" | "planned";

export interface ListEntry<M extends Media = Media> {
  media: M;
  listStatus: ListStatus;
  /** 1–10, or null when unscored. */
  userScore: number | null;
  progress: { episodes: number; chapters: number; volumes: number };
  repeating: boolean;
  updatedAt: string | null;
}

export interface UserStatistics {
  anime: { daysWatched: number; meanScore: number; completed: number; episodesWatched: number } | null;
  manga: {
    daysRead: number;
    meanScore: number;
    completed: number;
    chaptersRead: number;
    volumesRead: number;
  } | null;
}

export interface UserProfile {
  username: string;
  url: string;
  imageUrl: string | null;
  joined: string | null;
  lastOnline: string | null;
  statistics: UserStatistics | null;
}
