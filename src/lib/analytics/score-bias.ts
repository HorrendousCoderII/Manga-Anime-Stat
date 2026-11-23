import type { ListEntry, Medium } from "../types";
import { mean, pearson, round } from "./math";

/** A title counts as a hidden gem / overrated when the user's score differs from MAL's by at least this much. */
export const BIAS_THRESHOLD = 1.5;

export type BiasKind = "gem" | "overrated" | "aligned";

export interface ScorePoint {
  key: string;
  medium: Medium;
  malId: number;
  title: string;
  url: string;
  imageUrl: string | null;
  userScore: number;
  globalScore: number;
  /** userScore − globalScore */
  delta: number;
  kind: BiasKind;
  /** Deterministic vertical offset (±0.3) so integer user scores don't stack into one line. */
  jitter: number;
}

export interface ScoreBias {
  points: ScorePoint[];
  /** Rating Harshness Score: mean of (user − global). Negative means harsher than the community. */
  harshness: number | null;
  meanAbsDelta: number | null;
  correlation: number | null;
  gems: ScorePoint[];
  overrated: ScorePoint[];
  threshold: number;
}

function jitterFor(medium: Medium, id: number): number {
  // Knuth multiplicative hash -> [0, 1)
  const h = (Math.imul(id + (medium === "manga" ? 7919 : 0), 2654435761) >>> 0) / 2 ** 32;
  return (h - 0.5) * 0.6;
}

export function computeScoreBias(entries: ListEntry[], threshold = BIAS_THRESHOLD): ScoreBias {
  const points: ScorePoint[] = [];
  for (const e of entries) {
    const user = e.userScore;
    const global = e.media.score;
    if (user === null || global === null) continue;
    const delta = round(user - global)!;
    points.push({
      key: `${e.media.medium}-${e.media.malId}`,
      medium: e.media.medium,
      malId: e.media.malId,
      title: e.media.title,
      url: e.media.url,
      imageUrl: e.media.imageUrl,
      userScore: user,
      globalScore: global,
      delta,
      kind: delta >= threshold ? "gem" : delta <= -threshold ? "overrated" : "aligned",
      jitter: round(jitterFor(e.media.medium, e.media.malId), 3)!,
    });
  }
  const deltas = points.map((p) => p.delta);
  return {
    points,
    harshness: round(mean(deltas)),
    meanAbsDelta: round(mean(deltas.map(Math.abs))),
    correlation: round(
      pearson(
        points.map((p) => p.globalScore),
        points.map((p) => p.userScore),
      ),
    ),
    gems: points.filter((p) => p.kind === "gem").sort((a, b) => b.delta - a.delta),
    overrated: points.filter((p) => p.kind === "overrated").sort((a, b) => a.delta - b.delta),
    threshold,
  };
}
