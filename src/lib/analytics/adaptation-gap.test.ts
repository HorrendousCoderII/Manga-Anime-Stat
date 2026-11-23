import { describe, expect, it } from "vitest";
import { anime, manga } from "@/test/entries";
import {
  computeAdaptationGaps,
  isAdaptationRelation,
  normalizeTitle,
  scopeForGaps,
  titlesLooselyMatch,
  type RelatedLink,
} from "./adaptation-gap";

describe("title helpers", () => {
  it("normalizes punctuation, articles and season noise", () => {
    expect(normalizeTitle("Death Note")).toBe("death note");
    expect(normalizeTitle("Fullmetal Alchemist: Brotherhood")).toBe("fullmetal alchemist brotherhood");
    expect(normalizeTitle("The Melancholy of Haruhi Suzumiya (TV)")).toBe("melancholy of haruhi suzumiya");
  });

  it("loosely matches shared titles and colon suffixes", () => {
    expect(titlesLooselyMatch("Death Note", "Death Note")).toBe(true);
    expect(titlesLooselyMatch("Fullmetal Alchemist: Brotherhood", "Fullmetal Alchemist")).toBe(true);
    expect(titlesLooselyMatch("Naruto", "Boruto")).toBe(false);
  });

  it("recognizes adaptation relation labels from MAL and Jikan", () => {
    expect(isAdaptationRelation("Adaptation")).toBe(true);
    expect(isAdaptationRelation("parent_story")).toBe(true);
    expect(isAdaptationRelation("Side Story")).toBe(false);
  });
});

describe("computeAdaptationGaps", () => {
  const deathNoteAnime = anime(1535, { title: "Death Note", score: 8.62, userScore: 9 });
  const deathNoteManga = manga(21, { title: "Death Note", score: 8.68, userScore: 10 });
  const fmaAnime = anime(5114, {
    title: "Fullmetal Alchemist: Brotherhood",
    titleEnglish: "Fullmetal Alchemist: Brotherhood",
    score: 9.11,
    userScore: 10,
  });
  const fmaManga = manga(25, { title: "Fullmetal Alchemist", score: 8.5, userScore: 9 });
  const soloAnime = anime(99, { title: "Original Show", score: 7.5, userScore: 8 });
  const unscoredManga = manga(100, { title: "Death Note", score: null, userScore: 9 });

  it("pairs same-titled anime and manga and ranks by |delta|", () => {
    const summary = computeAdaptationGaps([deathNoteAnime, deathNoteManga, fmaAnime, fmaManga, soloAnime]);
    expect(summary.pairs.map((p) => p.key)).toEqual(["5114:25", "1535:21"]);
    expect(summary.pairs[0]).toMatchObject({
      matchSource: "title",
      delta: -0.61,
      absDelta: 0.61,
      seriesTitle: "Fullmetal Alchemist",
    });
    expect(summary.pairs[1]).toMatchObject({ delta: 0.06, manga: { malId: 21 }, anime: { malId: 1535 } });
    expect(summary.titlePairs).toBe(2);
    expect(summary.relationPairs).toBe(0);
    expect(summary.animeWins).toBe(1);
    expect(summary.mangaWins).toBe(1);
  });

  it("prefers relation matches over title matches and records the relation label", () => {
    const relations = new Map<string, RelatedLink[]>([
      [
        "anime:5114",
        [{ medium: "manga", malId: 25, title: "Fullmetal Alchemist", relation: "Adaptation" }],
      ],
    ]);
    const summary = computeAdaptationGaps([fmaAnime, fmaManga, deathNoteAnime, deathNoteManga], relations);
    const fma = summary.pairs.find((p) => p.key === "5114:25")!;
    expect(fma.matchSource).toBe("relation");
    expect(fma.relation).toBe("Adaptation");
    expect(summary.relationPairs).toBe(1);
    expect(summary.titlePairs).toBe(1);
  });

  it("ignores non-adaptation relations and same-medium links", () => {
    const relations = new Map<string, RelatedLink[]>([
      [
        "anime:1535",
        [
          { medium: "anime", malId: 2994, title: "Death Note: Rewrite", relation: "Summary" },
          { medium: "manga", malId: 21, title: "Death Note", relation: "Side Story" },
        ],
      ],
    ]);
    // Side Story is not an adaptation relation — title match still pairs them.
    const summary = computeAdaptationGaps([deathNoteAnime, deathNoteManga], relations);
    expect(summary.pairs).toHaveLength(1);
    expect(summary.pairs[0].matchSource).toBe("title");
  });

  it("skips pairs missing a community score on either side", () => {
    expect(computeAdaptationGaps([deathNoteAnime, unscoredManga]).pairs).toEqual([]);
  });

  it("aggregates mean deltas", () => {
    const summary = computeAdaptationGaps([
      anime(1, { title: "Alpha Series", score: 8, userScore: 8 }),
      manga(2, { title: "Alpha Series", score: 9, userScore: 9 }),
      anime(3, { title: "Beta Chronicles", score: 7, userScore: 7 }),
      manga(4, { title: "Beta Chronicles", score: 6, userScore: 6 }),
    ]);
    expect(summary.meanDelta).toBe(0);
    expect(summary.meanAbsDelta).toBe(1);
    expect(summary.ties).toBe(0);
  });

  it("dedupes title matches to one anime and one manga per series", () => {
    const summary = computeAdaptationGaps([
      anime(1, { title: "One Piece", members: 2_000_000, score: 8.7, userScore: 9 }),
      anime(2, { title: "One Piece Film: Gold", members: 200_000, score: 7.9, userScore: 8 }),
      manga(10, { title: "One Piece", members: 500_000, score: 9.2, userScore: 10 }),
    ]);
    expect(summary.pairs).toHaveLength(1);
    expect(summary.pairs[0].key).toBe("1:10");
  });
});

describe("scopeForGaps", () => {
  const list = [
    anime(1, { title: "X", year: 2010, score: 8 }),
    anime(2, { title: "Y", year: 2020, score: 7 }),
    manga(10, { title: "X", year: 2008, score: 9 }),
    manga(11, { title: "Z", year: 2015, score: 8 }),
  ];

  it("keeps both media when mode is combined", () => {
    const filtered = [list[0], list[2]];
    expect(scopeForGaps(list, filtered, "combined")).toEqual(filtered);
  });

  it("keeps opposite-medium counterparts in anime/manga modes", () => {
    const filteredAnime = [list[0]];
    const scoped = scopeForGaps(list, filteredAnime, "anime");
    expect(scoped.map((e) => `${e.media.medium}:${e.media.malId}`).sort()).toEqual([
      "anime:1",
      "manga:10",
      "manga:11",
    ]);
  });
});
