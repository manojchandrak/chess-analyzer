// Per-game review numbers for the profiled player (you, or the legend), used to
// sort game lists by brilliancies, accuracy or performance. Saved in the browser
// so they survive reloads; every review, from any screen, adds to the same store.
import { useSyncExternalStore } from "react";
import type { AnalysisResult } from "./analyze";
import { estimateRating } from "./rating";
import { reportStorageProblem } from "./store";

export interface GameStats {
  accuracy: number;
  /** Estimated performance rating from average centipawn loss. */
  performance: number;
  brilliant: number;
  great: number;
  best: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

const KEY = "chess-analyzer:stats:v1";
const listeners = new Set<() => void>();

function load(): Map<string, GameStats> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, GameStats>));
  } catch {
    return new Map();
  }
}

let stats = load();

export function statsFromAnalysis(analysis: AnalysisResult, color: "w" | "b"): GameStats {
  const p = color === "w" ? analysis.white : analysis.black;
  const c = p.classCounts;
  return {
    accuracy: p.overall.accuracy ?? 0,
    performance: p.overall.averageCpLoss !== null ? estimateRating(p.overall.averageCpLoss) : 0,
    brilliant: c.brilliant,
    great: c.great,
    best: c.best,
    inaccuracies: c.inaccuracy,
    mistakes: c.mistake + c.miss,
    blunders: c.blunder,
  };
}

let pending: Map<string, GameStats> | null = null;

/** Whether numbers are already saved (or about to be saved) for a game. */
export const hasGameStats = (gameId: string): boolean => stats.has(gameId) || !!pending?.has(gameId);

/** Records a game's stats. Updates are batched (a review of thousands of games
 * saves and redraws a few times a second, not once per game). */
export function setGameStats(gameId: string, value: GameStats): void {
  if (!pending) {
    pending = new Map();
    setTimeout(flush, 250);
  }
  pending.set(gameId, value);
}

function flush(): void {
  if (!pending) return;
  stats = new Map([...stats, ...pending]);
  pending = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(stats)));
  } catch {
    reportStorageProblem("Your browser couldn't save your game ratings (storage is full or unavailable), so sorting by them will reset when you close this page.");
  }
  listeners.forEach((l) => l());
}

export function useGameStats(): Map<string, GameStats> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stats,
  );
}
