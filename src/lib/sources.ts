// Loads a player's recent games from the Lichess and Chess.com public APIs
// (both allow browser requests without a login) into GameRecords.
import { pgnClocks, pgnHeaders, pgnMoveText, timeClassOf, type GameRecord, type Termination, type TimeClass } from "./games.ts";

export type Progress = (message: string) => void;

// ---------- Lichess ----------

interface LichessPlayer {
  user?: { name: string };
  aiLevel?: number;
  rating?: number;
}

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  createdAt: number;
  status: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  winner?: "white" | "black";
  opening?: { eco: string; name: string; ply?: number };
  moves: string;
  clocks?: number[];
  clock?: { initial: number; increment: number };
  analysis?: { eval?: number; mate?: number; best?: string }[];
  initialFen?: string;
}

const LICHESS_TERMINATION: Record<string, Termination> = { mate: "mate", resign: "resign", outoftime: "timeout", draw: "draw", stalemate: "draw" };
const LICHESS_SPEED: Record<string, TimeClass> = { ultraBullet: "bullet", bullet: "bullet", blitz: "blitz", rapid: "rapid", classical: "classical", correspondence: "daily" };

/** Turns one Lichess NDJSON game into a record (null for variants, aborted games…). */
export function lichessRecord(g: LichessGame, user: string): GameRecord | null {
  if (g.variant !== "standard" || g.initialFen || !g.moves) return null;
  if (["aborted", "noStart", "unknownFinish"].includes(g.status)) return null;
  const termination = LICHESS_TERMINATION[g.status] ?? "other";
  const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2";
  const white = g.players.white.user?.name ?? (g.players.white.aiLevel ? `Stockfish level ${g.players.white.aiLevel}` : "Anonymous");
  const black = g.players.black.user?.name ?? (g.players.black.aiLevel ? `Stockfish level ${g.players.black.aiLevel}` : "Anonymous");
  return {
    id: `lichess:${g.id}`,
    source: "lichess",
    url: `https://lichess.org/${g.id}`,
    white,
    black,
    whiteElo: g.players.white.rating ?? null,
    blackElo: g.players.black.rating ?? null,
    result,
    date: new Date(g.createdAt).toISOString().slice(0, 10),
    event: `Lichess ${g.speed}`,
    eco: g.opening?.eco ?? null,
    opening: g.opening?.name ?? null,
    openingPly: g.opening?.ply ?? null,
    timeClass: LICHESS_SPEED[g.speed] ?? null,
    termination,
    clockInitial: g.clock?.initial ?? null,
    clocks: g.clocks ? g.clocks.map((c) => c / 100) : null,
    evals: g.analysis ? g.analysis.map((a) => ({ cp: a.eval ?? null, mate: a.mate ?? null, best: a.best ?? null })) : null,
    moves: g.moves,
    playerColor: white.toLowerCase() === user.toLowerCase() ? "w" : black.toLowerCase() === user.toLowerCase() ? "b" : null,
  };
}

/** A player's games, newest first. `max` = Infinity loads every game (Lichess
 * streams roughly 10-20 games a second, so big accounts take minutes). */
