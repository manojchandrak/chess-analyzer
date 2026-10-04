import { describe, expect, it } from "vitest";
import type { AnalysisResult, MoveAnalysis } from "../analyze";
import { annotatedPgn, evalComment, pgnFilename } from "../pgnExport";
import { parsePgn } from "../pgn";

describe("evalComment", () => {
  it("formats pawns and mates", () => {
    expect(evalComment(34)).toBe("0.34");
    expect(evalComment(-120)).toBe("-1.20");
    expect(evalComment(99900)).toBe("#1");
    expect(evalComment(-99700)).toBe("#-3");
  });
});

describe("annotatedPgn", () => {
  const game = parsePgn('[White "Ann"]\n[Black "Bo"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxf7+ 1-0');
  const mv = (i: number, cls: MoveAnalysis["cls"], evalAfterWhite: number, bestSan: string | null = null) => ({ ...game.moves[i], cls, evalAfterWhite, bestSan }) as MoveAnalysis;

  it("writes the headers and plain numbered moves when there is no analysis", () => {
    const pgn = annotatedPgn(game, null, null);
    expect(pgn).toContain('[White "Ann"]');
    expect(pgn).toContain("1. e4 e5 2. Qh5 Nc6 3. Qxf7+ 1-0");
    expect(pgn).not.toContain("%eval");
  });

  it("adds eval comments, NAGs and the better move for errors", () => {
    const analysis = { moves: [mv(0, "best", 30), mv(1, "blunder", 250, "d5"), mv(2, "great", 260), mv(3, "mistake", 900, "Nf6"), mv(4, "best", 99900)] } as unknown as AnalysisResult;
    const pgn = annotatedPgn(game, null, analysis);
    expect(pgn).toContain("1. e4 {[%eval 0.30]}");
    expect(pgn).toContain("1... e5 $4 {[%eval 2.50] Best was d5.}");
    expect(pgn).toContain("2. Qh5 $1 {[%eval 2.60]}");
    expect(pgn).toContain("Nc6 $2");
    expect(pgn).toContain("3. Qxf7+ {[%eval #1]}");
  });

  it("escapes quotes in tags", () => {
    const g = { ...game, white: 'A "Q"' };
    expect(annotatedPgn(g, null, null)).toContain('[White "A \\"Q\\""]');
  });
});

describe("pgnFilename", () => {
  it("makes a safe file name", () => {
    expect(pgnFilename({ ...parsePgn("1. e4"), white: "Magnus C.", black: "x/y" })).toBe("Magnus_C_vs_x_y.pgn");
  });
});
