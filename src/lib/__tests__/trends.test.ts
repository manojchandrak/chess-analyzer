import { describe, expect, it } from "vitest";
import type { GameRecord } from "../games";
import { openingAccuracy } from "../openingStats";
import { collectPuzzles, checkAnswer, isOwnPiece, legalTargets } from "../puzzles";
import type { GameReview, ReviewedMove } from "../review";
import { buildTrends, monthLabel, summarizeTrend } from "../trends";

const move = (over: Partial<ReviewedMove> = {}): ReviewedMove => ({ ply: 1, phase: "middlegame", cpLoss: 0, accuracy: 100, quality: "best", clock: null, evalBefore: 0, lostNext: 0, ...over });
const review = (gameId: string, moves: ReviewedMove[], over: Partial<GameReview> = {}): GameReview => ({
  gameId, color: "w", score: 1, family: "Italian Game", clockInitial: null, moves, engine: "stockfish",
  stats: { accuracy: 0, performance: 0, brilliant: 0, great: 0, best: 0, inaccuracies: 0, mistakes: 0, blunders: 0 }, ...over,
});
const game = (id: string, date: string | null): GameRecord => ({ id, date, white: "Me", black: "Opp" }) as GameRecord;

describe("buildTrends", () => {
  it("groups reviewed games by month, oldest first, and skips undated or unreviewed games", () => {
    const games = [game("a", "2024-03-02"), game("b", "2024-01-15"), game("c", "2024-01-20"), game("d", null), game("e", "2024-02-01")];
    const reviews = new Map([
      ["a", review("a", [move({ accuracy: 80 })], { score: 0 })],
      ["b", review("b", [move({ accuracy: 60, quality: "blunder" })], { score: 0.5 })],
      ["c", review("c", [move({ accuracy: 100 })], { score: 1 })],
      ["d", review("d", [move()])],
    ]);
    const t = buildTrends(games, reviews);
    expect(t.map((p) => p.key)).toEqual(["2024-01", "2024-03"]);
    expect(t[0]).toMatchObject({ games: 2, accuracy: 80, blundersPerGame: 0.5, score: 75, label: "Jan 24" });
    expect(t[1]).toMatchObject({ games: 1, accuracy: 80, score: 0 });
  });
  it("labels months", () => expect(monthLabel("2023-12")).toBe("Dec 23"));
});

describe("summarizeTrend", () => {
  const p = (key: string, accuracy: number, games = 1, blunders = 1) => ({ key, label: key, games, accuracy, blundersPerGame: blunders, score: 50 });
  it("needs two months", () => expect(summarizeTrend([p("2024-01", 70)])).toBeNull());
  it("compares later months with earlier ones", () => {
    const s = summarizeTrend([p("2024-01", 70, 1, 2), p("2024-02", 72, 1, 2), p("2024-03", 78, 1, 1), p("2024-04", 80, 1, 1)]);
    expect(s).toEqual({ accuracyChange: 8, blunderChange: -1, direction: "improving" });
  });
  it("calls small changes steady and drops declining", () => {
    expect(summarizeTrend([p("a", 75), p("b", 75.4)])?.direction).toBe("steady");
    expect(summarizeTrend([p("a", 80), p("b", 70)])?.direction).toBe("declining");
  });
});

describe("openingAccuracy", () => {
  it("averages accuracy per family and color", () => {
    const m = openingAccuracy([
      review("1", [move({ accuracy: 90 }), move({ accuracy: 70 })]),
      review("2", [move({ accuracy: 100 })]),
      review("3", [move({ accuracy: 50 })], { color: "b" }),
      review("4", [move({ accuracy: 10 })], { family: null }),
    ]);
    expect(m.get("w:Italian Game")).toEqual({ accuracy: 86.7, games: 2 });
    expect(m.get("b:Italian Game")).toEqual({ accuracy: 50, games: 1 });
    expect(m.size).toBe(2);
  });
});

describe("puzzles", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const pz = (best = "e4") => ({ fen: START, played: "a3", best });

  it("collects mistakes and blunders, blunders and biggest losses first", () => {
    const games = new Map([["g1", { id: "g1", white: "Me", black: "Opp", date: "2024-01-01" } as GameRecord]]);
    const rs = [
      review("g1", [
        move({ ply: 3, quality: "mistake", cpLoss: 150, puzzle: pz() }),
        move({ ply: 5, quality: "blunder", cpLoss: 300, puzzle: pz("d4") }),
        move({ ply: 7, quality: "blunder", cpLoss: 600, puzzle: pz("c4") }),
        move({ ply: 9, quality: "best" }),
      ]),
    ];
    const out = collectPuzzles(rs, games);
    expect(out.map((p) => p.id)).toEqual(["g1#7", "g1#5", "g1#3"]);
    expect(out[0]).toMatchObject({ opponent: "Opp", color: "w", best: "c4" });
    expect(collectPuzzles(rs, games, 2)).toHaveLength(2);
  });

  it("checks answers by SAN, ignoring check and mate signs", () => {
    expect(checkAnswer(START, { from: "e2", to: "e4" }, "e4")).toEqual({ result: "correct", san: "e4" });
    expect(checkAnswer(START, "d4", "e4")).toEqual({ result: "wrong", san: "d4" });
    expect(checkAnswer(START, "Qh5", "e4").result).toBe("illegal");
    expect(checkAnswer("4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1", "Qe7+", "Qe7")).toMatchObject({ result: "correct" });
  });

  it("finds legal targets and own pieces", () => {
    expect(legalTargets(START, "e2").sort()).toEqual(["e3", "e4"]);
    expect(legalTargets(START, "e5")).toEqual([]);
    expect(isOwnPiece(START, "e2")).toBe(true);
    expect(isOwnPiece(START, "e7")).toBe(false);
    expect(isOwnPiece(START, "e4")).toBe(false);
  });
});
