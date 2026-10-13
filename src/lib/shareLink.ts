// A share link that carries the game itself, so any game (a Chess.com game, a pasted PGN, a game you played here) can be
// opened by someone else: "#/mine?d=<game>&ply=14". The game is just the players, result and moves, packed into the link.
// The person who opens it gets the game and runs the Stockfish review on their own device; nothing is stored anywhere.
import { parsePgn, type ParsedGame } from "./pgn.ts";

const VERSION = 1;
const MAX_MOVES = 600;
const MAX_NAME = 60;
const MAX_LINK_PART = 8000;
const RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];
const SAN = /^[A-Za-z0-9=+#-]{2,10}$/;

interface Wire {
  v: number;
  w: string;
  b: string;
  we?: number;
  be?: number;
  r: string;
  m: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(part: string): string {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const clean = (s: string) => s.replace(/[\r\n"\\[\]]/g, " ").trim().slice(0, MAX_NAME);

/** The text to put in a link for this game, or null when the game has no moves or is too long to fit in a link. */
export function encodeSharedGame(game: ParsedGame): string | null {
  if (game.moves.length === 0 || game.moves.length > MAX_MOVES) return null;
  const wire: Wire = { v: VERSION, w: clean(game.white), b: clean(game.black), r: RESULTS.includes(game.result) ? game.result : "*", m: game.moves.map((m) => m.san).join(" ") };
  if (game.whiteElo) wire.we = game.whiteElo;
  if (game.blackElo) wire.be = game.blackElo;
  const part = toBase64Url(JSON.stringify(wire));
  return part.length <= MAX_LINK_PART ? part : null;
}

/** The game a link carries, or null if the link isn't one of ours or its moves aren't a legal game. */
export function decodeSharedGame(part: string): ParsedGame | null {
  if (!/^[A-Za-z0-9_-]+$/.test(part) || part.length > MAX_LINK_PART) return null;
  try {
    const wire = JSON.parse(fromBase64Url(part)) as Partial<Wire>;
    if (wire.v !== VERSION || typeof wire.w !== "string" || typeof wire.b !== "string" || typeof wire.m !== "string") return null;
    const result = typeof wire.r === "string" && RESULTS.includes(wire.r) ? wire.r : "*";
    const sans = wire.m.split(" ").filter(Boolean);
    if (sans.length === 0 || sans.length > MAX_MOVES || !sans.every((s) => SAN.test(s))) return null;
    const elo = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 && n < 4000 ? n : null);
    const movetext = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(" ");
    const tags = [`[White "${clean(wire.w) || "White"}"]`, `[Black "${clean(wire.b) || "Black"}"]`, `[Result "${result}"]`];
    const we = elo(wire.we);
    const be = elo(wire.be);
    if (we) tags.push(`[WhiteElo "${we}"]`);
    if (be) tags.push(`[BlackElo "${be}"]`);
    const game = parsePgn(`${tags.join("\n")}\n\n${movetext} ${result}`);
    return game.moves.length === sans.length ? game : null; // chess.js stops at an illegal move; refuse a game that was cut short
  } catch {
    return null;
  }
}
