import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, base64url, challengeFor, CLIENT_ID, finishLichessLogin, readCallback, redirectUri } from "../lichessAuth";

function stubSession(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] });
  vi.stubGlobal("window", { location: { origin: "https://site.test" } });
  return data;
}

beforeEach(() => stubSession());
afterEach(() => vi.unstubAllGlobals());

describe("PKCE helpers", () => {
  it("encodes bytes as url-safe base64 without padding", () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
  });
  it("derives the challenge from the verifier (the example in RFC 7636)", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("authorizeUrl", () => {
  it("asks Lichess for a code with the challenge, state and our return address", () => {
    const url = new URL(authorizeUrl("CHAL", "STATE", redirectUri("https://site.test", "/")));
    expect(url.origin + url.pathname).toBe("https://lichess.org/oauth");
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: "code", client_id: CLIENT_ID, redirect_uri: "https://site.test/lichess-callback/", code_challenge_method: "S256", code_challenge: "CHAL", state: "STATE" });
  });
});

describe("readCallback", () => {
  it("reads the code and state the callback page passed on", () => {
    expect(readCallback("#/login?lcode=abc&lstate=xyz")).toEqual({ code: "abc", state: "xyz", error: null });
    expect(readCallback("#/login?lerror=access_denied")).toEqual({ code: null, state: null, error: "access_denied" });
  });
  it("is null for ordinary pages", () => {
    expect(readCallback("#/login")).toBeNull();
    expect(readCallback("#/mine?lcode=abc")).toBeNull();
    expect(readCallback("")).toBeNull();
  });
});

describe("finishLichessLogin", () => {
  const pending = { "chess-analyzer:lichess-login": JSON.stringify({ verifier: "VERIFIER", state: "STATE" }) };
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

  it("swaps the code for a token, sending the verifier", async () => {
    stubSession(pending);
    const fetchMock = reply(200, { access_token: "lip_token" });
    expect(await finishLichessLogin({ code: "CODE", state: "STATE", error: null }, fetchMock)).toBe("lip_token");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe("https://lichess.org/api/token");
    expect(init.body.get("code_verifier")).toBe("VERIFIER");
    expect(init.body.get("code")).toBe("CODE");
    expect(init.body.get("redirect_uri")).toBe("https://site.test/lichess-callback/");
  });
  it("refuses a mismatched state or a login nobody started", async () => {
    stubSession(pending);
    await expect(finishLichessLogin({ code: "CODE", state: "OTHER", error: null }, reply(200, { access_token: "x" }))).rejects.toThrow(/expired/);
    stubSession();
    await expect(finishLichessLogin({ code: "CODE", state: "STATE", error: null }, reply(200, { access_token: "x" }))).rejects.toThrow(/expired/);
  });
  it("reports a cancelled login and a rejected code", async () => {
    stubSession(pending);
    await expect(finishLichessLogin({ code: null, state: null, error: "access_denied" }, reply(200, {}))).rejects.toThrow(/cancelled/);
    stubSession(pending);
    await expect(finishLichessLogin({ code: "CODE", state: "STATE", error: null }, reply(400, { error: "invalid_grant" }))).rejects.toThrow(/didn't accept/);
  });
  it("uses a saved login only once", async () => {
    stubSession(pending);
    await finishLichessLogin({ code: "CODE", state: "STATE", error: null }, reply(200, { access_token: "x" }));
    await expect(finishLichessLogin({ code: "CODE", state: "STATE", error: null }, reply(200, { access_token: "x" }))).rejects.toThrow(/expired/);
  });
});
