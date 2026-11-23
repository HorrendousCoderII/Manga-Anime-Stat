/** Subset of official MyAnimeList API v2 response shapes we request. */

export interface MalPicture {
  medium?: string;
  large?: string;
}

export interface MalNamed {
  id: number;
  name: string;
}

interface MalNodeBase {
  id: number;
  title: string;
  main_picture?: MalPicture;
  alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
  start_date?: string;
  end_date?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  media_type?: string;
  status?: string;
  /** MAL returns genres, themes and demographics together in this one list. */
  genres?: MalNamed[];
}

export interface MalRelatedNode {
  node: { id: number; title: string; main_picture?: MalPicture };
  relation_type: string;
  relation_type_formatted?: string;
}

export interface MalAnimeNode extends MalNodeBase {
  num_episodes?: number;
  start_season?: { year: number; season: string };
  source?: string;
  /** Seconds. */
  average_episode_duration?: number;
  studios?: MalNamed[];
  related_anime?: MalRelatedNode[];
  related_manga?: MalRelatedNode[];
}

export interface MalMangaNode extends MalNodeBase {
  num_volumes?: number;
  num_chapters?: number;
  authors?: { node: { id: number; first_name?: string; last_name?: string }; role?: string }[];
  serialization?: { node: MalNamed; role?: string }[];
  related_anime?: MalRelatedNode[];
  related_manga?: MalRelatedNode[];
}

export interface MalAnimeListStatus {
  status?: "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";
  score?: number;
  num_episodes_watched?: number;
  is_rewatching?: boolean;
  updated_at?: string;
}

export interface MalMangaListStatus {
  status?: "reading" | "completed" | "on_hold" | "dropped" | "plan_to_read";
  score?: number;
  num_volumes_read?: number;
  num_chapters_read?: number;
  is_rereading?: boolean;
  updated_at?: string;
}

export interface MalListPage<N, S> {
  data: { node: N; list_status?: S }[];
  paging?: { next?: string; previous?: string };
}
