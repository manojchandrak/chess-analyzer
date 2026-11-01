// A daily puzzle from a recent grandmaster game on Lichess. Lichess has already analysed these games with its
// engine, so a puzzle is a moment where the opponent slipped and the grandmaster found the strong reply: you
// are shown the position and asked for that move. The same game is used for everyone on a given day.
import { Chess } from "chess.js";
import type { GameRecord } from "./games.ts";
import { lichessRecord } from "./sources.ts";

const CACHE_KEY = "chess-analyzer:gm-puzzle";
const MAX_AGE_DAYS = 120;
const FALLBACK_ACCOUNTS = ["DrNykterstein", "nihalsarin2004"];
const MATE = 10000;

export interface GmPuzzle {
  id: string;
  /** Position before the grandmaster's move, the grandmaster to move. */
  fen: string;
  color: "w" | "b";
  /** The grandmaster's move, in SAN. */
  best: string;
  /** Index of that move in the game (0 = White's first move). */
  ply: number;
  record: GameRecord;
  gm: string;
  opponent: string;
}

type Evals = NonNullable<GameRecord["evals"]>;

/** An evaluation from White's point of view as one number: centipawns, or a large value for a forced mate. */
export function evalValue(e: Evals[number] | undefined): number {
  if (!e) return 0;
  if (e.mate != null && e.mate !== 0) return Math.sign(e.mate) * (MATE - Math.abs(e.mate));
  return e.cp ?? 0;
}

interface Candidate {
  ply: number;
  score: number;
}

/** Moments where the opponent just slipped and the grandmaster's reply kept (or finished) the win. Best first. */
export function findCandidates(evals: Evals, gmColor: "w" | "b"): Candidate[] {
  const sign = gmColor === "w" ? 1 : -1;
  const g = (i: number) => sign * evalValue(evals[i]);
  const out: Candidate[] = [];
  for (let p = 10; p < evals.length; p++) {
    if ((p % 2 === 0 ? "w" : "b") !== gmColor) continue;
    const gap = g(p - 1) - g(p - 2);
    const mate = evals[p].mate;
    const mateByGm = mate != null && mate !== 0 && sign * mate > 0 && Math.abs(mate) <= 4;
    const alreadyMating = (evals[p - 1].mate ?? 0) !== 0 && sign * (evals[p - 1].mate ?? 0) > 0 && Math.abs(evals[p - 1].mate ?? 0) <= Math.abs(mate ?? 0) + 1;
    if (mateByGm && !alreadyMating && g(p - 2) < MATE / 2) {
      out.push({ ply: p, score: 3000 + gap });
    } else if (gap >= 150 && g(p - 2) <= 150 && g(p) >= g(p - 1) - 40 && g(p) >= 250 && g(p) < MATE / 2) {
      out.push({ ply: p, score: gap });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** A small number from a string, so the same day always makes the same choice. */
export function hashOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The puzzle a game offers on a given day, or null if it has no suitable moment. */
export function puzzleFromGame(record: GameRecord, gmColor: "w" | "b", day: string): GmPuzzle | null {
  if (!record.evals) return null;
  const top = findCandidates(record.evals, gmColor).slice(0, 5);
  if (top.length === 0) return null;
  const { ply } = top[hashOf(`${day}${record.id}`) % top.length];
  const sans = record.moves.split(/\s+/).filter(Boolean);
  if (sans.length <= ply) return null;
  try {
    const chess = new Chess();
    for (const san of sans.slice(0, ply)) chess.move(san);
    const fen = chess.fen();
    const best = chess.move(sans[ply]).san;
    return {
      id: `${record.id}#${ply}`,
      fen,
      color: gmColor,
      best,
      ply,
      record,
      gm: gmColor === "w" ? record.white : record.black,
      opponent: gmColor === "w" ? record.black : record.white,
    };
  } catch {
    return null;
  }
}

type RawGame = Parameters<typeof lichessRecord>[0] & { players: { white: { user?: { name: string; title?: string } }; black: { user?: { name: string; title?: string } } } };

/** Grandmasters at the top of Lichess's blitz, rapid and classical leaderboards. */
async function leaderboardGms(fetchImpl: typeof fetch): Promise<string[]> {
  const names: string[] = [];
  const results = await Promise.allSettled(
    ["blitz", "rapid", "classical"].map(async (perf) => {
      const res = await fetchImpl(`https://lichess.org/api/player/top/20/${perf}`, { headers: { Accept: "application/vnd.lichess.v3+json" } });
      if (!res.ok) throw new Error(String(res.status));
      return ((await res.json()) as { users?: { username: string; title?: string }[] }).users ?? [];
    }),
  );
  for (const r of results) if (r.status === "fulfilled") for (const u of r.value) if (u.title === "GM" && !names.includes(u.username)) names.push(u.username);
  return names.length > 0 ? names : FALLBACK_ACCOUNTS;
}

async function recentAnalysedGames(user: string, fetchImpl: typeof fetch): Promise<RawGame[]> {
  const params = new URLSearchParams({ max: "20", analysed: "true", evals: "true", moves: "true", rated: "true", perfType: "blitz,rapid,classical" });
  const res = await fetchImpl(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`, { headers: { Accept: "application/x-ndjson" } });
  if (!res.ok) return [];
  const games: RawGame[] = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      games.push(JSON.parse(line) as RawGame);
    } catch {
      // skip a bad line
    }
  }
  return games;
}

/** Today's grandmaster puzzle. Tries a few grandmasters (a different one first each day) until one has a recent analysed game with a suitable moment. */
export async function fetchGmPuzzle(day: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<GmPuzzle> {
  const gms = await leaderboardGms(fetchImpl);
  const start = hashOf(day) % gms.length;
  for (let i = 0; i < Math.min(4, gms.length); i++) {
    const user = gms[(start + i) % gms.length];
    for (const raw of await recentAnalysedGames(user, fetchImpl)) {
      if (now - raw.createdAt > MAX_AGE_DAYS * 86_400_000) continue;
      const white = raw.players.white.user;
      const black = raw.players.black.user;
      const color = white?.name.toLowerCase() === user.toLowerCase() ? "w" : "b";
      if ((color === "w" ? white : black)?.title !== "GM") continue;
      const record = lichessRecord(raw, user);
      const puzzle = record ? puzzleFromGame(record, color, day) : null;
      if (puzzle) return puzzle;
    }
  }
  throw new Error("No recent grandmaster game was available");
}

/** Today's puzzle is kept for the day, so reloading doesn't search again (and the puzzle can't change under you). */
export function loadCachedGm(day: string, storage: Pick<Storage, "getItem"> = window.localStorage): GmPuzzle | null {
  try {
    const saved = JSON.parse(storage.getItem(CACHE_KEY) ?? "null") as { day?: string; puzzle?: GmPuzzle } | null;
    const p = saved?.puzzle;
    return saved?.day === day && p && typeof p.fen === "string" && typeof p.best === "string" && p.record ? p : null;
  } catch {
    return null;
  }
}

export function saveCachedGm(day: string, puzzle: GmPuzzle, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ day, puzzle }));
  } catch {
    // not remembered; fine
  }
}
