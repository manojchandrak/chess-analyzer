import { describe, expect, it } from "vitest";
import type { GameRecord } from "../games";
import { evalValue, fetchGmPuzzle, findCandidates, hashOf, loadCachedGm, puzzleFromGame, saveCachedGm } from "../gmPuzzle";

type E = { cp: number | null; mate: number | null };
const cp = (n: number): E => ({ cp: n, mate: null });

/** 14 evaluations (White's view), level at first; Black blunders at ply 11, then White (ply 12) keeps the win. */
function evalsWithBlunder(): E[] {
  const e: E[] = Array.from({ length: 11 }, () => cp(20));
  e.push(cp(400)); // ply 11: Black's blunder
  e.push(cp(420)); // ply 12: White's strong reply
  e.push(cp(430));
  return e;
}

// A real game's first 14 plies, so the SAN is legal.
const MOVES = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6";
function record(evals: E[] | null): GameRecord {
  return { id: "lichess:abc", source: "lichess", white: "Magnus", black: "Opp", moves: MOVES, evals, playerColor: "w" } as GameRecord;
}

describe("evalValue", () => {
  it("turns centipawns and mates into one number", () => {
    expect(evalValue(cp(35))).toBe(35);
    expect(evalValue({ cp: null, mate: 3 })).toBeGreaterThan(9000);
    expect(evalValue({ cp: null, mate: -3 })).toBeLessThan(-9000);
    expect(evalValue(undefined)).toBe(0);
  });
});

describe("findCandidates", () => {
  it("finds the grandmaster's move after the opponent's blunder", () => {
    expect(findCandidates(evalsWithBlunder(), "w").map((c) => c.ply)).toEqual([12]);
  });
  it("ignores it for the other side, and when the game was already won", () => {
    expect(findCandidates(evalsWithBlunder(), "b")).toEqual([]);
    const won = Array.from({ length: 14 }, () => cp(500));
    expect(findCandidates(won, "w")).toEqual([]);
  });
  it("ignores a reply that throws the advantage away", () => {
    const e = evalsWithBlunder();
    e[12] = cp(100);
    expect(findCandidates(e, "w")).toEqual([]);
  });
  it("finds a newly available short mate", () => {
    const e: E[] = Array.from({ length: 13 }, () => cp(100));
    e[12] = { cp: null, mate: 2 };
    expect(findCandidates(e, "w").map((c) => c.ply)).toEqual([12]);
  });
});

describe("puzzleFromGame", () => {
  it("sets the position before the move and the move to find", () => {
    const p = puzzleFromGame(record(evalsWithBlunder() as GameRecord["evals"]), "w", "2026-11-01");
    expect(p?.ply).toBe(12);
    expect(p?.best).toBe("Bb3");
    expect(p?.color).toBe("w");
    expect(p?.fen.split(" ")[1]).toBe("w");
    expect(p?.gm).toBe("Magnus");
    expect(p?.opponent).toBe("Opp");
  });
  it("is null without analysis or a suitable moment", () => {
    expect(puzzleFromGame(record(null), "w", "2026-11-01")).toBeNull();
    expect(puzzleFromGame(record(Array.from({ length: 14 }, () => cp(0)) as GameRecord["evals"]), "w", "2026-11-01")).toBeNull();
  });
});

describe("hashOf", () => {
  it("is stable and differs by day", () => {
    expect(hashOf("2026-11-01")).toBe(hashOf("2026-11-01"));
    expect(hashOf("2026-11-01")).not.toBe(hashOf("2026-11-02"));
  });
});

describe("fetchGmPuzzle", () => {
  const now = Date.UTC(2026, 10, 1);
  function raw(title: string | undefined, createdAt = now - 86_400_000) {
    const analysis = evalsWithBlunder().map((e) => ({ eval: e.cp ?? undefined }));
    return { id: "abc", variant: "standard", speed: "blitz", createdAt, status: "resign", winner: "white", moves: MOVES, analysis, players: { white: { user: { name: "Magnus", title } }, black: { user: { name: "Opp" } } } };
  }
  function fakeFetch(games: unknown[]): typeof fetch {
    return (async (url: string) => {
      if (String(url).includes("/api/player/top/")) return new Response(JSON.stringify({ users: [{ username: "Magnus", title: "GM" }, { username: "Other", title: "IM" }] }));
      return new Response(games.map((g) => JSON.stringify(g)).join("\n"));
    }) as unknown as typeof fetch;
  }
  it("builds a puzzle from a recent grandmaster game", async () => {
    const p = await fetchGmPuzzle("2026-11-01", fakeFetch([raw("GM")]), now);
    expect(p.best).toBe("Bb3");
    expect(p.record.id).toBe("lichess:abc");
  });
  it("skips old games and players who aren't grandmasters", async () => {
    await expect(fetchGmPuzzle("2026-11-01", fakeFetch([raw("GM", now - 400 * 86_400_000)]), now)).rejects.toThrow();
    await expect(fetchGmPuzzle("2026-11-01", fakeFetch([raw("IM")]), now)).rejects.toThrow();
  });
});

describe("cache", () => {
  it("keeps today's puzzle only for today", () => {
    const data: Record<string, string> = {};
    const s = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    const p = puzzleFromGame(record(evalsWithBlunder() as GameRecord["evals"]), "w", "2026-11-01")!;
    saveCachedGm("2026-11-01", p, s);
    expect(loadCachedGm("2026-11-01", s)?.id).toBe(p.id);
    expect(loadCachedGm("2026-11-02", s)).toBeNull();
    expect(loadCachedGm("2026-11-01", { getItem: () => "{bad" })).toBeNull();
  });
});
