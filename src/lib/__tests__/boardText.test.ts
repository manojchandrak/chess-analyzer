import { describe, expect, it } from "vitest";
import { arrowGeometry, describePosition, squareCenter, uciSquares } from "../boardText";

describe("describePosition", () => {
  it("lists each side's pieces and who is to move", () => {
    const text = describePosition("4k3/8/8/8/8/8/PP6/4K2R b - - 0 1");
    expect(text).toBe("White: king e1, rook h1, pawns a2 b2. Black: king e8. Black to move.");
  });
});

describe("squareCenter", () => {
  it("places a1 bottom-left for White and top-right when flipped", () => {
    expect(squareCenter("a1", false)).toEqual({ x: 0.5, y: 7.5 });
    expect(squareCenter("h8", false)).toEqual({ x: 7.5, y: 0.5 });
    expect(squareCenter("a1", true)).toEqual({ x: 7.5, y: 0.5 });
  });
});

describe("arrowGeometry", () => {
  it("points from the start square to the target square", () => {
    const g = arrowGeometry({ from: "e2", to: "e4" }, false);
    expect(g.x1).toBeCloseTo(4.5);
    expect(g.y1).toBeLessThan(6.5); // starts a little past the centre of e2 (y = 6.5), heading up
    expect(g.y2).toBeGreaterThan(g.head.split(" ")[0].split(",").map(Number)[1]); // shaft stops short of the tip
    expect(g.head.split(" ")).toHaveLength(3);
  });
});

describe("uciSquares", () => {
  it("reads UCI moves and rejects junk", () => {
    expect(uciSquares("e7e8q")).toEqual({ from: "e7", to: "e8" });
    expect(uciSquares("(none)")).toBeNull();
  });
});
