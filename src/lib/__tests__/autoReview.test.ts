import { describe, expect, it } from "vitest";
import { autoReview, gamesToReview } from "../autoReview";
import { EngineError } from "../engine";
import type { GameRecord } from "../games";

const g = (id: string, playerColor: "w" | "b" | null = "w"): GameRecord => ({ id, playerColor }) as GameRecord;

describe("gamesToReview", () => {
  it("skips games that already have numbers and games with no known player", () => {
    const games = [g("a"), g("b"), g("c", null), g("d")];
    expect(gamesToReview(games, (id) => id === "b").map((x) => x.id)).toEqual(["a", "d"]);
  });
});

describe("autoReview", () => {
  it("reviews the games that need it, in order, and reports progress", async () => {
    const seen: string[] = [];
    const progress: [number, number][] = [];
    const r = await autoReview([g("a"), g("b"), g("c")], {
      hasStats: (id) => id === "b",
      review: async (game) => void seen.push(game.id),
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(seen).toEqual(["a", "c"]);
    expect(r).toEqual({ total: 2, reviewed: 2, error: null, stopped: false });
    expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  it("does nothing when every game already has numbers", async () => {
    let calls = 0;
    const r = await autoReview([g("a"), g("b")], { hasStats: () => true, review: async () => void calls++ });
    expect(calls).toBe(0);
    expect(r).toMatchObject({ total: 0, reviewed: 0, stopped: false });
  });

  it("stops between games when cancelled", async () => {
    const seen: string[] = [];
    let stop = false;
    const r = await autoReview([g("a"), g("b"), g("c")], {
      hasStats: () => false,
      cancelled: () => stop,
      review: async (game) => {
        seen.push(game.id);
        stop = true;
      },
    });
    expect(seen).toEqual(["a"]);
    expect(r).toMatchObject({ reviewed: 1, stopped: true });
  });

  it("stops and reports when Stockfish fails, but skips a game that merely can't be read", async () => {
    const seen: string[] = [];
    const r = await autoReview([g("bad"), g("ok"), g("engine"), g("never")], {
      hasStats: () => false,
      review: async (game) => {
        seen.push(game.id);
        if (game.id === "bad") throw new Error("illegal move");
        if (game.id === "engine") throw new EngineError("Stockfish failed to load.");
      },
    });
    expect(seen).toEqual(["bad", "ok", "engine"]);
    expect(r).toEqual({ total: 4, reviewed: 1, error: "Stockfish failed to load.", stopped: false });
  });
});
