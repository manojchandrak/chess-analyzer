// Engine accuracy per opening family and color, from reviewed games.
import type { GameReview } from "./review.ts";

export interface OpeningAccuracy {
  accuracy: number;
  games: number;
}

/** Key for a family played with a color: "w:Sicilian Defense". */
export const openingKey = (color: "w" | "b", family: string) => `${color}:${family}`;

export function openingAccuracy(reviews: GameReview[]): Map<string, OpeningAccuracy> {
  const sums = new Map<string, { total: number; moves: number; games: number }>();
  for (const r of reviews) {
    if (!r.family || r.moves.length === 0) continue;
    const key = openingKey(r.color, r.family);
    const s = sums.get(key) ?? { total: 0, moves: 0, games: 0 };
    s.total += r.moves.reduce((a, m) => a + m.accuracy, 0);
    s.moves += r.moves.length;
    s.games++;
    sums.set(key, s);
  }
  return new Map([...sums].map(([k, s]) => [k, { accuracy: Math.round((s.total / s.moves) * 10) / 10, games: s.games }]));
}
