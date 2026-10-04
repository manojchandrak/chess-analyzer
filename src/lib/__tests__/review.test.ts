import { describe, expect, it } from "vitest";
import { summarize, type GameReview, type ReviewedMove } from "../review";

const move = (over: Partial<ReviewedMove>): ReviewedMove => ({ ply: 1, phase: "middlegame", cpLoss: 0, accuracy: 100, quality: "best", clock: null, evalBefore: 0, lostNext: 0, ...over });
const review = (moves: ReviewedMove[], over: Partial<GameReview> = {}): GameReview => ({
  gameId: "g", color: "w", score: 1, family: null, clockInitial: null, moves, engine: "stockfish",
  stats: { accuracy: 0, performance: 0, brilliant: 0, great: 0, best: 0, inaccuracies: 0, mistakes: 0, blunders: 0 }, ...over,
});

describe("summarize", () => {
  it("averages accuracy and counts blunders per game and per phase", () => {
    const s = summarize([
      review([move({ phase: "opening", accuracy: 90 }), move({ phase: "endgame", accuracy: 50, quality: "blunder", lostNext: 3 })]),
      review([move({ phase: "opening", accuracy: 100 })]),
    ]);
    expect(s.games).toBe(2);
    expect(s.accuracy).toBe(80);
    expect(s.blunders).toBe(1);
    expect(s.blundersPerGame).toBe(0.5);
    expect(s.hangingBlunders).toBe(1);
    expect(s.phases.opening.accuracy).toBe(95);
    expect(s.phases.endgame.blundersPerGame).toBe(0.5);
    expect(s.phases.middlegame.accuracy).toBeNull();
  });

  it("separates low-clock moves (under 10% of the start, at least 15 s)", () => {
    const moves = [
      ...Array.from({ length: 4 }, () => move({ clock: 200 })),
      move({ clock: 10, quality: "blunder" }),
      move({ clock: 20 }), // 20 s is under 10% of 300 but not under the 15 s floor... 30 s is the cutoff
    ];
    const s = summarize([review(moves, { clockInitial: 300 })]);
    expect(s.lowClock?.blunderRate).toBe(0.5);
    expect(s.normalClock?.blunderRate).toBe(0);
  });

  it("counts winning positions that weren't converted", () => {
    const winning = (score: number) => review([move({ ply: 30, evalBefore: 400 })], { score });
    const s = summarize([winning(1), winning(0.5), winning(0), review([move({ ply: 30, evalBefore: 0 })])]);
    expect(s.winningPositions).toBe(3);
    expect(s.missedWins).toBe(2);
  });

  it("handles no reviews without dividing by zero", () => {
    const s = summarize([]);
    expect(s.games).toBe(0);
    expect(s.accuracy).toBeNull();
    expect(s.blundersPerGame).toBe(0);
  });
});
