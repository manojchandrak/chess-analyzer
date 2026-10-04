// Engine review across many of a player's games: runs (or reuses Lichess's)
// analysis per game, keeps only the player's own moves, and aggregates where
// the mistakes happen: by phase, under time pressure, pieces left hanging, and
// winning positions that weren't converted.
import { Chess } from "chess.js";
import type { MoveQuality } from "./accuracy.ts";
import { analyzeGame, analyzeWithEvals, evalsFromWhitePerspective, type Phase } from "./analyze.ts";
import type { StockfishEngine } from "./engine.ts";
import { ecoFamily } from "./eco.ts";
import { setGameStats, statsFromAnalysis, type GameStats } from "./gameStats.ts";
import { scoreFor, type GameRecord } from "./games.ts";
import { loadOpenings, openingsAlong } from "./openings.ts";
import { parseRecord } from "./pgn.ts";
import { purgeLegacyReviews, storeGet, storeSet } from "./store.ts";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface ReviewedMove {
  ply: number;
  phase: Phase;
  cpLoss: number;
  accuracy: number;
  quality: MoveQuality;
  /** Seconds left on the player's clock before this move, when known. */
  clock: number | null;
  /** Eval before the move from the player's point of view (centipawns, mate saturated). */
  evalBefore: number;
  /** Value of the piece the opponent captured on the very next move (0 if none). */
  lostNext: number;
  /** For mistakes and blunders: the position and the move that should have been played. */
  puzzle?: Puzzle;
}

/** A position from the player's own game where they went wrong, to practice. */
export interface Puzzle {
  /** Position before the mistake, with the player to move. */
  fen: string;
  /** The move that was played (SAN). */
  played: string;
  /** The better move (SAN). */
  best: string;
}

export interface GameReview {
  gameId: string;
  color: "w" | "b";
  score: number;
  family: string | null;
  clockInitial: number | null;
  moves: ReviewedMove[];
  /** "lichess" when the site's own server analysis was used. */
  engine: "lichess" | "stockfish";
  stats: GameStats;
}

// v5 adds puzzles for mistakes. Reviews live in IndexedDB (see store.ts); the old
// localStorage copies (v4 and earlier) are removed so they stop filling its quota.
const CACHE_PREFIX = "review:v5:";
purgeLegacyReviews();

const cached = (key: string) => storeGet<GameReview>(CACHE_PREFIX + key);
const store = (key: string, review: GameReview) => storeSet(CACHE_PREFIX + key, review);

/** UCI ("e2e4", "e7e8q") to SAN in a position, or null if it isn't legal there. */
function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

/** Reviews one game for its profiled player. Uses Lichess's server analysis when
 * the game has it, otherwise Stockfish at `depth`. Results are cached per game. */
