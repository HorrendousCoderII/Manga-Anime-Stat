import type { Tag } from "../types";

/**
 * MAL's v2 API returns genres, themes and demographics in a single `genres` list.
 * Classification is by name because MAL's numeric IDs differ between anime and manga
 * (e.g. Seinen is 42 for anime but 41 for manga). Unknown names are treated as genres.
 */
export const MAL_DEMOGRAPHICS: ReadonlySet<string> = new Set(["Josei", "Kids", "Seinen", "Shoujo", "Shounen"]);

export const MAL_THEMES: ReadonlySet<string> = new Set([
  "Adult Cast",
  "Anthropomorphic",
  "CGDCT",
  "Childcare",
  "Combat Sports",
  "Crossdressing",
  "Delinquents",
  "Detective",
  "Educational",
  "Gag Humor",
  "Gore",
  "Harem",
  "High Stakes Game",
  "Historical",
  "Idols (Female)",
  "Idols (Male)",
  "Isekai",
  "Iyashikei",
  "Love Polygon",
  "Love Status Quo",
  "Magical Sex Shift",
  "Mahou Shoujo",
  "Martial Arts",
  "Mecha",
  "Medical",
  "Memoir",
  "Military",
  "Music",
  "Mythology",
  "Organized Crime",
  "Otaku Culture",
  "Parody",
  "Performing Arts",
  "Pets",
  "Psychological",
  "Racing",
  "Reincarnation",
  "Reverse Harem",
  "Romantic Subtext",
  "Samurai",
  "School",
  "Showbiz",
  "Space",
  "Strategy Game",
  "Super Power",
  "Survival",
  "Team Sports",
  "Time Travel",
  "Urban Fantasy",
  "Vampire",
  "Video Game",
  "Villainess",
  "Visual Arts",
  "Workplace",
]);

export function splitMalGenres(tags: readonly Tag[] | undefined): {
  genres: Tag[];
  themes: Tag[];
  demographics: Tag[];
} {
  const out = { genres: [] as Tag[], themes: [] as Tag[], demographics: [] as Tag[] };
  for (const { id, name } of tags ?? []) {
    const bucket = MAL_DEMOGRAPHICS.has(name) ? out.demographics : MAL_THEMES.has(name) ? out.themes : out.genres;
    bucket.push({ id, name });
  }
  return out;
}
