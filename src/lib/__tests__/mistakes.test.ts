import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "../analyze";
import { MAX_MISTAKES, addMistakes, listMistakes, mergeMistakes, mistakesFromAnalysis, parseMistakes, type MistakeMap } from "../mistakeCore";
import type { PuzzleItem } from "../puzzles";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

const move = (over: Record<string, unknown>) => ({ ply: 1, color: "w", san: "e4", quality: "best", bestSan: null, cpLoss: 0, fenBefore: START, ...over });
const analysisOf = (moves: unknown[]) => ({ moves }) as unknown as AnalysisResult;
const game = { id: "lichess:abc", white: "Alice", black: "Bob", date: "2026-10-01" };
const item = (id: string, over: Partial<PuzzleItem> = {}): PuzzleItem => ({ id, gameId: "lichess:abc", fen: START, color: "w", played: "a3", best: "e4", cpLoss: 150, quality: "mistake", opponent: "Bob", date: "2026-10-01", ...over });

describe("mistakesFromAnalysis", () => {
  it("keeps only the player's own mistakes and blunders that have a better move", () => {
    const a = analysisOf([
      move({ ply: 1, san: "a3", quality: "blunder", bestSan: "e4", cpLoss: 300 }),
      move({ ply: 2, color: "b", san: "h6", quality: "blunder", bestSan: "e5", cpLoss: 400, fenBefore: AFTER_E4 }), // the opponent's
      move({ ply: 3, san: "Nf3", quality: "inaccuracy", bestSan: "d4", cpLoss: 40 }), // too small
      move({ ply: 5, san: "Bc4", quality: "mistake", bestSan: null, cpLoss: 120 }), // no engine suggestion
      move({ ply: 7, san: "Qh5", quality: "mistake", bestSan: "Qh5", cpLoss: 120 }), // best move is the move played
      move({ ply: 9, san: "g4", quality: "mistake", bestSan: "d4+", cpLoss: 180 }),
    ]);
    const items = mistakesFromAnalysis(a, game, "w");
    expect(items.map((i) => i.id)).toEqual(["lichess:abc#1", "lichess:abc#9"]);
    expect(items[0]).toMatchObject({ fen: START, color: "w", played: "a3", best: "e4", quality: "blunder", opponent: "Bob", date: "2026-10-01" });
  });

  it("uses the right opponent when the player had Black", () => {
    const a = analysisOf([move({ ply: 2, color: "b", san: "h6", quality: "mistake", bestSan: "e5", cpLoss: 150, fenBefore: AFTER_E4 })]);
    expect(mistakesFromAnalysis(a, game, "b")[0].opponent).toBe("Alice");
  });
});

describe("the mistake bank", () => {
  it("adds new mistakes and leaves ones already there untouched", () => {
    let map: MistakeMap = addMistakes({}, [item("g#1", { cpLoss: 100 })], 1000);
    const again = addMistakes(map, [item("g#1", { cpLoss: 999 })], 2000);
    expect(again).toBe(map); // nothing new, so nothing changes
    map = addMistakes(map, [item("g#2")], 3000);
    expect(Object.keys(map).sort()).toEqual(["g#1", "g#2"]);
    expect(map["g#1"].cpLoss).toBe(100);
    expect(map["g#1"].addedAt).toBe(1000);
  });

  it("drops the oldest beyond the limit", () => {
    let map: MistakeMap = {};
    for (let i = 0; i < MAX_MISTAKES + 3; i++) map = addMistakes(map, [item(`g#${i}`)], 1000 + i);
    expect(Object.keys(map).length).toBe(MAX_MISTAKES);
    expect(map["g#0"]).toBeUndefined();
    expect(map[`g#${MAX_MISTAKES + 2}`]).toBeDefined();
  });

  it("lists blunders before mistakes, biggest losses first", () => {
    const map = addMistakes({}, [item("a", { quality: "mistake", cpLoss: 500 }), item("b", { quality: "blunder", cpLoss: 200 }), item("c", { quality: "blunder", cpLoss: 350 })], 1);
    expect(listMistakes(map).map((m) => m.id)).toEqual(["c", "b", "a"]);
  });

  it("combines two devices' banks", () => {
    const phone = addMistakes({}, [item("g#1"), item("g#2")], 1000);
    const laptop = addMistakes({}, [item("g#2"), item("g#3")], 2000);
    expect(Object.keys(mergeMistakes(phone, laptop)).sort()).toEqual(["g#1", "g#2", "g#3"]);
    expect(mergeMistakes(phone, laptop)["g#2"].addedAt).toBe(1000); // this device's copy wins
  });

  it("ignores stored entries that are incomplete or not a legal position", () => {
    const good = { ...item("g#1"), addedAt: 5 };
    const parsed = parseMistakes({ "g#1": good, bad1: { ...good, fen: "not a fen" }, bad2: { ...good, quality: "great" }, bad3: "x", bad4: { ...good, addedAt: "soon" } });
    expect(Object.keys(parsed)).toEqual(["g#1"]);
    expect(parseMistakes(null)).toEqual({});
    expect(parseMistakes([1])).toEqual({});
  });
});
