import { describe, expect, it } from "vitest";
import { cleanFilter, filterGames, isFiltered, NO_FILTER } from "../gameFilter";
import type { GameRecord } from "../games";

function game(over: Partial<GameRecord>): GameRecord {
  return { id: "x", source: "lichess", result: "1-0", playerColor: "w", timeClass: "blitz", ...over } as GameRecord;
}

const games = [
  game({ id: "a", result: "1-0", playerColor: "w", timeClass: "blitz", source: "lichess" }),
  game({ id: "b", result: "1-0", playerColor: "b", timeClass: "rapid", source: "chesscom" }),
  game({ id: "c", result: "1/2-1/2", playerColor: "w", timeClass: "rapid", source: "chesscom" }),
  game({ id: "d", result: "0-1", playerColor: "w", timeClass: "bullet", source: "lichess" }),
  game({ id: "e", result: "1-0", playerColor: null, timeClass: "blitz", source: "lichess" }),
];
const ids = (list: GameRecord[]) => list.map((g) => g.id);

describe("filterGames", () => {
  it("returns everything with no filter", () => {
    expect(filterGames(games, NO_FILTER)).toBe(games);
  });
  it("filters by site and time control", () => {
    expect(ids(filterGames(games, { ...NO_FILTER, source: "chesscom" }))).toEqual(["b", "c"]);
    expect(ids(filterGames(games, { ...NO_FILTER, timeClass: "rapid" }))).toEqual(["b", "c"]);
  });
  it("filters by the colour you played", () => {
    expect(ids(filterGames(games, { ...NO_FILTER, color: "b" }))).toEqual(["b"]);
  });
  it("filters by how the game ended for you, not for White", () => {
    expect(ids(filterGames(games, { ...NO_FILTER, result: "win" }))).toEqual(["a"]);
    expect(ids(filterGames(games, { ...NO_FILTER, result: "loss" }))).toEqual(["b", "d"]);
    expect(ids(filterGames(games, { ...NO_FILTER, result: "draw" }))).toEqual(["c"]);
  });
  it("combines filters", () => {
    expect(ids(filterGames(games, { ...NO_FILTER, source: "lichess", result: "win" }))).toEqual(["a"]);
  });
});

describe("cleanFilter", () => {
  it("keeps good values and resets bad ones", () => {
    expect(cleanFilter({ source: "lichess", color: "purple", result: 3, timeClass: "rapid" })).toEqual({ source: "lichess", color: "all", result: "all", timeClass: "rapid" });
    expect(cleanFilter(null)).toEqual(NO_FILTER);
  });
  it("knows when a filter is on", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, color: "w" })).toBe(true);
  });
});
