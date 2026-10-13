import { describe, expect, it } from "vitest";
import type { GameRecord } from "../games";
import { MAX_RECENT, mergeHistory, parseHistory, prune, recordOpened, removeEntry, toggleFavorite, trackable, visibleEntries, type HistoryMap } from "../historyCore";

const game = (id: string, over: Partial<GameRecord> = {}): GameRecord => ({
  id,
  source: id.startsWith("chesscom") ? "chesscom" : "lichess",
  url: null,
  white: "Alice",
  black: "Bob",
  whiteElo: 1500,
  blackElo: 1480,
  result: "1-0",
  date: "2026-10-01",
  event: null,
  eco: null,
  opening: "Italian Game",
  timeClass: "rapid",
  termination: "mate",
  clockInitial: null,
  clocks: [1, 2, 3],
  evals: [{ cp: 10, mate: null }],
  moves: "e4 e5 Nf3",
  playerColor: "w",
  ...over,
});

describe("history", () => {
  it("keeps Lichess and Chess.com games, each under its own site-prefixed id, and ignores everything else", () => {
    expect(trackable(game("lichess:abc"))).toBe(true);
    expect(trackable(game("chesscom:123"))).toBe(true);
    expect(trackable(game("morphy-1", { source: "legend" }))).toBe(false);
    expect(trackable(game("x", { source: "pgn" }))).toBe(false);
    let map: HistoryMap = {};
    map = recordOpened(map, game("lichess:abc"), 1000);
    map = recordOpened(map, game("chesscom:123"), 2000);
    map = recordOpened(map, game("legend-1", { source: "legend" }), 3000);
    expect(visibleEntries(map).map((e) => e.id)).toEqual(["chesscom:123", "lichess:abc"]);
  });

  it("drops the heavy per-move data but keeps what's needed to reopen the game", () => {
    const e = visibleEntries(recordOpened({}, game("lichess:abc"), 1))[0];
    expect(e.game?.evals).toBeNull();
    expect(e.game?.clocks).toBeNull();
    expect(e.game?.moves).toBe("e4 e5 Nf3");
    expect(e.game?.white).toBe("Alice");
  });

  it("moves a re-opened game to the top without losing its favourite mark", () => {
    let map = toggleFavorite({}, game("lichess:abc"), 1000);
    map = recordOpened(map, game("chesscom:123"), 2000);
    map = recordOpened(map, game("lichess:abc"), 3000);
    const list = visibleEntries(map);
    expect(list.map((e) => e.id)).toEqual(["lichess:abc", "chesscom:123"]);
    expect(list[0].favorite).toBe(true);
  });

  it("favourites a game that was never opened, and un-starring it takes it back out of the list", () => {
    let map = toggleFavorite({}, game("chesscom:9"), 1000);
    expect(visibleEntries(map)[0].favorite).toBe(true);
    map = toggleFavorite(map, game("chesscom:9"), 2000);
    expect(visibleEntries(map)).toEqual([]);
  });

  it("keeps an opened game in the list when it is un-starred", () => {
    let map = recordOpened({}, game("lichess:abc"), 1000);
    map = toggleFavorite(map, game("lichess:abc"), 2000);
    map = toggleFavorite(map, game("lichess:abc"), 3000);
    expect(visibleEntries(map).map((e) => [e.id, e.favorite])).toEqual([["lichess:abc", false]]);
  });

  it("opening a starred game marks it as opened, so un-starring it later keeps it", () => {
    let map = toggleFavorite({}, game("lichess:abc"), 1000);
    map = recordOpened(map, game("lichess:abc"), 2000);
    map = toggleFavorite(map, game("lichess:abc"), 3000);
    expect(visibleEntries(map).map((e) => e.id)).toEqual(["lichess:abc"]);
  });

  it("removes a game and its favourite mark, and a re-opened game starts unfavourited", () => {
    let map = toggleFavorite({}, game("lichess:abc"), 1000);
    map = removeEntry(map, "lichess:abc", 2000);
    expect(visibleEntries(map)).toEqual([]);
    map = recordOpened(map, game("lichess:abc"), 3000);
    expect(visibleEntries(map)[0].favorite).toBe(false);
  });

  it("retires the oldest non-favourites beyond the limit but never a favourite", () => {
    let map: HistoryMap = toggleFavorite({}, game("lichess:fav"), 1);
    for (let i = 0; i < MAX_RECENT + 5; i++) map = recordOpened(map, game(`lichess:g${i}`), 100 + i);
    const ids = new Set(visibleEntries(map).map((e) => e.id));
    expect(ids.has("lichess:fav")).toBe(true);
    expect(ids.has("lichess:g0")).toBe(false);
    expect(ids.has(`lichess:g${MAX_RECENT + 4}`)).toBe(true);
    expect(visibleEntries(map).filter((e) => !e.favorite).length).toBe(MAX_RECENT);
  });

  it("forgets old removals after a while", () => {
    const removed = removeEntry(recordOpened({}, game("lichess:abc"), 1000), "lichess:abc", 2000);
    expect(Object.keys(prune(removed, 2000 + 10 * 86_400_000))).toEqual(["lichess:abc"]);
    expect(Object.keys(prune(removed, 2000 + 100 * 86_400_000))).toEqual([]);
  });

  it("merges two devices: the most recent change per game wins, and a removal beats an older favourite", () => {
    const phone = toggleFavorite({}, game("lichess:abc"), 1000);
    const laptop = removeEntry(phone, "lichess:abc", 5000);
    expect(visibleEntries(mergeHistory(phone, laptop))).toEqual([]);
    const both = mergeHistory(recordOpened({}, game("chesscom:1"), 1000), recordOpened({}, game("lichess:2"), 2000));
    expect(visibleEntries(both).map((e) => e.id)).toEqual(["lichess:2", "chesscom:1"]);
    const older = recordOpened({}, game("lichess:abc"), 1000);
    const newer = toggleFavorite(older, game("lichess:abc"), 4000);
    expect(visibleEntries(mergeHistory(older, newer))[0].favorite).toBe(true);
    expect(visibleEntries(mergeHistory(newer, older))[0].favorite).toBe(true);
  });

  it("ignores stored data that isn't shaped like history", () => {
    expect(parseHistory(null)).toEqual({});
    expect(parseHistory([1, 2])).toEqual({});
    expect(parseHistory({ a: { updatedAt: "x" }, b: 5, c: { openedAt: 1, updatedAt: 2, game: { id: "c" }, favorite: true } })).toEqual({
      c: { id: "c", game: { id: "c" }, favorite: true, opened: true, openedAt: 1, updatedAt: 2 },
    });
  });
});
