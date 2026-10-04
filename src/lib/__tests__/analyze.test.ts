import { describe, expect, it } from "vitest";
import { analyzeWithEvals } from "../analyze";
import type { EngineEval } from "../engine";
import type { GameRecord } from "../games";
import { parseRecord } from "../pgn";

const game = parseRecord({ white: "W", black: "B", whiteElo: null, blackElo: null, result: "*", moves: "e4 e5 Nf3" } as GameRecord);
const ev = (cp: number, extra: Partial<EngineEval> = {}): EngineEval => ({ cp, mate: null, ...extra });

describe("analyzeWithEvals alternatives", () => {
  it("turns the engine's candidate moves into SAN with White-perspective evaluations and flags the played one", () => {
    const evals = [
      ev(20, { best: "e2e4", alternatives: [{ uci: "e2e4", cp: 20, mate: null }, { uci: "d2d4", cp: 15, mate: null }] }),
      ev(-25, { best: "e7e5", alternatives: [{ uci: "e7e5", cp: -25, mate: null }, { uci: "c7c5", cp: -40, mate: null }, { uci: "a7a6", cp: -90, mate: null }] }),
      ev(30),
      ev(-30),
    ];
    const { moves } = analyzeWithEvals(game, evals);
    expect(moves[0].alternatives).toEqual([
      { san: "e4", uci: "e2e4", evalWhite: 20, played: true },
      { san: "d4", uci: "d2d4", evalWhite: 15, played: false },
    ]);
    // Black to move: the side-to-move score is flipped to White's point of view
    expect(moves[1].alternatives.map((a) => [a.san, a.evalWhite, a.played])).toEqual([
      ["e5", 25, true],
      ["c5", 40, false],
      ["a6", 90, false],
    ]);
  });
  it("has no alternatives without a Stockfish review", () => {
    const { moves } = analyzeWithEvals(game, [ev(20), ev(-20), ev(20), ev(-20)]);
    expect(moves.every((m) => m.alternatives.length === 0)).toBe(true);
  });
  it("skips candidate moves that aren't legal in the position", () => {
    const { moves } = analyzeWithEvals(game, [ev(20, { alternatives: [{ uci: "e2e5", cp: 10, mate: null }] }), ev(-20), ev(20), ev(-20)]);
    expect(moves[0].alternatives).toEqual([]);
  });
});
