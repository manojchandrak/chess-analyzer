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
  analysis?: { eval?: number; mate?: number }[];
  initialFen?: string;
}

const LICHESS_TERMINATION: Record<string, Termination> = { mate: "mate", resign: "resign", outoftime: "timeout", draw: "draw", stalemate: "draw" };
const LICHESS_SPEED: Record<string, TimeClass> = { ultraBullet: "bullet", bullet: "bullet", blitz: "blitz", rapid: "rapid", classical: "classical", correspondence: "daily" };

export async function fetchLichessGames(username: string, max: number, onProgress?: Progress): Promise<GameRecord[]> {
  const user = username.trim();
  const params = new URLSearchParams({ max: String(max), moves: "true", opening: "true", clocks: "true", evals: "true", perfType: "ultraBullet,bullet,blitz,rapid,classical,correspondence" });
  onProgress?.(`Lichess: requesting ${user}'s last ${max} games…`);
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`, { headers: { Accept: "application/x-ndjson" } });
  if (res.status === 404) throw new Error(`Lichess user "${user}" not found.`);
  if (res.status === 429) throw new Error("Lichess is rate-limiting requests right now. Wait a minute and try again.");
  if (!res.ok) throw new Error(`Lichess returned HTTP ${res.status}.`);

  const games: GameRecord[] = [];
  const text = await res.text();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as LichessGame;
    if (g.variant !== "standard" || g.initialFen || !g.moves) continue;
    const termination = LICHESS_TERMINATION[g.status] ?? "other";
    if (["aborted", "noStart", "unknownFinish"].includes(g.status)) continue;
    const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2";
    const white = g.players.white.user?.name ?? (g.players.white.aiLevel ? `Stockfish level ${g.players.white.aiLevel}` : "Anonymous");
    const black = g.players.black.user?.name ?? (g.players.black.aiLevel ? `Stockfish level ${g.players.black.aiLevel}` : "Anonymous");
    games.push({
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
      evals: g.analysis ? g.analysis.map((a) => ({ cp: a.eval ?? null, mate: a.mate ?? null })) : null,
      moves: g.moves,
      playerColor: white.toLowerCase() === user.toLowerCase() ? "w" : black.toLowerCase() === user.toLowerCase() ? "b" : null,
    });
  }
  games.splice(max);
  onProgress?.(`Lichess: ${games.length} games loaded.`);
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

export async function fetchChessComGames(username: string, max: number, onProgress?: Progress): Promise<GameRecord[]> {
  const user = username.trim().toLowerCase();
  onProgress?.(`Chess.com: finding ${user}'s monthly archives…`);
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  if (res.status === 404) throw new Error(`Chess.com user "${username.trim()}" not found.`);
  if (!res.ok) throw new Error(`Chess.com returned HTTP ${res.status}.`);
  const { archives } = (await res.json()) as { archives: string[] };

  const games: GameRecord[] = [];
  for (const archive of [...archives].reverse()) {
    if (games.length >= max) break;
    onProgress?.(`Chess.com: reading ${archive.split("/").slice(-2).join("-")} (${games.length}/${max} games so far)…`);
    const month = await fetch(archive);
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
  onProgress?.(`Chess.com: ${games.length} games loaded.`);
  return games;
}
