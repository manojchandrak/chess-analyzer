import { describe, expect, it } from "vitest";
import { isMine, markMine, readUsernames, saveUsernames, USERNAMES_KEY } from "../usernames";

function memory(initial?: unknown) {
  const data: Record<string, string> = initial === undefined ? {} : { [USERNAMES_KEY]: typeof initial === "string" ? initial : JSON.stringify(initial) };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe("readUsernames", () => {
  it("reads old two-field records and new ones with mine names", () => {
    expect(readUsernames(memory({ lichess: "a", chesscom: "b" }))).toEqual({ lichess: "a", chesscom: "b", mine: {} });
    expect(readUsernames(memory({ lichess: "a", chesscom: "", mine: { lichess: "a", chesscom: 5 } }))).toEqual({ lichess: "a", chesscom: "", mine: { lichess: "a" } });
  });
  it("copes with nothing or damage", () => {
    expect(readUsernames(memory())).toEqual({ lichess: "", chesscom: "", mine: {} });
    expect(readUsernames(memory("{bad"))).toEqual({ lichess: "", chesscom: "", mine: {} });
  });
});

describe("saveUsernames", () => {
  it("saves everything when signed out", () => {
    const s = memory();
    saveUsernames({ lichess: "Friend", chesscom: "" }, false, s);
    expect(readUsernames(s).lichess).toBe("Friend");
  });
  it("signed in, keeps the mine name and ignores someone else's", () => {
    const s = memory({ lichess: "Me", chesscom: "", mine: { lichess: "Me" } });
    saveUsernames({ lichess: "Stranger", chesscom: "" }, true, s);
    expect(readUsernames(s)).toEqual({ lichess: "Me", chesscom: "", mine: { lichess: "Me" } });
    saveUsernames({ lichess: "me", chesscom: "" }, true, s);
    expect(readUsernames(s).lichess).toBe("Me");
  });
  it("signed in with nothing mine, saves no unverified name", () => {
    const s = memory();
    saveUsernames({ lichess: "Stranger", chesscom: "Other" }, true, s);
    expect(readUsernames(s)).toEqual({ lichess: "", chesscom: "", mine: {} });
  });
  it("never drops the mine record when saving", () => {
    const s = memory({ lichess: "Me", chesscom: "", mine: { lichess: "Me" } });
    saveUsernames({ lichess: "Me", chesscom: "New" }, false, s);
    expect(readUsernames(s).mine).toEqual({ lichess: "Me" });
  });
});

describe("markMine", () => {
  it("marks a name as yours and makes it the saved one", () => {
    const s = memory({ lichess: "x", chesscom: "keep" });
    const saved = markMine("lichess", "Me", s);
    expect(saved).toEqual({ lichess: "Me", chesscom: "keep", mine: { lichess: "Me" } });
    expect(isMine(readUsernames(s), "lichess", "ME")).toBe(true);
    expect(isMine(readUsernames(s), "chesscom", "keep")).toBe(false);
  });
});

