import { describe, expect, it } from "vitest";
import { recoverMoves, tokenize } from "../moveText";

const RUY = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];

describe("tokenize", () => {
  it("drops move numbers written with dots, with or without a space", () => {
    expect(tokenize("1. e4 e5 2.Nf3 Nc6 3... a6").tokens).toEqual(["e4", "e5", "Nf3", "Nc6", "a6"]);
  });
  it("reads OCR's letter l as the move number 1", () => {
    expect(tokenize("l. e4 e5").tokens).toEqual(["e4", "e5"]);
  });
  it("reads one row per line, with the move number on its own", () => {
    expect(tokenize("1 e4 e5\n2 Nf3 Nc6\n").tokens).toEqual(["1", "e4", "e5", "2", "Nf3", "Nc6"]);
  });
  it("removes comments, side lines and PGN tag lines", () => {
    expect(tokenize('[Event "x"]\n1. e4 {best} e5 (1...c5) 2. Nf3').tokens).toEqual(["e4", "e5", "Nf3"]);
  });
  it("finds the result and removes it from the moves", () => {
    const t = tokenize("1. e4 e5 1/2-1/2");
    expect(t.result).toBe("1/2-1/2");
    expect(t.tokens).toEqual(["e4", "e5"]);
    expect(tokenize("1. e4 e5 ½-½").result).toBe("1/2-1/2");
    expect(tokenize("1. e4 e5 1 - 0").result).toBe("1-0");
  });
  it("strips annotation marks", () => {
    expect(tokenize("1. e4!? e5?!").tokens).toEqual(["e4", "e5"]);
  });
  it("reads figurine notation", () => {
    expect(tokenize("1. e4 e5 2. ♘f3 ♘c6").tokens).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });
});

describe("recoverMoves", () => {
  it("reads a clean move list", () => {
    const g = recoverMoves("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");
    expect(g.sans).toEqual(RUY);
    expect(g.problem).toBeNull();
    expect(g.fixes).toEqual([]);
    expect(g.pgn).toBe("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
  });

  it("reads scoresheet columns with move numbers on their own", () => {
    expect(recoverMoves("1 e4 e5\n2 Nf3 Nc6\n3 Bb5 a6").sans).toEqual(RUY);
  });

  it("keeps a move like b4 that looks like the number 64", () => {
    // 1. b4 e5 ... "64" is not move 1, so it is read as the move b4.
    const g = recoverMoves("64 e5");
    expect(g.sans).toEqual(["b4", "e5"]);
    expect(g.fixes).toHaveLength(1);
  });

  it("reads castling written with zeros or letters", () => {
    const g = recoverMoves("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. 0-0 Nf6 5. d3 O-O");
    expect(g.sans.slice(6)).toEqual(["O-O", "Nf6", "d3", "O-O"]);
    const long = recoverMoves("1. d4 d5 2. Nc3 Nc6 3. Bf4 Bf5 4. Qd2 Qd7 5. 0-0-0");
    expect(long.sans[8]).toBe("O-O-O");
  });

  it("corrects look-alike characters when the fix is a legal move, and reports it", () => {
    const g = recoverMoves("1. e4 eS 2. Nf3 Nc6 3. Bb5 a6"); // S for 5
    expect(g.sans).toEqual(RUY);
    expect(g.fixes).toHaveLength(1);
    expect(g.fixes[0]).toMatchObject({ ply: 1, from: "eS", to: "e5" });
    // e6 would have fit this short game too, so it is offered as the other possibility.
    expect(g.fixes[0].alternatives).toEqual(["e6"]);
  });

  it("reads lowercase piece letters and uppercase file letters", () => {
    const g = recoverMoves("1. e4 e5 2. nf3 Nc6 3. Bb5 A6");
    expect(g.sans).toEqual(RUY);
    expect(g.fixes.map((f) => f.ply)).toEqual([2, 5]);
  });

  it("reads a lost capture sign and lost check marks", () => {
    const g = recoverMoves("1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5");
    expect(g.sans).toEqual(["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"]);
    expect(g.fixes).toEqual([]);
    expect(recoverMoves("1. e4 d5 2. ed5").sans).toEqual(["e4", "d5", "exd5"]);
  });

  it("splits two moves that OCR ran together", () => {
    const g = recoverMoves("1. e4e5 2. Nf3Nc6");
    expect(g.sans).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("stops at the first move it cannot read and keeps the earlier ones", () => {
    const g = recoverMoves("1. e4 e5 2. Nf3 Qzz9 3. Bb5");
    expect(g.sans).toEqual(["e4", "e5", "Nf3"]);
    expect(g.problem).toEqual({ ply: 3, text: "Qzz9" });
    expect(g.result).toBe("*");
  });

  it("uses the rest of the game to choose between two readings of a smudged move", () => {
    // "ed" could be e5 or e6, but only e5 lets White play dxe5 later.
    const g = recoverMoves("1. e4 ed 2. Nf3 d6 3. d4 Bg4 4. dxe5");
    expect(g.sans).toEqual(["e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5"]);
    expect(g.problem).toBeNull();
    expect(g.fixes).toHaveLength(1);
    expect(g.fixes[0].alternatives).toBeUndefined();
  });

  it("repairs a stray character", () => {
    const g = recoverMoves("1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxeb5 Bxf3");
    expect(g.sans[6]).toBe("dxe5");
    expect(g.fixes.map((f) => f.to)).toContain("dxe5");
  });

  it("repairs a missing rank digit", () => {
    expect(recoverMoves("1. e4 e5 2. Nf Nc6").sans).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("never invents moves: nonsense stays unread", () => {
    const g = recoverMoves("hello world");
    expect(g.sans).toEqual([]);
    expect(g.problem?.text).toBe("hello");
  });

  it("keeps a game result at the end", () => {
    const g = recoverMoves("1. f3 e5 2. g4 Qh4# 0-1");
    expect(g.sans).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(g.result).toBe("0-1");
    expect(g.pgn.endsWith(" 0-1")).toBe(true);
  });

  it("handles promotions", () => {
    const g = recoverMoves("1. a4 b5 2. axb5 a6 3. bxa6 Bb7 4. a7 Nf6 5. axb8=Q");
    expect(g.sans.at(-1)).toBe("axb8=Q");
    expect(recoverMoves("1. a4 b5 2. axb5 a6 3. bxa6 Bb7 4. a7 Nf6 5. axb8Q").sans.at(-1)).toBe("axb8=Q");
  });

  it("returns an empty game for empty text", () => {
    const g = recoverMoves("   \n ");
    expect(g.sans).toEqual([]);
    expect(g.problem).toBeNull();
  });
});
