// Plain-language descriptions of a position, so the board is usable with a screen reader.

const NAMES: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const ORDER = "kqrbnp";
const FILES = "abcdefgh";

/** "White: king g1, rook f1, pawns a2 b2 c3. Black: king g8, …" from a FEN. */
export function describePosition(fen: string): string {
  const pieces: Record<"White" | "Black", Record<string, string[]>> = { White: {}, Black: {} };
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          const side = ch === ch.toUpperCase() ? "White" : "Black";
          (pieces[side][ch.toLowerCase()] ??= []).push(`${FILES[f]}${8 - r}`);
          f++;
        }
      }
    });
  const turn = fen.split(" ")[1] === "b" ? "Black" : "White";
  const describe = (side: "White" | "Black") =>
    ORDER.split("")
      .filter((k) => pieces[side][k])
      .map((k) => `${pieces[side][k].length > 1 ? NAMES[k] + "s" : NAMES[k]} ${pieces[side][k].join(" ")}`)
      .join(", ");
  return `White: ${describe("White")}. Black: ${describe("Black")}. ${turn} to move.`;
}

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
  opacity?: number;
}

/** Centre of a square in a 0-8 grid (x right, y down), for drawing over the board. */
export function squareCenter(square: string, flipped: boolean): { x: number; y: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return { x: (flipped ? 7 - file : file) + 0.5, y: (flipped ? rank - 1 : 8 - rank) + 0.5 };
}

/** Line and arrow-head points for an arrow between two squares. */
export function arrowGeometry(a: BoardArrow, flipped: boolean): { x1: number; y1: number; x2: number; y2: number; head: string } {
  const from = squareCenter(a.from, flipped);
  const to = squareCenter(a.to, flipped);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = 0.42;
  const headHalf = 0.26;
  // The shaft ends where the head begins, so the round cap doesn't poke through the tip.
  const bx = to.x - ux * headLen;
  const by = to.y - uy * headLen;
  const head = [
    `${to.x},${to.y}`,
    `${bx + -uy * headHalf},${by + ux * headHalf}`,
    `${bx - -uy * headHalf},${by - ux * headHalf}`,
  ].join(" ");
  return { x1: from.x + ux * 0.18, y1: from.y + uy * 0.18, x2: bx, y2: by, head };
}

/** The squares of a UCI move ("e2e4", "e7e8q"). */
export function uciSquares(uci: string): { from: string; to: string } | null {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null;
}
