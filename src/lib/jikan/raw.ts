/** Subset of Jikan v4 response shapes we consume. */

export interface JikanEntity {
  mal_id: number;
  type?: string;
  name: string;
  url?: string;
}

interface JikanImages {
  jpg?: { image_url?: string | null; large_image_url?: string | null };
  webp?: { image_url?: string | null; large_image_url?: string | null };
}

interface JikanDateRange {
  from: string | null;
  to: string | null;
}

interface JikanMediaBase {
  mal_id: number;
  url: string;
  images?: JikanImages;
  title: string;
  title_english?: string | null;
  titles?: { type: string; title: string }[];
  type?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  status?: string | null;
  genres?: JikanEntity[];
  explicit_genres?: JikanEntity[];
  themes?: JikanEntity[];
  demographics?: JikanEntity[];
}

export interface JikanAnime extends JikanMediaBase {
  source?: string | null;
  episodes?: number | null;
  airing?: boolean;
  aired?: JikanDateRange;
  duration?: string | null;
  season?: string | null;
  year?: number | null;
  studios?: JikanEntity[];
}

export interface JikanManga extends JikanMediaBase {
  chapters?: number | null;
  volumes?: number | null;
  publishing?: boolean;
  published?: JikanDateRange;
  authors?: JikanEntity[];
  serializations?: JikanEntity[];
}

export interface JikanResource<T> {
  data: T;
}

/** `/anime|manga/{id}/relations` group. */
export interface JikanRelationGroup {
  relation: string;
  entry: { mal_id: number; type: string; name: string; url: string }[];
}

export interface JikanUserFull {
  mal_id: number | null;
  username: string;
  url: string;
  images?: JikanImages;
  last_online?: string | null;
  joined?: string | null;
  statistics?: {
    anime?: {
      days_watched: number;
      mean_score: number;
      completed: number;
      episodes_watched: number;
    };
    manga?: {
      days_read: number;
      mean_score: number;
      completed: number;
      chapters_read: number;
      volumes_read: number;
    };
  };
}

/** Entry shape of MAL's public `/{anime,manga}list/{user}/load.json` feed. */
export interface MalListEntryBase {
  status: number;
  score: number;
  updated_at?: number | null;
  genres?: { id: number; name: string }[] | null;
  demographics?: { id: number; name: string }[] | null;
  start_date_string?: string | null;
}

export interface MalAnimeListEntry extends MalListEntryBase {
  is_rewatching: number | boolean;
  num_watched_episodes: number;
  anime_id: number;
  anime_title: string | number;
  anime_title_eng?: string | number | null;
  anime_num_episodes: number;
  anime_airing_status: number;
  anime_studios?: { id: number; name: string }[] | null;
  anime_season?: { year: number; season: string } | null;
  anime_total_members?: number | null;
  anime_total_scores?: number | null;
  anime_score_val?: number | null;
  anime_popularity?: number | null;
  anime_url: string;
  anime_image_path?: string | null;
  anime_media_type_string?: string | null;
  anime_start_date_string?: string | null;
  anime_end_date_string?: string | null;
}

export interface MalMangaListEntry extends MalListEntryBase {
  is_rereading: number | boolean;
  num_read_chapters: number;
  num_read_volumes: number;
  manga_id: number;
  manga_title: string | number;
  manga_english?: string | number | null;
  manga_num_chapters: number;
  manga_num_volumes: number;
  manga_publishing_status: number;
  manga_magazines?: { id: number; name: string }[] | null;
  manga_total_members?: number | null;
  manga_total_scores?: number | null;
  manga_score_val?: number | null;
  manga_popularity?: number | null;
  manga_url: string;
  manga_image_path?: string | null;
  manga_media_type_string?: string | null;
  manga_start_date_string?: string | null;
  manga_end_date_string?: string | null;
}