export async function fetchLichessGames(username: string, max: number, onProgress?: Progress, signal?: AbortSignal): Promise<GameRecord[]> {
  const user = username.trim();
  const params = new URLSearchParams({ moves: "true", opening: "true", clocks: "true", evals: "true", perfType: "ultraBullet,bullet,blitz,rapid,classical,correspondence" });
  if (Number.isFinite(max)) params.set("max", String(max));
  onProgress?.(`Lichess: requesting ${Number.isFinite(max) ? `${user}'s last ${max}` : `all of ${user}'s`} games…`);
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`, { headers: { Accept: "application/x-ndjson" }, signal });
  if (res.status === 404) throw new Error(`Lichess user "${user}" not found.`);
  if (res.status === 429) throw new Error("Lichess is rate-limiting requests right now. Wait a minute and try again.");
  if (!res.ok || !res.body) throw new Error(`Lichess returned HTTP ${res.status}.`);

  // Read the stream as it arrives so progress can be shown for long exports.
  const games: GameRecord[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (e) {
      if (signal?.aborted) break; // cancelled: keep what arrived
      throw e;
    }
    const { value, done } = chunk;
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      // One malformed line shouldn't throw away a whole export: skip it and keep going.
      let record: GameRecord | null = null;
      try {
        record = lichessRecord(JSON.parse(line) as LichessGame, user);
      } catch {
        continue;
      }
      if (record && games.length < max) games.push(record);
    }
    if (!Number.isFinite(max)) onProgress?.(`Lichess: ${games.length.toLocaleString()} games so far…`);
    if (done) break;
  }
  onProgress?.(`Lichess: ${games.length.toLocaleString()} games loaded.`);
  return games;
}

// ---------- Chess.com ----------

interface ChessComSide {
  username: string;
  rating: number;
  result: string;
}

interface ChessComGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  time_class: string;
  rules: string;
  initial_setup?: string;
  eco?: string;
  white: ChessComSide;
  black: ChessComSide;
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CHESSCOM_DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
const CHESSCOM_LOSS: Record<string, Termination> = { checkmated: "mate", resigned: "resign", timeout: "timeout", abandoned: "other" };

/** "https://www.chess.com/openings/Sicilian-Defense-Alapin-Variation-2...Nf6" → "Sicilian Defense Alapin Variation" */
function chessComOpening(ecoUrl: string | undefined): string | null {
  const slug = ecoUrl?.split("/openings/")[1];
  if (!slug) return null;
  const words: string[] = [];
  for (const w of slug.split("-")) {
    if (/^\d/.test(w)) break;
    words.push(w);
  }
  return words.join(" ") || null;
}

/** fetch() that waits and retries when Chess.com rate-limits (429) or has a brief server error. */
export async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 4): Promise<Response> {
  let res = await fetch(url, { signal });
  for (let i = 1; i < attempts && (res.status === 429 || res.status >= 500); i++) {
    const header = res.headers.get("Retry-After");
    const wait = header !== null && Number.isFinite(Number(header)) ? Number(header) * 1000 : 1000 * 2 ** i;
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, Math.min(wait, 15_000));
      signal?.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("Aborted", "AbortError"))), { once: true });
    });
    res = await fetch(url, { signal });
  }
  return res;
}

export async function fetchChessComGames(username: string, max: number, onProgress?: Progress, signal?: AbortSignal): Promise<GameRecord[]> {
  const user = username.trim().toLowerCase();
  onProgress?.(`Chess.com: finding ${user}'s monthly archives…`);
  const res = await fetchWithRetry(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`, signal);
  if (res.status === 429) throw new Error("Chess.com is rate-limiting requests right now. Wait a minute and try again.");
  if (res.status === 404) throw new Error(`Chess.com user "${username.trim()}" not found.`);
  if (!res.ok) throw new Error(`Chess.com returned HTTP ${res.status}.`);
  const { archives } = (await res.json()) as { archives: string[] };

  const games: GameRecord[] = [];
  const months = [...archives].reverse();
  for (const [i, archive] of months.entries()) {
    if (games.length >= max) break;
    const when = archive.split("/").slice(-2).join("-");
    onProgress?.(
      Number.isFinite(max)
        ? `Chess.com: reading ${when} (${games.length}/${max} games so far)…`
        : `Chess.com: reading ${when}, month ${i + 1} of ${months.length} (${games.length.toLocaleString()} games so far)…`,
    );
    let month: Response;
    try {
      month = await fetchWithRetry(archive, signal);
    } catch (e) {
      if (signal?.aborted) break; // cancelled: keep the months already read
      throw e;
    }
    if (!month.ok) continue;
    const { games: monthGames } = (await month.json()) as { games: ChessComGame[] };
    for (const g of [...monthGames].reverse()) {
      if (games.length >= max) break;
      if (g.rules !== "chess" || !g.pgn || (g.initial_setup && g.initial_setup !== START_FEN)) continue;
      const h = pgnHeaders(g.pgn);
      const result = g.white.result === "win" ? "1-0" : g.black.result === "win" ? "0-1" : CHESSCOM_DRAWS.has(g.white.result) ? "1/2-1/2" : null;
      if (!result) continue;
      const loser = result === "1-0" ? g.black : result === "0-1" ? g.white : null;
      const base = Number(g.time_control.split("+")[0]);
      games.push({
        id: `chesscom:${g.url.split("/").pop()}`,
        source: "chesscom",
        url: g.url,
        white: g.white.username,
        black: g.black.username,
        whiteElo: g.white.rating ?? null,
        blackElo: g.black.rating ?? null,
        result,
        date: new Date(g.end_time * 1000).toISOString().slice(0, 10),
        event: `Chess.com ${g.time_class}`,
        eco: h.ECO ?? null,
        opening: chessComOpening(g.eco ?? h.ECOUrl),
        timeClass: (["bullet", "blitz", "rapid", "daily"].includes(g.time_class) ? g.time_class : timeClassOf(g.time_control)) as TimeClass | null,
        termination: loser ? (CHESSCOM_LOSS[loser.result] ?? "other") : "draw",
        clockInitial: g.time_control.includes("/") || !Number.isFinite(base) ? null : base,
        clocks: pgnClocks(g.pgn),
        evals: null,
        moves: pgnMoveText(g.pgn).join(" "),
        playerColor: g.white.username.toLowerCase() === user ? "w" : g.black.username.toLowerCase() === user ? "b" : null,
      });
    }
  }
  onProgress?.(`Chess.com: ${games.length.toLocaleString()} games loaded.`);
  return games;
}

/** One Lichess game by id (for shared links). It has no "player", so playerColor is null. */
export async function fetchLichessGame(id: string, signal?: AbortSignal): Promise<GameRecord> {
  const params = new URLSearchParams({ moves: "true", opening: "true", clocks: "true", evals: "true" });
  const res = await fetch(`https://lichess.org/game/export/${encodeURIComponent(id)}?${params}`, { headers: { Accept: "application/json" }, signal });
  if (res.status === 404) throw new Error("That Lichess game wasn't found.");
  if (res.status === 429) throw new Error("Lichess is rate-limiting requests right now. Try again in a minute.");
  if (!res.ok) throw new Error(`Lichess returned HTTP ${res.status}.`);
  const record = lichessRecord((await res.json()) as LichessGame, "");
  if (!record) throw new Error("That game can't be shown here (it isn't standard chess).");
  return record;
}
