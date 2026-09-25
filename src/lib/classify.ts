// Chess.com-style move classifications (Brilliant, Great, Best, Excellent, Good,
// Book, Inaccuracy, Mistake, Miss, Blunder), judged by expected points: the
// mover's win probability before the move minus after it.
import { Chess } from "chess.js";
import { toCentipawns, winPercent } from "./accuracy";
import type { EngineEval } from "./engine";
import type { ParsedMove } from "./pgn";

export type MoveClass = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder";

export const CLASS_META: Record<MoveClass, { label: string; symbol: string; color: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!", color: "#1baca6" },
  great: { label: "Great", symbol: "!", color: "#5b8bb0" },
  best: { label: "Best", symbol: "★", color: "#81b64c" },
  excellent: { label: "Excellent", symbol: "👍", color: "#96bc4b" },
  good: { label: "Good", symbol: "✓", color: "#95af8a" },
  book: { label: "Book", symbol: "📖", color: "#a88865" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", color: "#f0c15c" },
  mistake: { label: "Mistake", symbol: "?", color: "#e6912c" },
  miss: { label: "Miss", symbol: "✗", color: "#ee6b55" },
  blunder: { label: "Blunder", symbol: "??", color: "#ca3431" },
};

export const CLASS_ORDER: MoveClass[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** Expected points (0-1) for the side to move. */
const points = (e: { cp: number | null; mate: number | null }) => winPercent(toCentipawns({ cp: e.cp, mate: e.mate })) / 100;

function uciOf(m: ParsedMove): string {
  const promo = m.san.match(/=([QRBN])/)?.[1]?.toLowerCase() ?? "";
  return `${m.from}${m.to}${promo}`;
}

/** Static exchange on `square`: material the side to move can win there by
 * capturing with its least valuable attackers (and stopping when it's better to). */
function see(chess: Chess, square: string, depth = 0): number {
  if (depth > 10) return 0;
  const target = chess.get(square as Parameters<Chess["get"]>[0]);
  if (!target) return 0;
  const captures = chess.moves({ verbose: true }).filter((m) => m.to === square && m.captured);
  if (captures.length === 0) return 0;
  captures.sort((a, b) => VALUE[a.piece] - VALUE[b.piece]);
  chess.move(captures[0]);
  const gain = VALUE[target.type] - see(chess, square, depth + 1);
  chess.undo();
  return Math.max(0, gain);
}

/** True when the move gives up material (net 2+ pawns) with a piece, i.e. the
 * opponent can win material on the destination square. */
function isSacrifice(m: ParsedMove): boolean {
  if (m.piece === "p" || m.piece === "k") return false;
  const chess = new Chess(m.fenAfter);
  if (chess.isGameOver()) return false;
  const gained = m.captured ? VALUE[m.captured] : 0;
  return see(chess, m.to) - gained >= 2;
}

/** Classifies every move. `evals[i]` is the side-to-move eval of the position
 * before move i (evals.length = moves.length + 1); best moves and second-best
 * scores sharpen Best/Great/Brilliant when the engine supplied them. */
export function classifyMoves(moves: ParsedMove[], evals: EngineEval[], bookPlies = 0): { cls: MoveClass; loss: number }[] {
  const out: { cls: MoveClass; loss: number }[] = [];
  moves.forEach((m, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    const pBefore = points(before);
    const pAfter = 1 - points(after);
    const loss = Math.max(0, pBefore - pAfter);
    const isBest = before.best ? before.best === uciOf(m) : loss <= 0.001;
    const onlyMove = new Chess(m.fenBefore).moves().length === 1;
    const prevLoss = i > 0 ? out[i - 1].loss : 0;

    let cls: MoveClass;
    if (i < bookPlies && loss < 0.05) cls = "book";
    else if (isBest || loss <= 0.02) {
      // Sacrifices count as brilliant unless the position was already won anyway,
      // except when the sacrifice forces mate (the classic brilliancy).
      const forcesMate = after.mate !== null && after.mate < 0;
      if (!onlyMove && pAfter >= 0.5 && (pBefore < 0.95 || forcesMate) && isSacrifice(m)) cls = "brilliant";
      else if (isBest && !onlyMove && before.second && pBefore - points(before.second) >= 0.15 && pBefore < 0.9) cls = "great";
      else cls = isBest ? "best" : "excellent";
    } else if (loss <= 0.05) cls = "good";
    else if (prevLoss >= 0.1 && loss >= 0.1 && loss < 0.3) cls = "miss";
    else if (loss <= 0.1) cls = "inaccuracy";
    else if (loss <= 0.2) cls = "mistake";
    else cls = "blunder";
    out.push({ cls, loss });
  });
  return out;
}
