// "Practice your mistakes": positions from your own reviewed games where you went
// wrong, to be solved again.
import { Chess } from "chess.js";
import type { GameRecord } from "./games.ts";
import type { GameReview } from "./review.ts";

export interface PuzzleItem {
  /** "<gameId>#<ply>" */
  id: string;
  gameId: string;
  /** Position before the mistake. */
  fen: string;
  /** Side to move (the player). */
  color: "w" | "b";
  played: string;
  best: string;
  cpLoss: number;
  quality: "mistake" | "blunder";
  opponent: string | null;
  date: string | null;
}

/** Puzzles from reviewed games: blunders before mistakes, biggest losses first. */
export function collectPuzzles(reviews: GameReview[], games: Map<string, GameRecord>, limit = 60): PuzzleItem[] {
  const out: PuzzleItem[] = [];
  for (const r of reviews) {
    const g = games.get(r.gameId);
    for (const m of r.moves) {
      if (!m.puzzle || (m.quality !== "mistake" && m.quality !== "blunder")) continue;
      out.push({
        id: `${r.gameId}#${m.ply}`,
        gameId: r.gameId,
        fen: m.puzzle.fen,
        color: r.color,
        played: m.puzzle.played,
        best: m.puzzle.best,
        cpLoss: m.cpLoss,
        quality: m.quality,
        opponent: g ? (r.color === "w" ? g.black : g.white) : null,
        date: g?.date ?? null,
      });
    }
  }
  const rank = (p: PuzzleItem) => (p.quality === "blunder" ? 1 : 0);
  out.sort((a, b) => rank(b) - rank(a) || b.cpLoss - a.cpLoss || (b.date ?? "").localeCompare(a.date ?? ""));
  return out.slice(0, limit);
}

const strip = (san: string) => san.replace(/[+#!?]/g, "");

export type Answer = "correct" | "wrong" | "illegal";

/** Checks a move (as SAN, or from/to squares) against the best move in a position. */
export function checkAnswer(fen: string, move: string | { from: string; to: string; promotion?: string }, best: string): { result: Answer; san: string | null } {
  try {
    const played = new Chess(fen).move(typeof move === "string" ? move.trim() : move);
    return { result: strip(played.san) === strip(best) ? "correct" : "wrong", san: played.san };
  } catch {
    return { result: "illegal", san: null };
  }
}

/** Legal destination squares for the piece on `from`. */
export function legalTargets(fen: string, from: string): string[] {
  try {
    return new Chess(fen).moves({ square: from as never, verbose: true }).map((m) => m.to);
  } catch {
    return [];
  }
}

/** Whether `square` holds a piece belonging to the side to move. */
export function isOwnPiece(fen: string, square: string): boolean {
  try {
    const piece = new Chess(fen).get(square as never);
    return !!piece && piece.color === new Chess(fen).turn();
  } catch {
    return false;
  }
}

// ---- progress, kept in the browser ----
const KEY = "chess-analyzer:puzzles:v1";

export function loadSolved(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveSolved(solved: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...solved]));
  } catch {
    // not remembered; fine
  }
}
