import { describe, expect, it } from "vitest";
import { archetypeOf, similarity, type Traits } from "../profile";

const traits = (over: Partial<Traits> = {}): Traits => ({ aggression: 50, risk: 50, endgame: 50, solidity: 50, simplification: 50, ...over });

describe("similarity", () => {
  it("is 100 for identical profiles and falls with distance", () => {
    expect(similarity(traits(), traits())).toBe(100);
    expect(similarity(traits(), traits({ aggression: 100 }))).toBeLessThan(similarity(traits(), traits({ aggression: 70 })));
  });
  it("is symmetric and never negative", () => {
    const a = traits({ aggression: 0, risk: 0 });
    const b = traits({ aggression: 100, risk: 100, solidity: 100, endgame: 100, simplification: 100 });
    expect(similarity(a, b)).toBe(similarity(b, a));
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0);
  });
});

describe("archetypeOf", () => {
  it("picks the dominant style, or universal when none stands out", () => {
    expect(archetypeOf(traits({ aggression: 95, risk: 90 })).id).toBe("attacker");
    expect(archetypeOf(traits({ aggression: 10, endgame: 90, simplification: 90, solidity: 40 })).id).toBe("positional");
    expect(archetypeOf(traits({ aggression: 10, solidity: 95 })).id).toBe("solid");
    expect(archetypeOf(traits()).id).toBe("universal");
  });
});
