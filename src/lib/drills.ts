// How drill moves are judged, and which drill to practise next (a simple
// spaced-repetition schedule kept in the browser).
import { useSyncExternalStore } from "react";
import { toCentipawns } from "./accuracy.ts";
import type { Drill, DrillPhase, PositionDrill } from "./drillData.ts";
import type { EngineEval } from "./engine.ts";

/** Depth the engine grades moves and picks replies at. */
export const DRILL_DEPTH = 14;

/** Flips an eval to the other side's point of view. */
export function flip(e: EngineEval): EngineEval {
  return { cp: e.cp === null ? null : -e.cp, mate: e.mate === null ? null : -e.mate, best: null };
}

/** True when the opponent has only a king left and you still have a rook or
 * queen: as good as promoting. `board` is chess.js's board(). */
export function bareKingWin(board: ({ type: string; color: string } | null)[][], side: "w" | "b"): boolean {
  const pieces = board.flat().filter((p) => p !== null);
  return pieces.every((p) => p.color === side || p.type === "k") && pieces.some((p) => p.color === side && (p.type === "q" || p.type === "r"));
}

/** The solution's next move for you, while the moves played so far follow it. */
export function solutionMove(drill: PositionDrill, played: string[]): string | null {
  const sol = drill.solution;
  if (!sol || played.length >= sol.length || played.some((m, i) => m !== sol[i])) return null;
  return sol[played.length];
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * Judges a move in a position drill.
 * @param before engine eval with you to move (your point of view)
 * @param after engine eval of the position after your move (opponent's point of view)
 * @param movesLeft your moves left in the budget, counting this one
 */
export function judgeMove(drill: PositionDrill, before: EngineEval, after: EngineEval, movesLeft: number): Verdict {
  const mine = flip(after);
  if (drill.grade.mode === "best") {
    // A mate drill (or a position with a mate that fits the budget) only
    // accepts moves that keep a mate the budget still covers.
    if (drill.goal === "mate" || (before.mate !== null && before.mate > 0 && before.mate <= movesLeft)) {
      const stillMate = mine.mate !== null && mine.mate > 0 && mine.mate <= movesLeft - 1;
      return stillMate ? { ok: true } : { ok: false, reason: "That misses the forced mate. Look for checks." };
    }
    const lost = toCentipawns(before) - toCentipawns(mine);
    if (lost <= drill.grade.tol) return { ok: true };
    return { ok: false, reason: "There's something stronger here. Look for checks, captures and threats." };
  }
  if (toCentipawns(mine) >= drill.grade.min) return { ok: true };
  return { ok: false, reason: drill.grade.min > 0 ? "That lets the win slip away." : "That loses. Find a move that holds." };
}

// ---------- Progress ----------

export type Result = "clean" | "solved" | "failed";

export interface DrillRecord {
  /** Leitner box: 0 = keep practising, 5 = well known. */
  box: number;
  attempts: number;
  clean: number;
  last: number;
  due: number;
  lastResult: Result;
}

const KEY = "chess-analyzer:drills:v1";
const DAY = 86_400_000;
/** Days until a drill comes back, by box. */
const INTERVALS = [0, 1, 3, 7, 16, 35];
/** Box at which a drill counts as mastered. */
export const MASTERED_BOX = 3;

type Progress = Record<string, DrillRecord>;
const listeners = new Set<() => void>();

function read(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

let current = read();

export function recordResult(id: string, result: Result, now = Date.now()): void {
  const prev = current[id];
  const box = result === "clean" ? Math.min(5, (prev?.box ?? 0) + 1) : result === "solved" ? Math.min(prev?.box ?? 0, 1) : 0;
  // Anything not solved cleanly comes back within the session.
  const due = result === "clean" ? now + INTERVALS[box] * DAY : now + 5 * 60_000;
  current = {
    ...current,
    [id]: { box, attempts: (prev?.attempts ?? 0) + 1, clean: (prev?.clean ?? 0) + (result === "clean" ? 1 : 0), last: now, due, lastResult: result },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // not remembered across visits
  }
  listeners.forEach((l) => l());
}

export function resetProgress(ids: string[]): void {
  current = Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id)));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useDrillProgress(): Progress {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export type DrillStatus = "new" | "due" | "learning" | "mastered";

export function drillStatus(rec: DrillRecord | undefined, now = Date.now()): DrillStatus {
  if (!rec) return "new";
  if (rec.due <= now) return "due";
  return rec.box >= MASTERED_BOX ? "mastered" : "learning";
}

/** The drill to practise next: anything due (weakest first), then new ones in
 * order, then whatever comes back soonest. */
export function nextDrill(drills: Drill[], progress: Progress, exclude?: string, now = Date.now()): Drill | null {
  const pool = drills.filter((d) => d.id !== exclude);
  const due = pool.filter((d) => progress[d.id] && progress[d.id].due <= now).sort((a, b) => progress[a.id].box - progress[b.id].box || progress[a.id].due - progress[b.id].due);
  if (due.length) return due[0];
  const fresh = pool.find((d) => !progress[d.id]);
  if (fresh) return fresh;
  return [...pool].sort((a, b) => progress[a.id].due - progress[b.id].due)[0] ?? null;
}

export interface PhaseProgress {
  total: number;
  mastered: number;
  due: number;
  fresh: number;
}

export function phaseProgress(drills: Drill[], phase: DrillPhase, progress: Progress, now = Date.now()): PhaseProgress {
  const ds = drills.filter((d) => d.phase === phase);
  const statuses = ds.map((d) => drillStatus(progress[d.id], now));
  return { total: ds.length, mastered: statuses.filter((s) => s === "mastered").length, due: statuses.filter((s) => s === "due").length, fresh: statuses.filter((s) => s === "new").length };
}
