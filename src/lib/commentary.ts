// Plain-English commentary for every move of a game, built from what the board shows
// (captures, checks, castling, development), what the engine found (move quality,
// evaluation swings, better alternatives) and the opening book. It reads like a short
// running commentary, not a list of numbers. Pure functions, so it is easy to test.
import { Chess } from "chess.js";
import type { AnalysisResult, MoveAnalysis, Phase } from "./analyze.ts";
import type { OpeningName } from "./openings.ts";
import type { ParsedGame, ParsedMove } from "./pgn.ts";

const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE_CP = 90000;

const side = (c: "w" | "b") => (c === "w" ? "White" : "Black");
/** Picks one of several phrasings, stable for a given ply so the text doesn't change on re-render. */
const pick = <T>(options: T[], ply: number): T => options[ply % options.length];

/** "+1.3", "-0.4", or "mate in 3" from an evaluation in centipawns (White's point of view). */
export function evalText(evalWhite: number): string {
  if (Math.abs(evalWhite) >= MATE_CP) {
    const n = Math.max(1, Math.round((100000 - Math.abs(evalWhite)) / 100));
    return `mate in ${n}`;
  }
  const v = evalWhite / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

export type EdgeLevel = "equal" | "slight" | "clear" | "winning" | "mate";

/** Who is ahead, and by how much, from an evaluation in centipawns (White's point of view). */
export function edgeOf(evalWhite: number): { side: "w" | "b" | null; level: EdgeLevel } {
  const abs = Math.abs(evalWhite);
  const who = evalWhite > 0 ? "w" : "b";
  if (abs >= MATE_CP) return { side: who, level: "mate" };
  if (abs < 30) return { side: null, level: "equal" };
  if (abs < 100) return { side: who, level: "slight" };
  if (abs < 300) return { side: who, level: "clear" };
  return { side: who, level: "winning" };
}

function edgeSentence(evalWhite: number): string {
  const { side: who, level } = edgeOf(evalWhite);
  if (level === "equal" || !who) return "The position is roughly balanced.";
  if (level === "mate") return `${side(who)} has a forced ${evalText(evalWhite)}.`;
  const text = `(${evalText(evalWhite)})`;
  if (level === "slight") return `${side(who)} has a slight edge ${text}.`;
  if (level === "clear") return `${side(who)} has a clear advantage ${text}.`;
  return `${side(who)} is winning ${text}.`;
}

/** What the move physically does: capture, check, castling, promotion, development. Null for an unremarkable move. */
export function describeMove(move: ParsedMove): string | null {
  const who = side(move.color);
  const opp = move.color === "w" ? "b" : "w";
  const san = move.san;
  if (san.endsWith("#")) return `${who} delivers checkmate.`;
  if (san.startsWith("O-O-O")) return `${who} castles queenside${san.endsWith("+") ? ", with check" : ""}, getting the king to safety.`;
  if (san.startsWith("O-O")) return `${who} castles kingside${san.endsWith("+") ? ", with check" : ""}, getting the king to safety and connecting the rooks.`;

  const promo = san.match(/=([QRBN])/)?.[1];
  const piece = NAMES[move.piece];
  const check = san.includes("+");

  if (promo) {
    const target = NAMES[promo.toLowerCase()];
    return `${who} promotes the pawn to ${/^[aeiou]/.test(target) ? "an" : "a"} ${target}${move.captured ? `, capturing the ${NAMES[move.captured]}` : ""}${check ? " with check" : ""}.`;
  }

  if (move.captured) {
    let text = `${who}'s ${piece} takes the ${NAMES[move.captured]} on ${move.to}${check ? " with check" : ""}`;
    // Is the capturing piece left hanging on the square it captured on?
    const after = new Chess(move.fenAfter);
    const attacked = after.attackers(move.to as never, opp).length > 0;
    const defended = after.attackers(move.to as never, move.color).length > 0;
    if (move.piece !== "p" && move.piece !== "k" && attacked && !defended && VALUE[move.piece] > VALUE[move.captured]) {
      text += `, but the ${piece} is left undefended there`;
    }
    return `${text}.`;
  }

  if (check) return `${who} gives check with the ${piece}.`;

  if (move.ply <= 20) {
    const backRank = move.color === "w" ? "1" : "8";
    if ((move.piece === "n" || move.piece === "b") && move.from[1] === backRank) return `${who} develops the ${piece} to ${move.to}.`;
    if (move.piece === "p" && ["d4", "e4", "d5", "e5"].includes(move.to)) return `${who} stakes a claim in the center.`;
    if (move.piece === "q" && move.ply <= 8) return `${who} brings the queen out early.`;
    if (move.piece === "r" && ["c", "d", "e"].includes(move.to[0]) && move.ply > 8) return `${who} brings a rook to the ${move.to[0]}-file.`;
  }
  return null;
}

const altList = (alts: { san: string; evalWhite: number }[]) => alts.map((a) => `${a.san} (${evalText(a.evalWhite)})`).join(" and ");

/** The engine's verdict on the move, in words. Empty when there was no engine review. */
function qualitySentence(m: MoveAnalysis, prevEvalWhite: number): string {
  const who = side(m.color);
  const before = evalText(prevEvalWhite);
  const after = evalText(m.evalAfterWhite);
  const better = m.alternatives.filter((a) => !a.played).slice(0, 2);
  const fix = better.length ? ` Better options: ${altList(better)}.` : m.bestSan ? ` ${m.bestSan} was better.` : "";

  switch (m.cls) {
    case "brilliant":
      return pick(["A brilliant move! The material it gives up is more than repaid by the position.", "Brilliant! A sacrifice that the engine confirms is the strongest continuation."], m.ply);
    case "great":
      return pick(["A great move: the only one that keeps the position under control.", "Great find. Most other moves here would let the advantage slip."], m.ply);
    case "best":
      return pick(["The engine's top choice.", "Best by the engine.", "Exactly what the engine would play."], m.ply);
    case "excellent":
      return pick(["An excellent move, almost as good as the engine's first choice.", "Excellent: very close to the best move."], m.ply);
    case "good":
      return m.bestSan ? `A good move, though ${m.bestSan} was a little more precise.` : "A good, sound move.";
    case "book":
      return "A standard book move.";
    case "inaccuracy":
      return `A small inaccuracy.${fix}`;
    case "mistake":
      return `A mistake: the evaluation drops from ${before} to ${after}.${fix}`;
    case "miss":
      return `A missed chance: ${who === "White" ? "Black" : "White"}'s last move was a mistake, and this does not make the most of it.${fix}`;
    case "blunder":
      return `A blunder! The evaluation swings from ${before} to ${after}.${fix}`;
  }
}

export interface CommentaryOptions {
  /** Opening reached after each ply (index 0 = start) and how many plies are book. */
  openings?: { perPly: (OpeningName | null)[]; bookPlies: number } | null;
}

/** Commentary for every position of a game: index 0 introduces the game, index n comments on move n. */
export function buildCommentary(game: ParsedGame, analysis: AnalysisResult | null, opts: CommentaryOptions = {}): string[] {
  const { openings } = opts;
  const out: string[] = [];

  const players = `${game.white}${game.whiteElo ? ` (${game.whiteElo})` : ""} played White against ${game.black}${game.blackElo ? ` (${game.blackElo})` : ""}`;
  const result = game.result === "1-0" ? "White won." : game.result === "0-1" ? "Black won." : game.result === "1/2-1/2" ? "The game was drawn." : "";
  out.push(`${players}. ${result} Step through the moves to follow the commentary${analysis ? "" : ", or run the Stockfish review for move-by-move verdicts"}.`.replace("  ", " "));

  let prevEval = 20; // the start position is worth about +0.2 to White
  let prevPhase: Phase | null = null;
  game.moves.forEach((move, i) => {
    const a = analysis?.moves[i] ?? null;
    const parts: string[] = [];

    const what = describeMove(move);
    if (what) parts.push(what);

    if (a) {
      parts.push(qualitySentence(a, prevEval));
    }

    // Opening theory
    const opening = openings?.perPly[move.ply] ?? null;
    const prevOpening = openings?.perPly[move.ply - 1] ?? null;
    if (openings && opening && move.ply <= openings.bookPlies && opening.name !== prevOpening?.name) {
      parts.push(`This is the ${opening.name} (${opening.eco}).`);
    } else if (openings && openings.bookPlies > 0 && move.ply === openings.bookPlies + 1) {
      parts.push("The game now leaves the opening book and heads into new territory.");
    }

    if (a) {
      // A change in who is ahead (or by how much) is worth saying out loud.
      const before = edgeOf(prevEval);
      const after = edgeOf(a.evalAfterWhite);
      const mistakeLike = a.cls === "mistake" || a.cls === "blunder";
      if ((before.level !== after.level || before.side !== after.side) && !(mistakeLike && after.level === "equal")) {
        parts.push(edgeSentence(a.evalAfterWhite));
      }
      if (prevPhase && a.phase !== prevPhase && a.phase !== "opening") parts.push(`The game enters the ${a.phase}.`);
      prevPhase = a.phase;
      prevEval = a.evalAfterWhite;
    }

    if (parts.length === 0) parts.push(`${side(move.color)} plays ${move.san}.`);
    out.push(parts.slice(0, 4).join(" "));
  });
  return out;
}

