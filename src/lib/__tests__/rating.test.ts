import { describe, expect, it } from "vitest";
import { estimateRating } from "../rating";

describe("estimateRating", () => {
  it("hits the anchor points", () => {
    expect(estimateRating(0)).toBe(3000);
    expect(estimateRating(55)).toBe(1800);
    expect(estimateRating(350)).toBe(550);
  });
  it("interpolates between anchors", () => {
    expect(estimateRating(62.5)).toBe(1725); // halfway between 55 (1800) and 70 (1650)
  });
  it("clamps outside the table and decreases as loss grows", () => {
    expect(estimateRating(-5)).toBe(3000);
    expect(estimateRating(1000)).toBe(550);
    expect(estimateRating(20)).toBeGreaterThan(estimateRating(40));
  });
});

import { ratingConfidence } from "../rating";

describe("ratingConfidence", () => {
  it("trusts longer games more", () => {
    expect(ratingConfidence(10)).toBe("low");
    expect(ratingConfidence(19)).toBe("low");
    expect(ratingConfidence(20)).toBe("medium");
    expect(ratingConfidence(39)).toBe("medium");
    expect(ratingConfidence(40)).toBe("high");
  });
});
