import { describe, expect, it } from "vitest";
import { checkProfile, ownershipCode } from "../ownership";
import { isVerified, markVerified, readUsernames, saveUsernames, USERNAMES_KEY } from "../usernames";

function memory(initial?: unknown) {
  const data: Record<string, string> = initial === undefined ? {} : { [USERNAMES_KEY]: typeof initial === "string" ? initial : JSON.stringify(initial) };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe("readUsernames", () => {
  it("reads old two-field records and new ones with verified names", () => {
    expect(readUsernames(memory({ lichess: "a", chesscom: "b" }))).toEqual({ lichess: "a", chesscom: "b", verified: {} });
    expect(readUsernames(memory({ lichess: "a", chesscom: "", verified: { lichess: "a", chesscom: 5 } }))).toEqual({ lichess: "a", chesscom: "", verified: { lichess: "a" } });
  });
  it("copes with nothing or damage", () => {
    expect(readUsernames(memory())).toEqual({ lichess: "", chesscom: "", verified: {} });
    expect(readUsernames(memory("{bad"))).toEqual({ lichess: "", chesscom: "", verified: {} });
  });
});

describe("saveUsernames", () => {
  it("saves everything when signed out", () => {
    const s = memory();
    saveUsernames({ lichess: "Friend", chesscom: "" }, false, s);
    expect(readUsernames(s).lichess).toBe("Friend");
  });
  it("signed in, keeps the verified name and ignores someone else's", () => {
    const s = memory({ lichess: "Me", chesscom: "", verified: { lichess: "Me" } });
    saveUsernames({ lichess: "Stranger", chesscom: "" }, true, s);
    expect(readUsernames(s)).toEqual({ lichess: "Me", chesscom: "", verified: { lichess: "Me" } });
    saveUsernames({ lichess: "me", chesscom: "" }, true, s);
    expect(readUsernames(s).lichess).toBe("Me");
  });
  it("signed in with nothing verified, saves no unverified name", () => {
    const s = memory();
    saveUsernames({ lichess: "Stranger", chesscom: "Other" }, true, s);
    expect(readUsernames(s)).toEqual({ lichess: "", chesscom: "", verified: {} });
  });
  it("never drops the verified record when saving", () => {
    const s = memory({ lichess: "Me", chesscom: "", verified: { lichess: "Me" } });
    saveUsernames({ lichess: "Me", chesscom: "New" }, false, s);
    expect(readUsernames(s).verified).toEqual({ lichess: "Me" });
  });
});

describe("markVerified", () => {
  it("verifies a name and makes it the saved one", () => {
    const s = memory({ lichess: "x", chesscom: "keep" });
    const saved = markVerified("lichess", "Me", s);
    expect(saved).toEqual({ lichess: "Me", chesscom: "keep", verified: { lichess: "Me" } });
    expect(isVerified(readUsernames(s), "lichess", "ME")).toBe(true);
    expect(isVerified(readUsernames(s), "chesscom", "keep")).toBe(false);
  });
});

describe("ownershipCode", () => {
  it("is stable and specific to the login, the site and the username", () => {
    const a = ownershipCode("user-1", "lichess", "Magnus");
    expect(a).toMatch(/^mca-[0-9a-f]{16}$/);
    expect(ownershipCode("user-1", "lichess", " magnus ")).toBe(a);
    expect(ownershipCode("user-2", "lichess", "Magnus")).not.toBe(a);
    expect(ownershipCode("user-1", "chesscom", "Magnus")).not.toBe(a);
    expect(ownershipCode("user-1", "lichess", "Other")).not.toBe(a);
  });
});

describe("checkProfile", () => {
  const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("finds the code in a Lichess bio, ignoring case", async () => {
    expect(await checkProfile("lichess", "Me", "mca-abc", reply(200, { profile: { bio: "hello MCA-ABC there" } }))).toBe("found");
    expect(await checkProfile("lichess", "Me", "mca-abc", reply(200, { profile: { bio: "hello" } }))).toBe("missing");
    expect(await checkProfile("lichess", "Me", "mca-abc", reply(200, {}))).toBe("missing");
  });
  it("finds the code in a Chess.com location", async () => {
    expect(await checkProfile("chesscom", "Me", "mca-abc", reply(200, { location: "mca-abc" }))).toBe("found");
    expect(await checkProfile("chesscom", "Me", "mca-abc", reply(200, { profile: { bio: "mca-abc" } }))).toBe("missing");
  });
  it("tells a missing user and a failed lookup apart", async () => {
    expect(await checkProfile("lichess", "Nobody", "x", reply(404))).toBe("no-user");
    expect(await checkProfile("lichess", "Me", "x", reply(500))).toBe("error");
    expect(await checkProfile("lichess", "Me", "x", (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBe("error");
  });
});
