/** Position key for opening lookup: piece placement, side to move, castling and
 * en passant (move counters dropped so transpositions match). */
export function openingKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}
