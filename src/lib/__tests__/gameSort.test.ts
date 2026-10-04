import { describe, expect, it } from "vitest";
import type { GameRecord } from "../games";
import type { GameStats } from "../gameStats";
import { PRESETS, presetOf, sortGames, toggleSort, type Sort } from "../gameSort";

const g = (id: string, over: Partial<GameRecord> = {}): GameRecord =>
  ({ id, white: "Me", black: "Opp", whiteElo: 1500, blackElo: 1500, result: "1-0", date: "2024-01-01", moves: "e4 e5", eco: null, opening: null, playerColor: "w", ...over }) as GameRecord;
const stat = (over: Partial<GameStats>): GameStats => ({ accuracy: 80, performance: 1500, brilliant: 0, great: 0, best: 0, inaccuracies: 0, mistakes: 0, blunders: 0, ...over });
const ids = (list: GameRecord[]) => list.map((x) => x.id);
const sort = (games: GameRecord[], by: Sort["by"], dir: Sort["dir"], stats = new Map<string, GameStats>()) => ids(sortGames(games, stats, { by, dir }));

describe("sorting by game details", () => {
  const games = [
    g("a", { date: "2024-03-01", result: "0-1", blackElo: 1800, opening: "Sicilian Defense", moves: "e4 c5 Nf3" }),
    g("b", { date: "2024-05-01", result: "1-0", blackElo: 2100, opening: "Italian Game", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5" }),
    g("c", { date: "2023-12-01", result: "1/2-1/2", blackElo: null, opening: null, moves: "d4 d5" }),
    g("d", { date: "2024-01-15", result: "1-0", blackElo: 1600, opening: "French Defense", moves: "e4 e6 d4 d5 Nc3" }),
  ];

  it("sorts by date, newest or oldest first", () => {
    expect(sort(games, "date", "desc")).toEqual(["b", "a", "d", "c"]);
    expect(sort(games, "date", "asc")).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by result: wins, draws, losses (and the reverse), ties newest first", () => {
    expect(sort(games, "result", "desc")).toEqual(["b", "d", "c", "a"]);
    expect(sort(games, "result", "asc")).toEqual(["a", "c", "b", "d"]);
  });

  it("scores a result from the player's side", () => {
    const asBlack = [g("w", { result: "1-0", playerColor: "b" }), g("l", { result: "0-1", playerColor: "b", date: "2023-01-01" })];
    expect(sort(asBlack, "result", "desc")).toEqual(["l", "w"]);
  });

  it("sorts by opponent rating with unknown ratings last either way", () => {
    expect(sort(games, "opponent", "desc")).toEqual(["b", "a", "d", "c"]);
    expect(sort(games, "opponent", "asc")).toEqual(["d", "a", "b", "c"]);
  });

  it("uses the opponent's side when the player was Black", () => {
    const list = [g("x", { playerColor: "b", whiteElo: 2000, blackElo: 900 }), g("y", { playerColor: "b", whiteElo: 1200, blackElo: 2500 })];
    expect(sort(list, "opponent", "desc")).toEqual(["x", "y"]);
  });

  it("sorts by opening name, A to Z or Z to A, with unnamed openings last", () => {
    expect(sort(games, "opening", "asc")).toEqual(["d", "b", "a", "c"]);
    expect(sort(games, "opening", "desc")).toEqual(["a", "b", "d", "c"]);
  });

  it("sorts by length", () => {
    expect(sort(games, "length", "desc")).toEqual(["b", "d", "a", "c"]);
    expect(sort(games, "length", "asc")).toEqual(["c", "a", "d", "b"]);
  });

  it("does not change the list it is given", () => {
    const copy = [...games];
    sortGames(games, new Map(), { by: "date", dir: "asc" });
    expect(games).toEqual(copy);
  });
});

describe("sorting by engine review", () => {
  const games = [g("a", { date: "2024-01-01" }), g("b", { date: "2024-02-01" }), g("c", { date: "2024-03-01" }), g("d", { date: "2024-04-01" })];
  const stats = new Map([
    ["a", stat({ accuracy: 90, performance: 1900, brilliant: 0, blunders: 2 })],
    ["b", stat({ accuracy: 70, performance: 1400, brilliant: 2, great: 1, blunders: 0 })],
    ["c", stat({ accuracy: 85, performance: 1700, brilliant: 1, blunders: 1 })],
  ]); // "d" has not been reviewed

  it("ranks reviewed games by accuracy and puts unreviewed ones after, in both directions", () => {
    expect(sort(games, "accuracy", "desc", stats)).toEqual(["a", "c", "b", "d"]);
    expect(sort(games, "accuracy", "asc", stats)).toEqual(["b", "c", "a", "d"]);
  });

  it("ranks by performance, brilliant moves and blunders", () => {
    expect(sort(games, "performance", "desc", stats)).toEqual(["a", "c", "b", "d"]);
    expect(sort(games, "brilliant", "desc", stats)).toEqual(["b", "c", "a", "d"]);
    expect(sort(games, "blunders", "asc", stats)).toEqual(["b", "c", "a", "d"]);
    expect(sort(games, "blunders", "desc", stats)).toEqual(["a", "c", "b", "d"]);
  });

  it("orders games nobody has reviewed newest first", () => {
    expect(sort(games, "accuracy", "desc")).toEqual(["d", "c", "b", "a"]);
    expect(sort(games, "accuracy", "asc")).toEqual(["d", "c", "b", "a"]);
  });
});

describe("header clicks and presets", () => {
  it("starts a new column in its natural direction and flips it on the next click", () => {
    let s: Sort = { by: "date", dir: "desc" };
    s = toggleSort(s, "accuracy");
    expect(s).toEqual({ by: "accuracy", dir: "desc" });
    s = toggleSort(s, "accuracy");
    expect(s).toEqual({ by: "accuracy", dir: "asc" });
    s = toggleSort(s, "opening");
    expect(s).toEqual({ by: "opening", dir: "asc" });
    s = toggleSort(s, "opening");
    expect(s).toEqual({ by: "opening", dir: "desc" });
  });

  it("matches a sort to a menu preset when there is one", () => {
    expect(presetOf({ by: "date", dir: "desc" })).toBe("newest");
    expect(presetOf({ by: "blunders", dir: "asc" })).toBe("fewestBlunders");
    expect(presetOf({ by: "opening", dir: "asc" })).toBeNull();
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});
