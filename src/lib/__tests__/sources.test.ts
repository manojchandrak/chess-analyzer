import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, lichessRecord } from "../sources";

const lichess = (over: Record<string, unknown> = {}) => ({
  id: "abc123", variant: "standard", speed: "blitz", createdAt: Date.UTC(2024, 4, 14), status: "mate",
  players: { white: { user: { name: "Alice" }, rating: 1800 }, black: { user: { name: "Bob" }, rating: 1750 } },
  winner: "white", opening: { eco: "C20", name: "King's Pawn Game", ply: 2 }, moves: "e4 e5 Qh5", clocks: [18000, 18000, 17900],
  clock: { initial: 180, increment: 0 }, analysis: [{ eval: 20 }, { eval: -10 }, { mate: 3, best: "d1h5" }], ...over,
});

describe("lichessRecord", () => {
  it("maps a Lichess game and works out which side the user played", () => {
    const r = lichessRecord(lichess() as never, "bob");
    expect(r).toMatchObject({ id: "lichess:abc123", white: "Alice", black: "Bob", result: "1-0", date: "2024-05-14", timeClass: "blitz", termination: "mate", playerColor: "b", clockInitial: 180, openingPly: 2 });
    expect(r?.clocks).toEqual([180, 180, 179]);
    expect(r?.evals?.[2]).toEqual({ cp: null, mate: 3, best: "d1h5" });
  });
  it("skips variants, setups, aborted games and games without moves", () => {
    expect(lichessRecord(lichess({ variant: "chess960" }) as never, "bob")).toBeNull();
    expect(lichessRecord(lichess({ initialFen: "8/8/8/8/8/8/8/8 w - - 0 1" }) as never, "bob")).toBeNull();
    expect(lichessRecord(lichess({ status: "aborted" }) as never, "bob")).toBeNull();
    expect(lichessRecord(lichess({ moves: "" }) as never, "bob")).toBeNull();
  });
  it("records draws and names engine opponents", () => {
    const r = lichessRecord(lichess({ winner: undefined, status: "draw", players: { white: { user: { name: "Alice" } }, black: { aiLevel: 3 } } }) as never, "alice");
    expect(r).toMatchObject({ result: "1/2-1/2", termination: "draw", black: "Stockfish level 3", playerColor: "w" });
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries after a 429 and returns the next good response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.test/x");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt and returns that response", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 429, headers: { "Retry-After": "0" } })));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.test/x", undefined, 3);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry client errors like 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchWithRetry("https://example.test/x")).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
