import { describe, expect, it } from "vitest";
import { classifyMove, formatScore, moveAccuracy, toCentipawns, winPercent } from "../accuracy";

describe("winPercent", () => {
  it("is 50% for an equal position and symmetric around it", () => {
    expect(winPercent(0)).toBeCloseTo(50, 5);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 5);
  });
  it("rises with the evaluation and saturates", () => {
    expect(winPercent(100)).toBeGreaterThan(winPercent(0));
    expect(winPercent(1000)).toBeGreaterThan(95);
    expect(winPercent(100000)).toBeLessThanOrEqual(100);
  });
});

describe("moveAccuracy", () => {
  it("is ~100 when winning chances don't drop", () => {
    expect(moveAccuracy(50, 50)).toBeGreaterThan(99.9);
    expect(moveAccuracy(50, 60)).toBeGreaterThan(99.9); // improving the position isn't penalized
  });
  it("falls as the drop grows and stays within 0-100", () => {
    expect(moveAccuracy(60, 50)).toBeGreaterThan(moveAccuracy(60, 30));
    expect(moveAccuracy(100, 0)).toBeGreaterThanOrEqual(0);
    expect(moveAccuracy(100, 0)).toBeLessThan(10);
  });
});

describe("classifyMove", () => {
  it("uses Lichess's thresholds on the win% drop", () => {
    expect(classifyMove(0)).toBe("best");
    expect(classifyMove(4.9)).toBe("best");
    expect(classifyMove(5)).toBe("inaccuracy");
    expect(classifyMove(10)).toBe("mistake");
    expect(classifyMove(15)).toBe("blunder");
  });
});

describe("toCentipawns and formatScore", () => {
  it("maps mate scores to large values with the right sign, nearer mates larger", () => {
    expect(toCentipawns({ cp: null, mate: 3 })).toBeGreaterThan(90000);
    expect(toCentipawns({ cp: null, mate: -3 })).toBeLessThan(-90000);
    expect(toCentipawns({ cp: null, mate: 1 })).toBeGreaterThan(toCentipawns({ cp: null, mate: 5 }));
    expect(toCentipawns({ cp: 35, mate: null })).toBe(35);
  });
  it("formats scores for display", () => {
    expect(formatScore(130, null)).toBe("+1.3");
    expect(formatScore(-40, null)).toBe("-0.4");
    expect(formatScore(0, null)).toBe("0.0");
    expect(formatScore(null, -4)).toBe("M4");
    expect(formatScore(null, 0)).toBe("#");
  });
});
