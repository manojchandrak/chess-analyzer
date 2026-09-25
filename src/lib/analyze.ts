import { Chess } from "chess.js";
import { classifyMove, moveAccuracy, toCentipawns, winPercent, type MoveQuality } from "./accuracy";
import { CLASS_ORDER, classifyMoves, type MoveClass } from "./classify";
import type { EngineEval, StockfishEngine } from "./engine";
import { nonPawnMaterial } from "./material";
import type { ParsedGame, ParsedMove } from "./pgn";
import { estimateRating } from "./rating";

export type Phase = "opening" | "middlegame" | "endgame";

export interface MoveAnalysis extends ParsedMove {
  cpLoss: number;
  accuracy: number;
  quality: MoveQuality;
  phase: Phase;
  /** Position eval after this move, from White's perspective (for charting). */
  evalAfterWhite: number;
  /** Chess.com-style classification. */
  cls: MoveClass;
  /** The engine's preferred move in this position (SAN), when it differs from the one played. */
  bestSan: string | null;
}

export interface PhaseStats {
  moveCount: number;
  accuracy: number | null;
  averageCpLoss: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
}

export interface PlayerStats {
  name: string;
  pgnElo: number | null;
  estimatedRating: number | null;
  overall: PhaseStats;
  opening: PhaseStats;
  middlegame: PhaseStats;
  endgame: PhaseStats;
  classCounts: Record<MoveClass, number>;
}

export interface AnalysisResult {
  white: PlayerStats;
  black: PlayerStats;
  moves: MoveAnalysis[];
  openingEndPly: number;
  endgameStartPly: number | null;
}

const ENDGAME_MATERIAL_THRESHOLD = 14; // combined non-pawn material, both sides

function emptyPhaseStats(): PhaseStats {
  return { moveCount: 0, accuracy: null, averageCpLoss: null, blunders: 0, mistakes: 0, inaccuracies: 0 };
}

function aggregate(moves: MoveAnalysis[]): PhaseStats {
  if (moves.length === 0) return emptyPhaseStats();
  const accuracySum = moves.reduce((sum, m) => sum + m.accuracy, 0);
  const cpLossSum = moves.reduce((sum, m) => sum + m.cpLoss, 0);
  return {
    moveCount: moves.length,
    accuracy: Math.round((accuracySum / moves.length) * 10) / 10,
    averageCpLoss: Math.round((cpLossSum / moves.length) * 10) / 10,
    blunders: moves.filter((m) => m.quality === "blunder").length,
    mistakes: moves.filter((m) => m.quality === "mistake").length,
    inaccuracies: moves.filter((m) => m.quality === "inaccuracy").length,
  };
}

function statsFor(name: string, pgnElo: number | null, moves: MoveAnalysis[]): PlayerStats {
  const overall = aggregate(moves);
  return {
    name,
    pgnElo,
    estimatedRating: overall.averageCpLoss !== null ? estimateRating(overall.averageCpLoss) : null,
    overall,
    opening: aggregate(moves.filter((m) => m.phase === "opening")),
    middlegame: aggregate(moves.filter((m) => m.phase === "middlegame")),
    endgame: aggregate(moves.filter((m) => m.phase === "endgame")),
    classCounts: Object.fromEntries(CLASS_ORDER.map((c) => [c, moves.filter((m) => m.cls === c).length])) as Record<MoveClass, number>,
  };
}

/** Runs a full engine analysis of a parsed game: evaluates every position once,
 * then derives per-move centipawn loss and accuracy (see analyzeWithEvals). */
export async function analyzeGame(
  game: ParsedGame,
  engine: StockfishEngine,
  depth: number,
  onProgress?: (done: number, total: number) => void,
  opts: AnalyzeOptions & { multiPv?: 1 | 2 } = {},
): Promise<AnalysisResult> {
  const fens = [game.moves[0]?.fenBefore ?? standardStartFen(), ...game.moves.map((m) => m.fenAfter)];

  const evals: EngineEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    evals.push(await engine.evaluate(fens[i], depth, { multiPv: opts.multiPv }));
    onProgress?.(i + 1, fens.length);
  }
  return analyzeWithEvals(game, evals, opts);
}

