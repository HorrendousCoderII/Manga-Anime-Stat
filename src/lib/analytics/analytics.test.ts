import { describe, expect, it } from "vitest";
import { anime, manga, tags } from "@/test/entries";
import { computeCreditStats, creditCoverage } from "./credits";
import { applyFilters, DEFAULT_FILTERS, releaseYear, unitCount, yearExtent } from "./filters";
import { pearson, quantile, stdDev } from "./math";
import { computeScoreBias } from "./score-bias";
import { computeTagBreakdown, scoreBucket, topWithOther, totalTime } from "./tags";

describe("math", () => {
  it("computes population std dev and interpolated quantiles", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(stdDev([])).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([7], 0.75)).toBe(7);
  });

  it("returns null correlation for constant series", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
  });
});

describe("filters", () => {
  const list = [
    anime(1, { year: 2005, episodes: 12 }),
    anime(2, { year: null, startDate: "2015-04-01", episodes: 0, eps: 30, listStatus: "in_progress" }),
    anime(3, { year: null, episodes: 1, listStatus: "planned" }),
    manga(4, { year: 2010, chapters: 0, ch: 40 }),
    manga(5, { year: 2020, chapters: 200, listStatus: "dropped" }),
  ];

  it("reads release year from year or start date and unit count with progress fallback", () => {
    expect(releaseYear(list[1])).toBe(2015);
    expect(releaseYear(list[2])).toBeNull();
    expect(unitCount(list[1])).toBe(30);
    expect(unitCount(list[3])).toBe(40);
    expect(yearExtent(list)).toEqual([2005, 2020]);
  });

  it("scopes by medium and excludes planned by default", () => {
    expect(applyFilters(list, "anime", DEFAULT_FILTERS).map((e) => e.media.malId)).toEqual([1, 2]);
    expect(applyFilters(list, "combined", DEFAULT_FILTERS)).toHaveLength(4);
  });

  it("drops undated titles only when a year bound is set", () => {
    const all = { ...DEFAULT_FILTERS, statuses: DEFAULT_FILTERS.statuses.concat("planned") };
    expect(applyFilters(list, "anime", all)).toHaveLength(3);
    expect(applyFilters(list, "combined", { ...all, yearFrom: 2008, yearTo: 2016 }).map((e) => e.media.malId)).toEqual([2, 4]);
  });

  it("applies episode and chapter minimums to their own medium", () => {
    const f = { ...DEFAULT_FILTERS, minEpisodes: 13, minChapters: 100 };
    expect(applyFilters(list, "combined", f).map((e) => e.media.malId)).toEqual([2, 5]);
  });
});

describe("computeScoreBias", () => {
  const list = [
    anime(1, { userScore: 10, score: 7.2 }),
    anime(2, { userScore: 5, score: 8.1 }),
    anime(3, { userScore: 8, score: 7.5 }),
    anime(4, { userScore: null, score: 9 }),
    anime(5, { userScore: 7, score: null }),
  ];

  it("pairs scored titles, classifies deltas and computes harshness", () => {
    const b = computeScoreBias(list);
    expect(b.points.map((p) => [p.malId, p.delta, p.kind])).toEqual([
      [1, 2.8, "gem"],
      [2, -3.1, "overrated"],
      [3, 0.5, "aligned"],
    ]);
    expect(b.harshness).toBe(0.07);
    expect(b.meanAbsDelta).toBe(2.13);
    expect(b.gems.map((p) => p.malId)).toEqual([1]);
    expect(b.overrated.map((p) => p.malId)).toEqual([2]);
  });

  it("treats the threshold as inclusive and keeps jitter deterministic and small", () => {
    const b = computeScoreBias([anime(1, { userScore: 9, score: 7.5 })]);
    expect(b.points[0].kind).toBe("gem");
    const again = computeScoreBias([anime(1, { userScore: 9, score: 7.5 })]);
    expect(again.points[0].jitter).toBe(b.points[0].jitter);
    expect(Math.abs(b.points[0].jitter)).toBeLessThanOrEqual(0.3);
  });

  it("handles an empty list", () => {
    expect(computeScoreBias([])).toMatchObject({ points: [], harshness: null, correlation: null });
  });
});

