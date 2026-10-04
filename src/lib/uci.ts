import { Chess } from "chess.js";

/** The engine's line as numbered SAN ("12. Nf3 Nc6 13. d4"), converted from UCI moves. */
export function pvToSan(fen: string, pv: string[], max = 10): string {
  const chess = new Chess(fen);
  const parts: string[] = [];
  for (const uci of pv.slice(0, max)) {
    const turn = chess.turn();
    const moveNo = chess.moveNumber();
    let san: string;
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      break;
    }
    parts.push(turn === "w" ? `${moveNo}. ${san}` : parts.length === 0 ? `${moveNo}… ${san}` : san);
  }
  return parts.join(" ");
}

/** From/to squares of a SAN move in a position, or null if it isn't legal there. */
export function sanSquares(fen: string, san: string): { from: string; to: string } | null {
  try {
    const m = new Chess(fen).move(san);
    return { from: m.from, to: m.to };
  } catch {
    return null;
  }
}
