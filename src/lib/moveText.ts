// Turns messy text (from OCR of a scoresheet or a screenshot of a move list) into a game.
//
// OCR confuses look-alike characters (1/l, 5/S, b/6, 0/O...). Instead of trusting the text, every move is
// checked against the rules of chess in the position it is played in. A misread move is only corrected when
// the corrected version is a LEGAL move there, and every correction is reported so the person can check it.

import { Chess } from "chess.js";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface Fix {
  /** 0-based half-move index. */
  ply: number;
  from: string;
  to: string;
  /** Other legal readings that fit the rest of the game about as well (the person should check). */
  alternatives?: string[];
}

export interface MoveProblem {
  /** 0-based half-move index of the move that could not be read. */
  ply: number;
  /** What the text said at that point. */
  text: string;
}

export interface RecoveredGame {
  /** The moves that were read, in standard notation. */
  sans: string[];
  pgn: string;
  result: GameResult;
  /** Moves that were corrected because the text was not a legal move. */
  fixes: Fix[];
  /** Set when reading stopped early; the moves before it are still returned. */
  problem: MoveProblem | null;
  /** Everything the text contained after cleanup, one entry per move-like word. */
  tokens: string[];
}

const FIGURINES: Record<string, string> = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": "" };

/** Characters OCR tends to mix up. Within a group, any character can stand in for another. */
const LOOKALIKES = ["1lIi|!", "5Ssbd", "6bGg", "8B", "4dAa", "0Oo", "2Zz", "7T", "9gq", "cC", "dD", "eE", "fF", "aA", "hH", "NnM", "RrK", "Qq", "xX×"];

function alternatives(ch: string): string[] {
  const out = new Set<string>();
  for (const group of LOOKALIKES) if (group.includes(ch)) for (const c of group) out.add(c);
  out.delete(ch);
  return [...out];
}

const swapCase = (ch: string) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase());

/** The part of a move that identifies it, ignoring check marks, capture signs and promotion equals signs. */
const canon = (san: string) => san.replace(/[x+#=!?]/g, "");

export function tidyText(raw: string): { text: string; result: GameResult } {
  let text = raw.replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, (c) => FIGURINES[c] ?? "");
  text = text.replace(/[–—−‐]/g, "-").replace(/½/g, "1/2").replace(/\r/g, "");
  text = text.replace(/\[[^\]]*\]/g, " "); // PGN tag lines like [Event "..."]
  text = text.replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " "); // comments and side lines
  let result: GameResult = "*";
  const end = text.trimEnd().match(/(1\s*-\s*0|0\s*-\s*1|1\/2\s*-\s*1\/2)\s*$/);
  if (end) {
    const r = end[1].replace(/\s+/g, "");
    result = r === "1-0" ? "1-0" : r === "0-1" ? "0-1" : "1/2-1/2";
    text = text.slice(0, text.trimEnd().length - end[0].length);
  }
  return { text, result };
}

/** Splits cleaned text into move-like words, dropping move numbers that are written with a dot. */
export function tokenize(raw: string): { tokens: string[]; result: GameResult } {
  const { text, result } = tidyText(raw);
  const tokens: string[] = [];
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    // "12. e4", "12... e5", "1.e4" and OCR's "l." for "1."
    line = line.replace(/(^|\s)[\dlI|]{1,3}\s*(?:\.{1,3}|…|,|\))\s*/g, " ");
    for (const word of line.split(/\s+/)) {
      const w = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#=]+$/g, "").replace(/[!?]+/g, "");
      if (w) tokens.push(w);
    }
  }
  return { tokens, result };
}

