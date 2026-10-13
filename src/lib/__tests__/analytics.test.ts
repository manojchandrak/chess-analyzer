import { describe, expect, it } from "vitest";
import { analyticsAvailable, pagePathFor, readConsent, setConsent, validMeasurementId } from "../analytics";

describe("validMeasurementId", () => {
  it("accepts a GA4 id and ignores anything else", () => {
    expect(validMeasurementId("G-ABC123XYZ9")).toBe("G-ABC123XYZ9");
    expect(validMeasurementId("  G-ABC123XYZ9 ")).toBe("G-ABC123XYZ9");
    expect(validMeasurementId("UA-12345-1")).toBeNull();
    expect(validMeasurementId("G-")).toBeNull();
    expect(validMeasurementId("g-abc123")).toBeNull();
    expect(validMeasurementId("")).toBeNull();
    expect(validMeasurementId(undefined)).toBeNull();
  });
  it("is off when no id is configured", () => expect(analyticsAvailable).toBe(false));
});

describe("pagePathFor", () => {
  it("reports only the tab, never usernames, games or thread ids", () => {
    expect(pagePathFor("#/mine?lichess=DrNykterstein&chesscom=magnus&g=lichess:abc123&ply=14")).toBe("/mine");
    expect(pagePathFor("#/legends/morphy")).toBe("/legends");
    expect(pagePathFor("#/forum/9f1c-thread-id")).toBe("/forum");
    expect(pagePathFor("#/privacy")).toBe("/privacy");
    expect(pagePathFor("")).toBe("/mine");
  });
});

describe("consent", () => {
  const store = (initial?: string) => {
    const data = new Map<string, string>(initial ? [["chess-analyzer:analytics-consent", initial]] : []);
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  it("remembers a yes or no, and treats anything else as not asked", () => {
    expect(readConsent(store())).toBeNull();
    expect(readConsent(store("granted"))).toBe("granted");
    expect(readConsent(store("denied"))).toBe("denied");
    expect(readConsent(store("maybe"))).toBeNull();
    const s = store();
    setConsent("denied", s);
    expect(readConsent(s)).toBe("denied");
  });
  it("copes with storage that throws", () => {
    expect(
      readConsent({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
  });
});
