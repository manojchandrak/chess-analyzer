import { describe, expect, it } from "vitest";
import type { GameRecord } from "../games";
import { parsePgn, parseRecord } from "../pgn";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("parsePgn", () => {
  it("returns headers and a per-ply list with FENs before and after each move", () => {
    const g = parsePgn('[White "A"]\n[Black "B"]\n[WhiteElo "1800"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0');
    expect(g.white).toBe("A");
    expect(g.whiteElo).toBe(1800);
    expect(g.blackElo).toBeNull();
    expect(g.moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(g.moves[0].fenBefore).toBe(START);
    expect(g.moves[0].fenAfter).toBe(g.moves[1].fenBefore);
    expect(g.moves.map((m) => m.color)).toEqual(["w", "b", "w"]);
    expect(g.moves[2]).toMatchObject({ ply: 3, moveNumber: 2, piece: "n", from: "g1", to: "f3" });
  });
  it("records captures", () => {
    const g = parsePgn("1. e4 d5 2. exd5");
    expect(g.moves[2].captured).toBe("p");
  });
});

describe("parseRecord", () => {
  it("replays SAN moves from a record", () => {
    const rec = { white: "W", black: "B", whiteElo: null, blackElo: null, result: "*", moves: "d4 d5 c4" } as GameRecord;
    const g = parseRecord(rec);
    expect(g.moves).toHaveLength(3);
    expect(g.moves[2].san).toBe("c4");
  });
  it("throws on an illegal move so callers can skip the game", () => {
    expect(() => parseRecord({ white: "W", black: "B", whiteElo: null, blackElo: null, result: "*", moves: "e4 e4" } as GameRecord)).toThrow();
  });
});
