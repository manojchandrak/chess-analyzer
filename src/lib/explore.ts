// "Continue from here": play moves from any position, on your own or against the engine.
// Pure helpers around chess.js, so the rules, undo and game-over detection are testable.
import { Chess, validateFen } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface ExploreMove {
  san: string;
  from: string;
  to: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
}

export interface ExploreState {
  startFen: string;
  moves: ExploreMove[];
}

/** An error message if `fen` isn't a usable position, otherwise null. */
export function fenProblem(fen: string): string | null {
  const v = validateFen(fen.trim());
  return v.ok ? null : `That isn't a valid position (${(v.error ?? "unknown problem").replace(/\.$/, "")}).`;
}

export function startExplore(startFen: string): ExploreState {
  return { startFen: startFen.trim(), moves: [] };
}

export const currentFen = (s: ExploreState) => (s.moves.length ? s.moves[s.moves.length - 1].fenAfter : s.startFen);
export const sideToMove = (s: ExploreState): "w" | "b" => (currentFen(s).split(" ")[1] === "b" ? "b" : "w");

/** The state after a move, or null if the move is illegal. */
export function play(s: ExploreState, move: { from: string; to: string; promotion?: string } | string): ExploreState | null {
  const chess = new Chess(currentFen(s));
  const fenBefore = chess.fen();
  try {
    const m = chess.move(move);
    return { ...s, moves: [...s.moves, { san: m.san, from: m.from, to: m.to, color: m.color, fenBefore, fenAfter: chess.fen() }] };
  } catch {
    return null;
  }
}

/** Plays an engine move in UCI notation ("e2e4", "e7e8q"). */
export function playUci(s: ExploreState, uci: string): ExploreState | null {
  return play(s, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Takes back `plies` moves (never below the start). */
export function undo(s: ExploreState, plies = 1): ExploreState {
  return { ...s, moves: s.moves.slice(0, Math.max(0, s.moves.length - plies)) };
}

/** Legal destinations for the piece on `from`, and whether a move there would be a promotion. */
export function targetsFrom(fen: string, from: string): string[] {
  try {
    return [...new Set(new Chess(fen).moves({ square: from as never, verbose: true }).map((m) => m.to))];
  } catch {
    return [];
  }
}

/** Whether `square` holds a piece of the side to move. */
export function ownPiece(fen: string, square: string): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(square as never);
    return !!piece && piece.color === chess.turn();
  } catch {
    return false;
  }
}

/** Whether moving the piece on `from` to `to` is a pawn promotion. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    return new Chess(fen).moves({ square: from as never, verbose: true }).some((m) => m.to === to && !!m.promotion);
  } catch {
    return false;
  }
}

export interface Status {
  over: boolean;
  /** "Checkmate: White wins.", "Draw by stalemate.", … ; null while the game goes on. */
  text: string | null;
  inCheck: boolean;
}

/** Is the game over (mate, stalemate, draw)? Replays the moves so repetition is detected. */
export function status(s: ExploreState): Status {
  const chess = new Chess(s.startFen);
  for (const m of s.moves) chess.move({ from: m.from, to: m.to, promotion: m.san.match(/=([QRBN])/)?.[1]?.toLowerCase() });
  const loser = chess.turn();
  if (chess.isCheckmate()) return { over: true, text: `Checkmate: ${loser === "w" ? "Black" : "White"} wins.`, inCheck: true };
  if (chess.isStalemate()) return { over: true, text: "Draw by stalemate.", inCheck: false };
  if (chess.isInsufficientMaterial()) return { over: true, text: "Draw by insufficient material.", inCheck: false };
  if (chess.isThreefoldRepetition()) return { over: true, text: "Draw by threefold repetition.", inCheck: chess.inCheck() };
  if (chess.isDraw()) return { over: true, text: "Draw by the fifty-move rule.", inCheck: chess.inCheck() };
  return { over: false, text: null, inCheck: chess.inCheck() };
}

/** Moves grouped into numbered pairs for display ("12. Nf3 Nc6"), starting from the right move number. */
export function numbered(s: ExploreState): { no: number; w?: string; b?: string }[] {
  const startNumber = Number(s.startFen.split(" ")[5]) || 1;
  const rows: { no: number; w?: string; b?: string }[] = [];
  let no = startNumber;
  s.moves.forEach((m, i) => {
    if (m.color === "w") rows.push({ no, w: m.san });
    else if (rows.length === 0 || i === 0) rows.push({ no, b: m.san });
    else rows[rows.length - 1].b = m.san;
    if (m.color === "b") no++;
  });
  return rows;
}
