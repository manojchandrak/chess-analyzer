// Playing-style features read straight from the moves (no engine needed), so
// they can be computed for thousands of games: how often a player checks,
// storms the king, castles, trades queens, plays on while down material, and
// reaches endgames. The profile turns these into traits.
import { Chess } from "chess.js";
import { ecoFamily } from "./eco.ts";
import { scoreFor, type GameRecord } from "./games.ts";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ENDGAME_MATERIAL = 14; // combined non-pawn material, both sides (same as the analyzer)

export interface GameFeatures {
  color: "w" | "b";
  score: number;
  /** Full moves in the game. */
  length: number;
  ownMoves: number;
  checks: number;
  captures: number;
  castled: "K" | "Q" | null;
  castledAtMove: number | null;
  opponentCastled: "K" | "Q" | null;
  /** Own flank pawns pushed toward the opponent's castled king before move 30. */
  stormPushes: number;
  /** Own queen moved within the first 5 moves. */
  earlyQueen: boolean;
  /** Full move when both queens were off the board (null: never). */
  queensOffAt: number | null;
  /** Largest material deficit (pawn units) held for 4+ plies before move 40. */
  sustainedDeficit: number;
  reachedEndgame: boolean;
  family: string | null;
  firstMove: string | null;
  /** Opponent's first move when the player had Black. */
  facedFirstMove: string | null;
}

/** Replays the game once and extracts style features for `color`. Returns null
 * for unfinished games or games with illegal/unparsable moves. */
export function extractFeatures(game: GameRecord, color: "w" | "b"): GameFeatures | null {
  const score = scoreFor(game.result, color);
  if (score === null) return null;
  const sans = game.moves.split(" ").filter(Boolean);
  if (sans.length < 2) return null;

  const chess = new Chess();
  const material = { w: 39, b: 39 };
  const pieces = { w: { q: 1 }, b: { q: 1 } };
  let nonPawn = 62;
  const f: GameFeatures = {
    color,
    score,
    length: Math.ceil(sans.length / 2),
    ownMoves: 0,
    checks: 0,
    captures: 0,
    castled: null,
    castledAtMove: null,
    opponentCastled: null,
    stormPushes: 0,
    earlyQueen: false,
    queensOffAt: null,
    sustainedDeficit: 0,
    reachedEndgame: false,
    family: ecoFamily(game.eco),
    firstMove: color === "w" ? sans[0].replace(/[+#]/g, "") : null,
    facedFirstMove: color === "b" ? sans[0].replace(/[+#]/g, "") : null,
  };
  let deficitRun = 0;
  let deficitRunMin = Infinity;

  for (let i = 0; i < sans.length; i++) {
    let move;
    try {
      move = chess.move(sans[i]);
    } catch {
      return null;
    }
    const mover = move.color as "w" | "b";
    const other = mover === "w" ? "b" : "w";
    const moveNo = Math.floor(i / 2) + 1;

    if (move.captured) {
      material[other] -= VALUE[move.captured];
      if (move.captured !== "p") nonPawn -= VALUE[move.captured];
      if (move.captured === "q") pieces[other].q--;
    }
    if (move.promotion) {
      material[mover] += VALUE[move.promotion] - 1;
      nonPawn += VALUE[move.promotion];
      if (move.promotion === "q") pieces[mover].q++;
    }
    const side = move.san.startsWith("O-O-O") ? "Q" : move.san.startsWith("O-O") ? "K" : null;

    if (mover === color) {
      f.ownMoves++;
      if (move.san.includes("+") || move.san.includes("#")) f.checks++;
      if (move.captured) f.captures++;
      if (side && !f.castled) {
        f.castled = side;
        f.castledAtMove = moveNo;
      }
      if (move.piece === "q" && moveNo <= 5) f.earlyQueen = true;
      if (move.piece === "p" && moveNo < 30 && f.opponentCastled) {
        const file = move.from[0];
        const flank = f.opponentCastled === "K" ? "fgh" : "abc";
        const forward = color === "w" ? move.to[1] > move.from[1] : move.to[1] < move.from[1];
        if (flank.includes(file) && forward) f.stormPushes++;
      }
    } else if (side && !f.opponentCastled) {
      f.opponentCastled = side;
    }

    if (f.queensOffAt === null && pieces.w.q === 0 && pieces.b.q === 0) f.queensOffAt = moveNo;
    if (!f.reachedEndgame && i >= 20 && nonPawn <= ENDGAME_MATERIAL) f.reachedEndgame = true;

    if (moveNo <= 40) {
      const deficit = material[color === "w" ? "b" : "w"] - material[color];
      if (deficit >= 2) {
        deficitRun++;
        deficitRunMin = Math.min(deficitRunMin, deficit);
        if (deficitRun >= 4) f.sustainedDeficit = Math.max(f.sustainedDeficit, deficitRunMin);
      } else {
        deficitRun = 0;
        deficitRunMin = Infinity;
      }
    }
  }
  return f;
}