/** Converts Lichess server analysis (White's perspective, one eval after each
 * ply) into side-to-move evals for every position, including the start. */
export function evalsFromWhitePerspective(game: ParsedGame, whiteEvals: { cp: number | null; mate: number | null }[]): EngineEval[] {
  const out: EngineEval[] = [{ cp: 20, mate: null }];
  game.moves.forEach((move, i) => {
    const e = whiteEvals[i];
    const whiteToMove = move.color === "b";
    if (!e) {
      // Lichess leaves out the final position after checkmate: the side to move is mated.
      out.push(move.san.includes("#") ? { cp: null, mate: 0 } : out[out.length - 1]);
      return;
    }
    const sign = whiteToMove ? 1 : -1;
    out.push(e.mate !== null ? { cp: null, mate: e.mate === 0 ? 0 : sign * e.mate } : { cp: sign * (e.cp ?? 0), mate: null });
  });
  return out;
}

/** Per-move centipawn loss, accuracy and phase from one eval per position
 * (side-to-move perspective; evals[0] is the position before the first move). */
export interface AnalyzeOptions {
  /** Plies that are known opening theory (Lichess reports this per game). */
  bookPlies?: number;
}

export function analyzeWithEvals(game: ParsedGame, evals: EngineEval[], opts: AnalyzeOptions = {}): AnalysisResult {
  const openingEndPly = Math.min(20, game.moves.length);
  let endgameStartPly: number | null = null;
  for (const move of game.moves) {
    if (move.ply <= openingEndPly) continue;
    if (nonPawnMaterial(move.fenAfter) <= ENDGAME_MATERIAL_THRESHOLD) {
      endgameStartPly = move.ply;
      break;
    }
  }

  const classes = classifyMoves(game.moves, evals, opts.bookPlies ?? 0);
  const moves: MoveAnalysis[] = game.moves.map((move, i) => {
    const mover = move.color;
    const scoreBeforeMover = toCentipawns(evals[i]);
    const scoreAfterOpponent = toCentipawns(evals[i + 1]);
    const scoreAfterMover = -scoreAfterOpponent;
    // Like Lichess, evals are capped at ±1000 for centipawn loss so a single slide
    // into a forced mate doesn't swamp the average.
    const cap = (v: number) => Math.max(-1000, Math.min(1000, v));
    const cpLoss = Math.max(0, Math.round(cap(scoreBeforeMover) - cap(scoreAfterMover)));

    const winBefore = winPercent(scoreBeforeMover);
    const winAfter = winPercent(scoreAfterMover);
    const accuracy = moveAccuracy(winBefore, winAfter);

    const phase: Phase =
      move.ply <= openingEndPly ? "opening" : endgameStartPly !== null && move.ply >= endgameStartPly ? "endgame" : "middlegame";

    const evalAfterWhite = mover === "w" ? scoreAfterMover : -scoreAfterMover;

    const cls = classes[i].cls;
    const best = evals[i].best;
    const bestSan = best && !["best", "brilliant", "great", "book"].includes(cls) ? sanOf(move.fenBefore, best) : null;
    return { ...move, cpLoss, accuracy, quality: classifyMove(winBefore - winAfter), phase, evalAfterWhite, cls, bestSan };
  });

  const whiteMoves = moves.filter((m) => m.color === "w");
  const blackMoves = moves.filter((m) => m.color === "b");

  return {
    white: statsFor(game.white, game.whiteElo, whiteMoves),
    black: statsFor(game.black, game.blackElo, blackMoves),
    moves,
    openingEndPly,
    endgameStartPly,
  };
}

function sanOf(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

// Standard start position, used only if a PGN somehow has zero moves.
function standardStartFen(): string {
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}
