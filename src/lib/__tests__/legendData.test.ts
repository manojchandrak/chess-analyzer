import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLegendGames, parseLegendGameId, withMoves } from "../legendData";
import { MOVES_CHUNK, type LegendIndexEntry } from "../legends";
import { gameLength, type GameRecord } from "../games";

const entry = { id: "tal", name: "Mikhail Tal" } as LegendIndexEntry;
const row = (plies: number, color: "w" | "b" = "w") => ["Tal, M", "Opp", "1-0", "1960", "Event", "B97", 2700, 2600, plies, 0, color];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("legend data", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists games without moves, keeping their length", async () => {
    fetchMock.mockResolvedValueOnce(json([row(40), row(63, "b")]));
    const games = await loadLegendGames({ ...entry, id: "tal1" });
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ id: "tal1-0", source: "legend", moves: "", plies: 40, playerColor: "w", white: "Tal, M" });
    expect(games[1].playerColor).toBe("b");
    expect(gameLength(games[1])).toBe(63);
  });

  it("fetches a game's moves from its chunk once and caches the chunk", async () => {
    const chunk0 = Array.from({ length: MOVES_CHUNK }, (_, i) => `m${i}`);
    fetchMock.mockResolvedValue(json(chunk0));
    const g = (index: number) => ({ id: `fischer-${index}`, source: "legend", moves: "" }) as GameRecord;
    expect((await withMoves(g(3))).moves).toBe("m3");
    expect((await withMoves(g(7))).moves).toBe("m7");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("legends/fischer.m0.json");
  });

  it("uses the right chunk for later games", async () => {
    fetchMock.mockResolvedValue(json(["only"]));
    const out = await withMoves({ id: `lasker-${MOVES_CHUNK * 2}`, source: "legend", moves: "" } as GameRecord);
    expect(out.moves).toBe("only");
    expect(fetchMock.mock.calls[0][0]).toContain("legends/lasker.m2.json");
  });

  it("leaves other games alone and reports a failed download", async () => {
    const own = { id: "lichess:x", source: "lichess", moves: "e4" } as GameRecord;
    expect(await withMoves(own)).toBe(own);
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(withMoves({ id: "karpov-1", source: "legend", moves: "" } as GameRecord)).rejects.toThrow(/HTTP 404/);
    // a failed chunk isn't cached: the next try goes to the network again
    fetchMock.mockResolvedValueOnce(json(["a", "b"]));
    expect((await withMoves({ id: "karpov-1", source: "legend", moves: "" } as GameRecord)).moves).toBe("b");
  });
});

describe("parseLegendGameId", () => {
  it("splits ids", () => {
    expect(parseLegendGameId("morphy-12")).toEqual({ legendId: "morphy", index: 12 });
    expect(parseLegendGameId("lichess:abc")).toBeNull();
  });
});
