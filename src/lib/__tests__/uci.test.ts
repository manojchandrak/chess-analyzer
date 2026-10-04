import { describe, expect, it } from "vitest";
import { pvToSan, sanSquares } from "../uci";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("pvToSan", () => {
  it("numbers White and Black moves", () => {
    expect(pvToSan(START, ["e2e4", "e7e5", "g1f3"])).toBe("1. e4 e5 2. Nf3");
  });
  it("starts with an ellipsis when Black is to move", () => {
    expect(pvToSan("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", ["e7e5", "g1f3"])).toBe("1… e5 2. Nf3");
  });
  it("stops at an illegal move and honours the limit", () => {
    expect(pvToSan(START, ["e2e4", "e2e4"])).toBe("1. e4");
    expect(pvToSan(START, ["e2e4", "e7e5", "g1f3"], 2)).toBe("1. e4 e5");
  });
});

describe("sanSquares", () => {
  it("finds the squares of a legal move", () => {
    expect(sanSquares(START, "Nf3")).toEqual({ from: "g1", to: "f3" });
    expect(sanSquares(START, "Qh5")).toBeNull();
  });
});