/** Readings of one word, cheapest first: exactly as written, or with look-alike characters, case, a stray or missing character fixed. */
function variantsOf(word: string): Map<string, number> {
  const base = [...word.replace(/[+#=!?]/g, "")];
  const out = new Map<string, number>();
  const BUDGET = 2;
  const add = (chars: string[], cost: number) => {
    const key = chars.join("");
    if (cost < (out.get(key) ?? Infinity)) out.set(key, cost);
  };
  const walk = (chars: string[], from: number, cost: number, deleted = false) => {
    add(chars, cost);
    for (let i = from; i < chars.length; i++) {
      const ch = chars[i];
      const put = (value: string, extra: number) => {
        if (cost + extra > BUDGET) return;
        const next = chars.slice();
        next[i] = value;
        walk(next, i + 1, cost + extra, deleted);
      };
      if (/[A-Za-z]/.test(ch)) put(swapCase(ch), 0.5);
      for (const alt of alternatives(ch)) put(alt, 1);
      if (i === chars.length - 1 && i > 0) for (let d = 1; d <= 8; d++) if (String(d) !== ch) put(String(d), 1.5); // the rank digit
      if (!deleted && cost + 1 <= BUDGET && chars.length > 2) walk([...chars.slice(0, i), ...chars.slice(i + 1)], i, cost + 1, true); // one extra character
    }
    // A missing rank digit: "Nf" -> "Nf3".
    if (cost + 1.5 <= BUDGET && /[a-h]$/.test(chars.join(""))) for (let d = 1; d <= 8; d++) add([...chars, String(d)], cost + 1.5);
  };
  walk(base, 0, 0);
  return out;
}

interface Candidate {
  san: string;
  cost: number;
}

/** The legal moves a word could mean, cheapest first. A word that is exactly a legal move has no competition. */
function candidatesFor(fen: string, word: string): Candidate[] {
  const chess = new Chess(fen);
  const legal = new Map<string, string>(); // canonical form -> SAN
  for (const san of chess.moves()) legal.set(canon(san), san);

  if (/^[0Oo]\s*-\s*[0Oo]/.test(word)) {
    const long = (word.match(/[0Oo]/g) ?? []).length >= 3;
    const castle = legal.get(canon(long ? "O-O-O" : "O-O"));
    if (castle) return [{ san: castle, cost: 0 }];
  }
  const exact = legal.get(canon(word));
  if (exact) return [{ san: exact, cost: 0 }];

  const found = new Map<string, number>();
  if (word.length <= 8) {
    for (const [variant, cost] of variantsOf(word)) {
      const san = legal.get(canon(variant));
      if (san && cost < (found.get(san) ?? Infinity)) found.set(san, cost);
    }
  }
  return [...found].map(([san, cost]) => ({ san, cost })).sort((a, b) => a.cost - b.cost);
}

interface Path {
  fen: string;
  sans: string[];
  fixes: Fix[];
  cost: number;
}

const BEAM = 64;
const PER_WORD = 4;

export function recoverMoves(raw: string): RecoveredGame {
  const { tokens, result } = tokenize(raw);
  let frontier: Path[] = [{ fen: new Chess().fen(), sans: [], fixes: [], cost: 0 }];
  let problem: MoveProblem | null = null;
  let stuck: Path[] = [];

  const play = (path: Path, san: string, word: string, cost: number): Path => {
    const chess = new Chess(path.fen);
    chess.move(san);
    const ply = path.sans.length;
    return { fen: chess.fen(), sans: [...path.sans, san], fixes: cost > 0 ? [...path.fixes, { ply, from: word, to: san }] : path.fixes, cost: path.cost + cost };
  };

  for (let t = 0; t < tokens.length; t++) {
    const word = tokens[t];
    const next: Path[] = [];
    for (const path of frontier) {
      const ply = path.sans.length;
      // Move numbers written without a dot (scoresheet columns): "1  e4  e5".
      if (ply % 2 === 0 && /^\d{1,3}$/.test(word) && Number(word) === ply / 2 + 1) {
        next.push(path);
        continue;
      }
      const options = candidatesFor(path.fen, word);
      // Two moves run together by OCR ("e4e5", "Nf3Nc6"). If the word is not itself a move but splits into two exact
      // legal moves, that is the reading; it beats any amount of letter-fixing.
      if (word.length >= 4 && options[0]?.cost !== 0) {
        let split: Path | null = null;
        for (let cut = 2; cut <= word.length - 2 && !split; cut++) {
          const first = candidatesFor(path.fen, word.slice(0, cut))[0];
          if (first?.cost !== 0) continue;
          const mid = play(path, first.san, word.slice(0, cut), 0);
          const second = candidatesFor(mid.fen, word.slice(cut))[0];
          if (second?.cost === 0) split = play(mid, second.san, word.slice(cut), 0);
        }
        if (split) {
          next.push(split);
          continue;
        }
      }
      const best = options[0]?.cost ?? 0;
      for (const o of options.filter((c) => c.cost <= best + 1).slice(0, PER_WORD)) next.push(play(path, o.san, word, o.cost));
    }
    if (next.length === 0) {
      stuck = frontier;
      problem = { ply: Math.min(...frontier.map((p) => p.sans.length)), text: word };
      break;
    }
    // Keep the cheapest readings; several can survive until a later move shows which one was right.
    next.sort((a, b) => a.cost - b.cost);
    frontier = next.slice(0, BEAM);
  }

  const pool = problem ? stuck : frontier;
  const chosen = pool.reduce((a, b) => (b.sans.length > a.sans.length || (b.sans.length === a.sans.length && b.cost < a.cost) ? b : a));
  if (problem) problem = { ply: chosen.sans.length, text: problem.text };

  // Where other readings fit the whole game about as well, say so.
  const fixes = chosen.fixes.map((f) => {
    const alts = new Set<string>();
    for (const other of pool) {
      if (other === chosen || other.cost > chosen.cost + 0.5 || other.sans.length !== chosen.sans.length) continue;
      const san = other.sans[f.ply];
      if (san && san !== f.to) alts.add(san);
    }
    return alts.size ? { ...f, alternatives: [...alts].slice(0, 3) } : f;
  });

  const out = new Chess();
  for (const san of chosen.sans) out.move(san);
  const played = out.history();
  const finalResult: GameResult = problem ? "*" : result;
  const numbered = played.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san));
  const pgn = [...numbered, finalResult].join(" ");
  return { sans: played, pgn, result: finalResult, fixes, problem, tokens };
}
