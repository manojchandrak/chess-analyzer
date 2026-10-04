import { describe, expect, it } from "vitest";
import type { EngineEval } from "../engine";
import { classifyMoves } from "../classify";
import type { ParsedMove } from "../pgn";
import { parseRecord } from "../pgn";
import type { GameRecord } from "../games";

const game = (moves: string) => parseRecord({ white: "W", black: "B", whiteElo: null, blackElo: null, result: "*", moves } as GameRecord).moves;
const ev = (cp: number, extra: Partial<EngineEval> = {}): EngineEval => ({ cp, mate: null, ...extra });

describe("classifyMoves", () => {
  // Evals are from the side to move's point of view, one per position (moves + 1).
  it("calls the engine's choice Best and a small slip Good", () => {
    const moves = game("e4 e5");
    const [m1, m2] = classifyMoves(moves, [ev(20, { best: "e2e4" }), ev(-20, { best: "e7e5" }), ev(20)]);
    expect(m1.cls).toBe("best");
    expect(m2.cls).toBe("best");
    // a ~4-point drop in expected points, not the engine's move
    const [g1] = classifyMoves(moves.slice(0, 1), [ev(20, { best: "d2d4" }), ev(22)]);
    expect(g1.cls).toBe("good");
  });

  it("marks opening moves as Book while they lose nothing", () => {
    const [m1, m2] = classifyMoves(game("e4 e5"), [ev(20, { best: "d2d4" }), ev(-15), ev(15)], 2);
    expect([m1.cls, m2.cls]).toEqual(["book", "book"]);
  });

  it("labels big drops in winning chances as Mistake and Blunder", () => {
    const moves = game("e4");
    expect(classifyMoves(moves, [ev(50, { best: "d2d4" }), ev(76)])[0].cls).toBe("mistake");
    expect(classifyMoves(moves, [ev(50, { best: "d2d4" }), ev(900)])[0].cls).toBe("blunder");
  });

  it("calls a move that punishes nothing after an opponent error a Miss", () => {
    const moves = game("e4 e5");
    // move 1 loses ~20 points (blunder); move 2 then fails to take advantage (loses ~13 points)
    const out = classifyMoves(moves, [ev(0, { best: "d2d4" }), ev(450), ev(-100, { best: "d7d5" }), ev(-350)]);
    expect(out[0].cls).toBe("blunder");
    expect(out[1].cls).toBe("miss");
  });

  it("calls the only good move Great when the runner-up is much worse", () => {
    const [m] = classifyMoves(game("e4"), [ev(100, { best: "e2e4", second: { cp: -300, mate: null } }), ev(-100)]);
    expect(m.cls).toBe("great");
  });

  it("calls a sound sacrifice Brilliant", () => {
    // A knight lands on e5 where a pawn takes it for nothing, yet it is the engine's top move.
    const sac: ParsedMove = {
      ply: 1, moveNumber: 1, color: "w", san: "Ne5", piece: "n", captured: null, from: "f3", to: "e5",
      fenBefore: "4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1",
      fenAfter: "4k3/8/3p4/4N3/8/8/8/4K3 b - - 1 1",
    };
    const [m] = classifyMoves([sac], [ev(0, { best: "f3e5" }), ev(-50)]);
    expect(m.cls).toBe("brilliant");
  });

  it("does not call a sacrifice brilliant when it isn't the best move", () => {
    const sac: ParsedMove = {
      ply: 1, moveNumber: 1, color: "w", san: "Ne5", piece: "n", captured: null, from: "f3", to: "e5",
      fenBefore: "4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1",
      fenAfter: "4k3/8/3p4/4N3/8/8/8/4K3 b - - 1 1",
    };
    const [m] = classifyMoves([sac], [ev(0, { best: "e1e2" }), ev(400)]);
    expect(m.cls).not.toBe("brilliant");
  });
});
