import { classifyMove, moveAccuracy, toCentipawns, winPercent, type MoveQuality } from "./accuracy";
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
  };
}

/** Runs a full engine analysis of a parsed game: evaluates every position once,
 * derives per-move centipawn loss and accuracy, segments the game into
 * opening/middlegame/endgame, and aggregates per-player stats. */
export async function analyzeGame(
  game: ParsedGame,
  engine: StockfishEngine,
  depth: number,
  onProgress?: (done: number, total: number) => void,
): Promise<AnalysisResult> {
  const fens = [game.moves[0]?.fenBefore ?? standardStartFen(), ...game.moves.map((m) => m.fenAfter)];

  const evals: EngineEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    evals.push(await engine.evaluate(fens[i], depth));
    onProgress?.(i + 1, fens.length);
  }

  const openingEndPly = Math.min(20, game.moves.length);
  let endgameStartPly: number | null = null;
  for (const move of game.moves) {
    if (move.ply <= openingEndPly) continue;
    if (nonPawnMaterial(move.fenAfter) <= ENDGAME_MATERIAL_THRESHOLD) {
      endgameStartPly = move.ply;
      break;
    }
  }

  const moves: MoveAnalysis[] = game.moves.map((move, i) => {
    const mover = move.color;
    const scoreBeforeMover = toCentipawns(evals[i]);
    const scoreAfterOpponent = toCentipawns(evals[i + 1]);
    const scoreAfterMover = -scoreAfterOpponent;
    const cpLoss = Math.max(0, Math.round(scoreBeforeMover - scoreAfterMover));

    const winBefore = winPercent(scoreBeforeMover);
    const winAfter = winPercent(scoreAfterMover);
    const accuracy = moveAccuracy(winBefore, winAfter);

    const phase: Phase =
      move.ply <= openingEndPly ? "opening" : endgameStartPly !== null && move.ply >= endgameStartPly ? "endgame" : "middlegame";

    const evalAfterWhite = mover === "w" ? scoreAfterMover : -scoreAfterMover;

    return { ...move, cpLoss, accuracy, quality: classifyMove(cpLoss), phase, evalAfterWhite };
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

// Standard start position, used only if a PGN somehow has zero moves.
function standardStartFen(): string {
  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}
