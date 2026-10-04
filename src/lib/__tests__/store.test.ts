import { describe, expect, it } from "vitest";
import { reportStorageProblem, storeGet, storeSet } from "../store";

describe("store without IndexedDB (as in Node)", () => {
  it("falls back to memory so a review is still available this visit", async () => {
    await storeSet("k", { a: 1 });
    expect(await storeGet("k")).toEqual({ a: 1 });
    expect(await storeGet("missing")).toBeUndefined();
  });
  it("can report a problem repeatedly without errors", () => {
    expect(() => {
      reportStorageProblem("x");
      reportStorageProblem("x");
    }).not.toThrow();
  });
});