export async function reviewGame(game: GameRecord, engine: StockfishEngine | null, depth: number, onProgress?: (done: number, total: number) => void): Promise<GameReview | null> {
  const color = game.playerColor;
  const score = color ? scoreFor(game.result, color) : null;
  if (!color || score === null) return null;
  const key = `${game.id}:${game.evals ? "lichess" : depth}`;
  const hit = await cached(key);
  if (hit) {
    setGameStats(hit.gameId, hit.stats);
    return hit;
  }

  if (!game.evals && !engine) return null;
  let parsed;
  try {
    parsed = parseRecord(game);
  } catch {
    return null;
  }
  if (parsed.moves.length < 2) return null;
  const bookPlies = Math.max(game.openingPly ?? 0, openingsAlong(parsed.moves, await loadOpenings()).bookPlies);
  const analysis = game.evals
    ? analyzeWithEvals(parsed, evalsFromWhitePerspective(parsed, game.evals), { bookPlies })
    : await analyzeGame(parsed, engine as StockfishEngine, depth, onProgress, { multiPv: 2, bookPlies });

  const moves: ReviewedMove[] = [];
  analysis.moves.forEach((m, i) => {
    if (m.color !== color) return;
    const next = parsed.moves[i + 1];
    // Clock arrays hold the time left after each ply; before this move the
    // player had what they were left with after their previous move.
    const clockBefore = game.clocks ? (i >= 2 ? game.clocks[i - 2] : game.clockInitial) : null;
    const evalAfterWhite = i > 0 ? analysis.moves[i - 1].evalAfterWhite : 20;
    let puzzle: Puzzle | undefined;
    if (m.quality === "mistake" || m.quality === "blunder") {
      // Stockfish reviews know the better move in SAN; Lichess's analysis gives it as UCI.
      const lichessBest = game.evals?.[i]?.best;
      const best = m.bestSan ?? (lichessBest ? uciToSan(m.fenBefore, lichessBest) : null);
      if (best && best !== m.san) puzzle = { fen: m.fenBefore, played: m.san, best };
    }
    moves.push({
      ply: m.ply,
      phase: m.phase,
      cpLoss: Math.min(m.cpLoss, 2000),
      accuracy: Math.round(m.accuracy * 10) / 10,
      quality: m.quality,
      clock: clockBefore ?? null,
      evalBefore: Math.max(-2000, Math.min(2000, color === "w" ? evalAfterWhite : -evalAfterWhite)),
      lostNext: next?.captured ? VALUE[next.captured] : 0,
      ...(puzzle ? { puzzle } : {}),
    });
  });

  const stats = statsFromAnalysis(analysis, color);
  const review: GameReview = { gameId: game.id, color, score, family: ecoFamily(game.eco), clockInitial: game.clockInitial, moves, engine: game.evals ? "lichess" : "stockfish", stats };
  await store(key, review);
  setGameStats(game.id, stats);
  return review;
}

export interface PhaseSummary {
  moves: number;
  accuracy: number | null;
  blundersPerGame: number;
}

export interface ReviewSummary {
  games: number;
  accuracy: number | null;
  blundersPerGame: number;
  mistakesPerGame: number;
  phases: Record<Phase, PhaseSummary>;
  /** Blunders after which the opponent immediately won a piece (knight or more). */
  hangingBlunders: number;
  blunders: number;
  lowClock: { moves: number; blunderRate: number } | null;
  normalClock: { moves: number; blunderRate: number } | null;
  /** Games where the player was +3 or better after move 10 and still didn't win. */
  missedWins: number;
  /** Games where the player reached a winning position at all. */
  winningPositions: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function summarize(reviews: GameReview[]): ReviewSummary {
  const all = reviews.flatMap((r) => r.moves);
  const n = reviews.length || 1;
  const phase = (p: Phase): PhaseSummary => {
    const ms = all.filter((m) => m.phase === p);
    return { moves: ms.length, accuracy: avg(ms.map((m) => m.accuracy)), blundersPerGame: ms.filter((m) => m.quality === "blunder").length / n };
  };
  const blunders = all.filter((m) => m.quality === "blunder");

  // Time pressure: under 10% of the starting clock (at least 15 s) counts as low.
  const timed = reviews.filter((r) => r.clockInitial).flatMap((r) => r.moves.filter((m) => m.clock !== null).map((m) => ({ m, low: (m.clock as number) < Math.max(15, (r.clockInitial as number) * 0.1) })));
  const bucket = (xs: typeof timed) => (xs.length ? { moves: xs.length, blunderRate: xs.filter((x) => x.m.quality === "blunder").length / xs.length } : null);

  const winning = reviews.filter((r) => r.moves.some((m) => m.ply > 20 && m.evalBefore >= 300));
  return {
    games: reviews.length,
    accuracy: avg(all.map((m) => m.accuracy)),
    blundersPerGame: blunders.length / n,
    mistakesPerGame: all.filter((m) => m.quality === "mistake").length / n,
    phases: { opening: phase("opening"), middlegame: phase("middlegame"), endgame: phase("endgame") },
    hangingBlunders: blunders.filter((m) => m.lostNext >= 3).length,
    blunders: blunders.length,
    lowClock: bucket(timed.filter((x) => x.low)),
    normalClock: bucket(timed.filter((x) => !x.low)),
    missedWins: winning.filter((r) => r.score < 1).length,
    winningPositions: winning.length,
  };
}
