// Per-game review numbers for the profiled player (you, or the legend), used to
// sort game lists by brilliancies, accuracy or performance. Saved in the browser
// so they survive reloads; every review, from any screen, adds to the same store.
import { useSyncExternalStore } from "react";
import type { AnalysisResult } from "./analyze";
import { estimateRating } from "./rating";

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

export function setGameStats(gameId: string, value: GameStats): void {
  stats = new Map(stats).set(gameId, value);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(stats)));
  } catch {
    // storage full or unavailable: kept for this visit only
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
