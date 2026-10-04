import { describe, expect, it } from "vitest";
import { computeFeatures } from "../features";
import type { GameRecord } from "../games";

const rec = (id: string, moves: string, playerColor: "w" | "b" | null): GameRecord =>
  ({ id, source: "lichess", url: null, white: "A", black: "B", whiteElo: null, blackElo: null, result: "1-0", date: "2024-01-01", event: null, eco: null, opening: null, timeClass: "blitz", termination: "mate", clockInitial: null, clocks: null, evals: null, moves, playerColor }) as GameRecord;

describe("computeFeatures (main-thread fallback)", () => {
  it("returns an entry for every game, null where the player is unknown or the moves are bad", async () => {
    const moves = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7";
    const games = [rec("a", moves, "w"), rec("b", moves, null), rec("c", "e4 e4 e4", "w")];
    const progress: number[] = [];
    const map = await computeFeatures(games, (done) => progress.push(done));
    expect(map?.size).toBe(3);
    expect(map?.get("a")).not.toBeNull();
    expect(map?.get("b")).toBeNull();
    expect(map?.get("c")).toBeNull();
    expect(progress).toEqual([3]);
  });

  it("stops and returns null when cancelled", async () => {
    const moves = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7";
    const games = Array.from({ length: 700 }, (_, i) => rec(`g${i}`, moves, "w"));
    let calls = 0;
    const map = await computeFeatures(games, undefined, () => ++calls >= 1);
    expect(map).toBeNull();
  });
});
