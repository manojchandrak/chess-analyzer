// Progress over time: reviewed games grouped by month, so improvement (or decline)
// in accuracy and blunders is visible.
import type { GameRecord } from "./games.ts";
import type { GameReview } from "./review.ts";

export interface TrendPoint {
  /** "2024-05" */
  key: string;
  label: string;
  games: number;
  accuracy: number | null;
  blundersPerGame: number;
  /** Points per game from the reviewed games, 0-100. */
  score: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** Groups reviews by the month of their game, oldest first. Games without a full date are left out. */
export function buildTrends(games: GameRecord[], reviews: Map<string, GameReview>): TrendPoint[] {
  const byMonth = new Map<string, GameReview[]>();
  for (const g of games) {
    const r = reviews.get(g.id);
    const key = g.date?.match(/^(\d{4}-\d{2})/)?.[1];
    if (!r || !key || r.moves.length === 0) continue;
    byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => {
      const moves = rs.flatMap((r) => r.moves);
      const accuracy = moves.length ? Math.round((moves.reduce((s, m) => s + m.accuracy, 0) / moves.length) * 10) / 10 : null;
      return {
        key,
        label: monthLabel(key),
        games: rs.length,
        accuracy,
        blundersPerGame: Math.round((moves.filter((m) => m.quality === "blunder").length / rs.length) * 100) / 100,
        score: Math.round((rs.reduce((s, r) => s + r.score, 0) / rs.length) * 100),
      };
    });
}

export interface TrendSummary {
  /** Change in accuracy, later half minus earlier half (percentage points). */
  accuracyChange: number;
  /** Change in blunders per game, later half minus earlier half. */
  blunderChange: number;
  direction: "improving" | "declining" | "steady";
}

/** Compares the earlier and later halves of the history (weighted by games). Needs 2+ months. */
export function summarizeTrend(points: TrendPoint[]): TrendSummary | null {
  const usable = points.filter((p) => p.accuracy !== null);
  if (usable.length < 2) return null;
  const mid = Math.floor(usable.length / 2);
  const mean = (ps: TrendPoint[], pick: (p: TrendPoint) => number) => {
    const games = ps.reduce((s, p) => s + p.games, 0);
    return ps.reduce((s, p) => s + pick(p) * p.games, 0) / games;
  };
  const early = usable.slice(0, mid);
  const late = usable.slice(usable.length % 2 ? mid + 1 : mid);
  const accuracyChange = Math.round((mean(late, (p) => p.accuracy ?? 0) - mean(early, (p) => p.accuracy ?? 0)) * 10) / 10;
  const blunderChange = Math.round((mean(late, (p) => p.blundersPerGame) - mean(early, (p) => p.blundersPerGame)) * 100) / 100;
  return { accuracyChange, blunderChange, direction: accuracyChange >= 1 ? "improving" : accuracyChange <= -1 ? "declining" : "steady" };
}
