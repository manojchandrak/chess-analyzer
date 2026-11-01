// The daily puzzle: Lichess publishes one puzzle a day, free to read from the browser. It is solved over several
// moves: you play the first solution move, the opponent's reply is played for you, and so on to the end.
import { Chess } from "chess.js";

const DAILY_URL = "https://lichess.org/api/puzzle/daily";
const KEY = "chess-analyzer:daily-puzzle";

export interface DailyPuzzle {
  id: string;
  /** Position to solve, with the solver to move. */
  fen: string;
  color: "w" | "b";
  /** The whole line in UCI: the solver's move, the reply, the solver's move, and so on. */
  solution: string[];
  rating: number | null;
  themes: string[];
}

export type DailyOutcome = "clean" | "solved" | "failed";
/** Result per local calendar day ("2026-11-01"). */
export type DailyHistory = Record<string, DailyOutcome>;

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Reads Lichess's daily-puzzle response, or null when it doesn't look right (so a bad response never breaks the page). */
export function parseDaily(json: unknown): DailyPuzzle | null {
  const p = (json as { puzzle?: Record<string, unknown> } | null)?.puzzle;
  if (!p || typeof p.id !== "string" || typeof p.fen !== "string" || !Array.isArray(p.solution)) return null;
  const solution = p.solution.filter((m): m is string => typeof m === "string" && UCI.test(m));
  if (solution.length === 0 || solution.length !== p.solution.length) return null;
  try {
    const chess = new Chess(p.fen);
    for (const m of solution) chess.move(toMove(m));
    return {
      id: p.id,
      fen: p.fen,
      color: p.fen.split(" ")[1] === "b" ? "b" : "w",
      solution,
      rating: typeof p.rating === "number" ? p.rating : null,
      themes: Array.isArray(p.themes) ? p.themes.filter((t): t is string => typeof t === "string") : [],
    };
  } catch {
    return null;
  }
}

export async function fetchDailyPuzzle(fetchImpl: typeof fetch = fetch): Promise<DailyPuzzle> {
  const res = await fetchImpl(DAILY_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Lichess answered ${res.status}`);
  const puzzle = parseDaily(await res.json());
  if (!puzzle) throw new Error("Lichess sent a puzzle we couldn't read");
  return puzzle;
}

export function toMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** The fen after playing a UCI move, or null when it isn't legal there. */
export function playUci(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move(toMove(uci));
    return chess.fen();
  } catch {
    return null;
  }
}

/** Whether `move` is right at `step` of the solution: the expected move, or (as Lichess allows) any move that mates. */
export function isSolutionMove(fen: string, solution: string[], step: number, move: { from: string; to: string; promotion?: string }): boolean {
  const expected = solution[step];
  if (!expected) return false;
  const sameSquares = move.from === expected.slice(0, 2) && move.to === expected.slice(2, 4);
  if (sameSquares && (expected.length === 4 || (move.promotion ?? "q") === expected[4])) return true;
  try {
    const chess = new Chess(fen);
    chess.move(move);
    return chess.isCheckmate();
  } catch {
    return false;
  }
}

/** Local date as YYYY-MM-DD (the day a visitor sees, not UTC). */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Days in a row with the puzzle solved, counting back from today (or from yesterday if today isn't done yet). */
export function streakOf(history: DailyHistory, today: Date): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const solved = (d: Date) => history[dayKey(d)] === "clean" || history[dayKey(d)] === "solved";
  if (!solved(day)) day.setDate(day.getDate() - 1);
  let n = 0;
  while (solved(day)) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

export function loadDaily(storage: Pick<Storage, "getItem"> = window.localStorage): DailyHistory {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: DailyHistory = {};
    for (const [k, v] of Object.entries(raw)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && (v === "clean" || v === "solved" || v === "failed")) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Remembers how today went. A solved day is never downgraded by a later retry. */
export function saveDaily(history: DailyHistory, day: string, outcome: DailyOutcome, storage: Pick<Storage, "setItem"> = window.localStorage): DailyHistory {
  const was = history[day];
  const keep = was === "clean" || (was === "solved" && outcome === "failed");
  const next = keep ? history : { ...history, [day]: outcome };
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // not remembered; fine
  }
  return next;
}
