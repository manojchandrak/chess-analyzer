import { describe, expect, it } from "vitest";
import { currentFen, fenProblem, isPromotion, numbered, ownPiece, play, playUci, sideToMove, START_FEN, startExplore, status, targetsFrom, undo } from "../explore";

describe("fenProblem", () => {
  it("accepts real positions and explains bad ones", () => {
    expect(fenProblem(START_FEN)).toBeNull();
    expect(fenProblem("  4k3/8/8/8/8/8/8/4K3 w - - 0 1  ")).toBeNull();
    expect(fenProblem("nonsense")).toMatch(/isn't a valid position/);
    expect(fenProblem("8/8/8/8/8/8/8/8 w - - 0 1")).toMatch(/isn't a valid position/); // no kings
  });
});

describe("playing moves", () => {
  it("plays legal moves, tracks the side to move and refuses illegal ones", () => {
    let s = startExplore(START_FEN);
    expect(sideToMove(s)).toBe("w");
    s = play(s, { from: "e2", to: "e4" })!;
    expect(s.moves[0]).toMatchObject({ san: "e4", color: "w", from: "e2", to: "e4" });
    expect(sideToMove(s)).toBe("b");
    expect(play(s, { from: "e2", to: "e4" })).toBeNull();
    expect(play(s, "Qh5")).toBeNull();
    expect(playUci(s, "e7e5")?.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
    expect(playUci(s, "zzzz")).toBeNull();
  });

  it("undoes moves back to the start but no further", () => {
    let s = startExplore(START_FEN);
    s = playUci(playUci(playUci(s, "e2e4")!, "e7e5")!, "g1f3")!;
    expect(undo(s).moves).toHaveLength(2);
    expect(undo(s, 2).moves).toHaveLength(1);
    expect(undo(s, 10).moves).toHaveLength(0);
    expect(currentFen(undo(s, 10))).toBe(START_FEN);
  });

  it("works from any position, including move numbers", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    let s = startExplore(fen);
    s = playUci(playUci(s, "f1b5")!, "a7a6")!;
    expect(numbered(s)).toEqual([{ no: 3, w: "Bb5", b: "a6" }]);
    s = playUci(s, "b5a4")!;
    expect(numbered(s)).toEqual([{ no: 3, w: "Bb5", b: "a6" }, { no: 4, w: "Ba4" }]);
  });

  it("numbers a line that starts with Black's move", () => {
    const s = playUci(startExplore("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"), "e7e5")!;
    expect(numbered(s)).toEqual([{ no: 1, b: "e5" }]);
  });
});

describe("move helpers", () => {
  it("lists targets, own pieces and promotions", () => {
    expect(targetsFrom(START_FEN, "g1").sort()).toEqual(["f3", "h3"]);
    expect(targetsFrom(START_FEN, "e5")).toEqual([]);
    expect(ownPiece(START_FEN, "e2")).toBe(true);
    expect(ownPiece(START_FEN, "e7")).toBe(false);
    const promo = "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1";
    expect(isPromotion(promo, "e7", "e8")).toBe(true);
    expect(isPromotion(START_FEN, "e2", "e4")).toBe(false);
    expect(playUci(startExplore(promo), "e7e8q")?.moves[0].san).toBe("e8=Q");
  });
});

describe("status", () => {
  it("detects checkmate, stalemate, insufficient material and repetition", () => {
    const mate = ["f2f3", "e7e5", "g2g4", "d8h4"].reduce((s, u) => playUci(s, u)!, startExplore(START_FEN));
    expect(status(mate)).toMatchObject({ over: true, text: "Checkmate: Black wins." });
    expect(status(startExplore("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toMatchObject({ over: true, text: "Draw by stalemate." });
    expect(status(startExplore("8/8/8/4k3/8/8/8/4K3 w - - 0 1"))).toMatchObject({ over: true, text: "Draw by insufficient material." });
    const rep = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"].reduce((s, u) => playUci(s, u)!, startExplore(START_FEN));
    expect(status(rep)).toMatchObject({ over: true, text: "Draw by threefold repetition." });
  });
  it("reports check while the game goes on", () => {
    const s = ["e2e4", "f7f6", "d1h5"].reduce((st, u) => playUci(st, u)!, startExplore(START_FEN));
    expect(status(s)).toEqual({ over: false, text: null, inCheck: true });
    expect(status(startExplore(START_FEN))).toEqual({ over: false, text: null, inCheck: false });
  });
});
