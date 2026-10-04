import { describe, expect, it } from "vitest";
import { analyzeWithEvals } from "../analyze";
import { buildCommentary, describeMove, edgeOf, evalText } from "../commentary";
import type { EngineEval } from "../engine";
import type { GameRecord } from "../games";
import { parseRecord, type ParsedMove } from "../pgn";

const game = (moves: string) => parseRecord({ white: "Ann", black: "Bo", whiteElo: 1800, blackElo: null, result: "1-0", moves } as GameRecord);
const ev = (cp: number, extra: Partial<EngineEval> = {}): EngineEval => ({ cp, mate: null, ...extra });
const mv = (over: Partial<ParsedMove>): ParsedMove => ({ ply: 1, moveNumber: 1, color: "w", san: "e4", piece: "p", captured: null, from: "e2", to: "e4", fenBefore: "", fenAfter: "", ...over });

describe("evalText and edgeOf", () => {
  it("formats pawns and mates", () => {
    expect(evalText(130)).toBe("+1.3");
    expect(evalText(-45)).toBe("-0.5");
    expect(evalText(99700)).toBe("mate in 3");
  });
  it("classifies who is ahead and by how much", () => {
    expect(edgeOf(10)).toEqual({ side: null, level: "equal" });
    expect(edgeOf(60)).toEqual({ side: "w", level: "slight" });
    expect(edgeOf(-150)).toEqual({ side: "b", level: "clear" });
    expect(edgeOf(450)).toEqual({ side: "w", level: "winning" });
    expect(edgeOf(-99800)).toEqual({ side: "b", level: "mate" });
  });
});

describe("describeMove", () => {
  it("describes development, the center, castling, check and mate", () => {
    expect(describeMove(mv({ san: "Nf3", piece: "n", from: "g1", to: "f3" }))).toBe("White develops the knight to f3.");
    expect(describeMove(mv({ san: "e4" }))).toBe("White stakes a claim in the center.");
    expect(describeMove(mv({ san: "O-O" }))).toContain("castles kingside");
    expect(describeMove(mv({ san: "O-O-O", color: "b" }))).toContain("Black castles queenside");
    expect(describeMove(mv({ san: "Bb5+", piece: "b", from: "f1", to: "b5", ply: 25 }))).toBe("White gives check with the bishop.");
    expect(describeMove(mv({ san: "Qxf7#", piece: "q", captured: "p" }))).toBe("White delivers checkmate.");
    expect(describeMove(mv({ san: "a3", piece: "p", from: "a2", to: "a3" }))).toBeNull();
  });
  it("describes promotions", () => {
    expect(describeMove(mv({ san: "e8=Q", piece: "p", to: "e8" }))).toBe("White promotes the pawn to a queen.");
  });
  it("notes when a capturing piece is left hanging", () => {
    const text = describeMove(mv({ color: "b", san: "Qxd4", piece: "q", captured: "p", from: "d8", to: "d4", fenAfter: "4k3/8/8/8/3q4/8/2N5/4K3 w - - 0 1" }));
    expect(text).toBe("Black's queen takes the pawn on d4, but the queen is left undefended there.");
  });
  it("does not complain when the capturing piece is safe", () => {
    const text = describeMove(mv({ san: "Nxe5", piece: "n", captured: "p", from: "c4", to: "e5", fenAfter: "4k3/8/8/4N3/8/8/8/4K3 b - - 0 1" }));
    expect(text).toBe("White's knight takes the pawn on e5.");
  });
});

describe("buildCommentary", () => {
  it("has an intro plus one entry per move, even without an engine review", () => {
    const g = game("e4 e5 Nf3");
    const out = buildCommentary(g, null);
    expect(out).toHaveLength(4);
    expect(out[0]).toContain("Ann (1800) played White against Bo");
    expect(out[0]).toContain("White won.");
    expect(out[0]).toContain("run the Stockfish review");
    expect(out[1]).toBe("White stakes a claim in the center.");
    expect(out[3]).toBe("White develops the knight to f3.");
  });

  it("names the opening when it first appears and when the game leaves the book", () => {
    const g = game("e4 e5 Nf3 Nc6");
    const openings = {
      perPly: [null, { eco: "B00", name: "King's Pawn" }, { eco: "C20", name: "King's Pawn Game" }, { eco: "C44", name: "King's Knight Opening" }, { eco: "C44", name: "King's Knight Opening" }],
      bookPlies: 3,
    };
    const out = buildCommentary(g, null, { openings });
    expect(out[1]).toContain("This is the King's Pawn (B00).");
    expect(out[2]).toContain("King's Pawn Game (C20)");
    expect(out[3]).toContain("King's Knight Opening (C44)");
    expect(out[4]).toContain("leaves the opening book");
  });

  it("says why a move was bad, offers better moves, and reports who is now ahead", () => {
    const g = game("e4 a6");
    // evals are from the side to move's view, one per position (moves + 1)
    const evals = [
      ev(20, { best: "e2e4" }),
      ev(-30, { best: "e7e5", alternatives: [{ uci: "e7e5", cp: -30, mate: null }, { uci: "d7d5", cp: -40, mate: null }, { uci: "a7a6", cp: -300, mate: null }] }),
      ev(600),
    ];
    const analysis = analyzeWithEvals(g, evals);
    const out = buildCommentary(g, analysis);
    expect(out[2]).toContain("A blunder!");
    expect(out[2]).toContain("Better options: e5 (+0.3) and d5 (+0.4).");
    expect(out[2]).toContain("White is winning (+6.0).");
  });

  it("marks best moves and doesn't repeat the edge when nothing changed", () => {
    const g = game("e4 e5");
    const evals = [ev(20, { best: "e2e4" }), ev(-25, { best: "e7e5" }), ev(25)];
    const out = buildCommentary(g, analyzeWithEvals(g, evals));
    expect(out[1]).toMatch(/engine|Best|Exactly/);
    expect(out[1]).not.toContain("advantage");
  });
});
