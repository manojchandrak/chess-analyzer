const PIECE_VALUES: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };

/** Total non-pawn, non-king material on the board (both sides combined), used
 * as a rough opening/middlegame/endgame phase signal. */
export function nonPawnMaterial(fen: string): number {
  const placement = fen.split(" ")[0];
  let total = 0;
  for (const char of placement) {
    const value = PIECE_VALUES[char.toLowerCase()];
    if (value) total += value;
  }
  return total;
}
