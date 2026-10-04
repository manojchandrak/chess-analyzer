import { describe, expect, it } from "vitest";
import { buildHash, isShareable, parseHash } from "../route";

describe("parseHash", () => {
  it("defaults to the My games tab", () => {
    expect(parseHash("")).toEqual({ tab: "mine" });
    expect(parseHash("#/nonsense")).toEqual({ tab: "mine" });
  });
  it("reads a legend", () => expect(parseHash("#/legends/morphy")).toEqual({ tab: "legends", legend: "morphy" }));
  it("reads usernames and a game with a move", () => {
    expect(parseHash("#/mine?lichess=DrN&chesscom=mc&g=lichess:abc123&ply=14")).toEqual({ tab: "mine", lichess: "DrN", chesscom: "mc", game: "lichess:abc123", ply: 14 });
  });
  it("ignores a ply without a game, and bad plies", () => {
    expect(parseHash("#/mine?ply=5").ply).toBeUndefined();
    expect(parseHash("#/mine?g=x&ply=abc").ply).toBeUndefined();
    expect(parseHash("#/mine?g=x&ply=-3").ply).toBeUndefined();
  });
});

describe("buildHash", () => {
  it("round-trips", () => {
    for (const route of [{ tab: "pgn" as const }, { tab: "legends" as const, legend: "capablanca", game: "capablanca-12", ply: 9 }, { tab: "mine" as const, lichess: "a b", game: "lichess:xyz" }]) {
      expect(parseHash(buildHash(route))).toEqual(route);
    }
  });
  it("only writes the legend on the legends tab", () => expect(buildHash({ tab: "mine", legend: "tal" })).toBe("#/mine"));
});

describe("isShareable", () => {
  it("accepts Lichess and legend game ids only", () => {
    expect(isShareable("lichess:abc")).toBe(true);
    expect(isShareable("morphy-12")).toBe(true);
    expect(isShareable("chesscom:123")).toBe(false);
    expect(isShareable(null)).toBe(false);
  });
});
