import { describe, expect, it } from "vitest";
import { dayKey, isSolutionMove, loadDaily, parseDaily, playUci, saveDaily, streakOf, type DailyHistory } from "../dailyPuzzle";

const FEN = "5R2/5Bp1/5b1k/4p2p/5p2/6P1/P2rrP1P/5RK1 w - - 0 1";
const SOLUTION = ["f8h8", "h6g5", "h8h5", "g5g4", "f2f3"];
const response = { game: { id: "7J4rhbpE" }, puzzle: { id: "fWQJU", fen: FEN, solution: SOLUTION, rating: 1830, themes: ["endgame", "mateIn3"] } };

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe("parseDaily", () => {
  it("reads a Lichess response", () => {
    expect(parseDaily(response)).toEqual({ id: "fWQJU", fen: FEN, color: "w", solution: SOLUTION, rating: 1830, themes: ["endgame", "mateIn3"] });
  });
  it("takes the colour from the side to move", () => {
    const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(parseDaily({ puzzle: { id: "x", fen: black, solution: ["e7e5"] } })?.color).toBe("b");
  });
  it("rejects responses that are missing, malformed or contain an illegal move", () => {
    expect(parseDaily(null)).toBeNull();
    expect(parseDaily({})).toBeNull();
    expect(parseDaily({ puzzle: { id: "x", fen: FEN, solution: [] } })).toBeNull();
    expect(parseDaily({ puzzle: { id: "x", fen: FEN, solution: ["zz99"] } })).toBeNull();
    expect(parseDaily({ puzzle: { id: "x", fen: FEN, solution: ["a1a8"] } })).toBeNull();
  });
});

describe("isSolutionMove", () => {
  it("accepts the expected move and rejects another", () => {
    expect(isSolutionMove(FEN, SOLUTION, 0, { from: "f8", to: "h8" })).toBe(true);
    expect(isSolutionMove(FEN, SOLUTION, 0, { from: "f7", to: "g8" })).toBe(false);
  });
  it("accepts any move that mates, as Lichess does", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1";
    expect(isSolutionMove(fen, ["a1a8"], 0, { from: "b1", to: "b8" })).toBe(true);
  });
  it("is false past the end of the line", () => {
    expect(isSolutionMove(FEN, SOLUTION, 9, { from: "f8", to: "h8" })).toBe(false);
  });
});

describe("playUci", () => {
  it("plays a move and refuses an illegal one", () => {
    expect(playUci(FEN, "f8h8")).toContain("7R");
    expect(playUci(FEN, "a2a8")).toBeNull();
  });
});

describe("streakOf", () => {
  const today = new Date(2026, 10, 1);
  const h: DailyHistory = { "2026-11-01": "clean", "2026-10-31": "solved", "2026-10-30": "solved", "2026-10-28": "solved" };
  it("counts consecutive solved days up to today", () => {
    expect(streakOf(h, today)).toBe(3);
  });
  it("keeps yesterday's streak alive until today is played", () => {
    expect(streakOf({ "2026-10-31": "clean", "2026-10-30": "clean" }, today)).toBe(2);
  });
  it("is zero after a missed day or a failed one", () => {
    expect(streakOf({ "2026-10-30": "clean" }, today)).toBe(0);
    expect(streakOf({ "2026-11-01": "failed" }, today)).toBe(0);
  });
  it("formats local dates", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("saved history", () => {
  it("round-trips and ignores junk", () => {
    const s = memory({ "chess-analyzer:daily-puzzle": JSON.stringify({ "2026-11-01": "clean", nope: "clean", "2026-11-02": "weird" }) });
    expect(loadDaily(s)).toEqual({ "2026-11-01": "clean" });
    expect(loadDaily(memory({ "chess-analyzer:daily-puzzle": "{bad" }))).toEqual({});
  });
  it("never downgrades a solved day", () => {
    const s = memory();
    let h = saveDaily({}, "2026-11-01", "clean", s);
    h = saveDaily(h, "2026-11-01", "failed", s);
    expect(h["2026-11-01"]).toBe("clean");
    expect(loadDaily(s)["2026-11-01"]).toBe("clean");
    expect(saveDaily({ "2026-11-02": "failed" }, "2026-11-02", "solved", s)["2026-11-02"]).toBe("solved");
  });
});
