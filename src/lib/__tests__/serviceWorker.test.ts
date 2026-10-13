import { describe, expect, it } from "vitest";
import source from "../../../public/sw.js?raw";

// The worker's routing rules, loaded from the real file (it exports them when it isn't running as a worker).
const mod: { exports: { strategyFor: (r: unknown) => string; cacheable: (res: unknown) => boolean } } = { exports: {} as never };
new Function("module", source)(mod);
const { strategyFor, cacheable } = mod.exports;

const ORIGIN = "https://manojchandrak.github.io";
const SCOPE = "/chess-analyzer/";
const req = (path: string, over: Record<string, unknown> = {}) => strategyFor({ url: new URL(ORIGIN + path), method: "GET", mode: "no-cors", origin: ORIGIN, scope: SCOPE, ...over });

describe("service worker routing", () => {
  it("answers the page network-first, so updates arrive", () => {
    expect(req("/chess-analyzer/", { mode: "navigate" })).toBe("navigation");
    expect(req("/chess-analyzer/?fresh=1", { mode: "navigate" })).toBe("navigation");
  });

  it("keeps the app's own scripts, the engine and piece images, which never change under one name", () => {
    expect(req("/chess-analyzer/assets/index-DyJsySov.js")).toBe("cache-first");
    expect(req("/chess-analyzer/engine/stockfish-19-lite-single.wasm")).toBe("cache-first");
    expect(req("/chess-analyzer/pieces/cburnett/wK.svg")).toBe("cache-first");
  });

  it("refreshes data and icons in the background", () => {
    expect(req("/chess-analyzer/legends/morphy.json")).toBe("stale-while-revalidate");
    expect(req("/chess-analyzer/openings.json")).toBe("stale-while-revalidate");
    expect(req("/chess-analyzer/manifest.webmanifest")).toBe("stale-while-revalidate");
    expect(req("/chess-analyzer/icon-192.png")).toBe("stale-while-revalidate");
  });

  it("never touches other sites, so Lichess, Chess.com and Supabase always use the network", () => {
    const other = (u: string) => strategyFor({ url: new URL(u), method: "GET", mode: "cors", origin: ORIGIN, scope: SCOPE });
    expect(other("https://lichess.org/api/games/user/DrNykterstein")).toBe("network");
    expect(other("https://api.chess.com/pub/player/magnuscarlsen/games/archives")).toBe("network");
    expect(other("https://cwpgmjhoedjsboocqswe.supabase.co/auth/v1/token")).toBe("network");
    expect(other("https://www.googletagmanager.com/gtag/js?id=G-XXXX")).toBe("network");
  });

  it("only ever caches reads, and leaves the worker file and other sites' paths alone", () => {
    expect(req("/chess-analyzer/assets/x.js", { method: "POST" })).toBe("network");
    expect(req("/chess-analyzer/sw.js")).toBe("network");
    expect(req("/other-project/assets/x.js")).toBe("network");
  });

  it("keeps only complete answers from this site", () => {
    expect(cacheable({ status: 200, type: "basic" })).toBe(true);
    expect(cacheable({ status: 404, type: "basic" })).toBe(false);
    expect(cacheable({ status: 206, type: "basic" })).toBe(false);
    expect(cacheable({ status: 200, type: "opaque" })).toBe(false);
    expect(cacheable(null)).toBe(false);
  });
});