describe("computeTagBreakdown", () => {
  it("aggregates titles, time and mean scores per tag", () => {
    const list = [
      anime(1, { genres: tags("Action", "Drama"), eps: 10, episodeMinutes: 30, userScore: 9, score: 8 }),
      anime(2, { genres: tags("Action"), eps: 12, episodeMinutes: null, userScore: 7, score: 7 }),
      manga(3, { genres: tags("Action"), ch: 60, userScore: null, score: 6 }),
      anime(4, { genres: [] }),
    ];
    const [action, drama] = computeTagBreakdown(list, "genres");
    expect(action).toMatchObject({ name: "Action", titles: 3, hours: 14.8, chapters: 60, scored: 2, meanUser: 8, meanGlobal: 7 });
    expect(drama).toMatchObject({ name: "Drama", titles: 1, hours: 5 });
    expect(action.buckets[scoreBucket(9)]).toEqual({ titles: 1, hours: 5, chapters: 0 });
    expect(action.buckets[scoreBucket(null)]).toEqual({ titles: 1, hours: 5, chapters: 60 });
  });

  it("counts a tag once per title and reads themes / demographics", () => {
    const list = [anime(1, { themes: tags("School", "School") }), anime(2, { demographics: tags("Seinen") })];
    expect(computeTagBreakdown(list, "themes")).toMatchObject([{ name: "School", titles: 1 }]);
    expect(computeTagBreakdown(list, "demographics")).toMatchObject([{ name: "Seinen", titles: 1 }]);
  });

  it("totals time over titles, not over tags", () => {
    const list = [anime(1, { genres: tags("Action", "Drama"), eps: 10, episodeMinutes: 30 }), manga(2, { ch: 12 })];
    expect(totalTime(list)).toEqual({ titles: 2, hours: 6, chapters: 12 });
  });

  it("buckets scores", () => {
    expect([1, 4, 5, 9, 10, null].map(scoreBucket)).toEqual([0, 0, 1, 5, 6, 7]);
  });

  it("folds the tail into Other", () => {
    const items = [5, 4, 3, 2, 1].map((v, i) => ({ n: `t${i}`, v }));
    expect(topWithOther(items, (t) => t.v, (t) => t.n, 2)).toEqual([
      { name: "t0", value: 5 },
      { name: "t1", value: 4 },
      { name: "Other", value: 6 },
    ]);
  });
});

describe("computeCreditStats", () => {
  const list = [
    anime(1, { studios: tags("Bones"), userScore: 9, score: 8.5 }),
    anime(2, { studios: tags("Bones"), userScore: 7, score: 7.5 }),
    anime(3, { studios: tags("Bones", "Madhouse"), userScore: null, score: 8 }),
    anime(4, { studios: tags("Madhouse"), userScore: 6, score: 7 }),
    anime(5, { studios: tags("Sunrise"), userScore: 8 }),
    manga(6, { serializations: tags("Weekly Shounen Jump"), userScore: 8 }),
    manga(7, { serializations: tags("Weekly Shounen Jump"), userScore: 6 }),
  ];

  it("computes mean, std dev and five-number summary from user scores", () => {
    const [bones, madhouse] = computeCreditStats(list, "anime");
    expect(bones).toEqual({
      name: "Bones", titles: 3, scored: 2, mean: 8, std: 1, min: 7, q1: 7.5, median: 8, q3: 8.5, max: 9, meanGlobal: 8,
    });
    expect(madhouse).toMatchObject({ name: "Madhouse", titles: 2, scored: 1, mean: 6, std: 0 });
  });

  it("respects minTitles and medium", () => {
    expect(computeCreditStats(list, "anime", { minTitles: 1 }).map((c) => c.name)).toEqual(["Bones", "Madhouse", "Sunrise"]);
    expect(computeCreditStats(list, "manga")).toMatchObject([{ name: "Weekly Shounen Jump", titles: 2, mean: 7, std: 1 }]);
  });

  it("can use MAL scores instead", () => {
    const [bones] = computeCreditStats(list, "anime", { source: "global" });
    expect(bones).toMatchObject({ scored: 3, mean: 8, min: 7.5, max: 8.5 });
  });

  it("reports credit coverage", () => {
    expect(creditCoverage([...list, anime(8)], "anime")).toBeCloseTo(5 / 6);
  });
});
