// The live mistake bank: kept in browser storage (and, for signed-in people, saved to their account by the sync layer).
import { useSyncExternalStore } from "react";
import { addMistakes as addTo, listMistakes, parseMistakes, type MistakeItem, type MistakeMap } from "./mistakeCore.ts";
import type { PuzzleItem } from "./puzzles.ts";
import { reportStorageProblem } from "./store.ts";

const KEY = "chess-analyzer:mistakes:v1";
const listeners = new Set<() => void>();

function read(): MistakeMap {
  try {
    return parseMistakes(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return {};
  }
}

let current = read();
let snapshot: MistakeItem[] = listMistakes(current);

function commit(next: MistakeMap): void {
  if (next === current) return;
  current = next;
  snapshot = listMistakes(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    reportStorageProblem("Your browser couldn't save your mistakes (storage is full or unavailable), so they will reset when you close this page.");
  }
  listeners.forEach((l) => l());
}

/** Re-reads the bank from browser storage, after saved data from the person's account was written into it. */
export function reloadMistakes(): void {
  current = read();
  snapshot = listMistakes(current);
  listeners.forEach((l) => l());
}

/** Adds mistakes from a reviewed game (ones already in the bank are ignored). */
export const addMistakes = (items: PuzzleItem[]): void => commit(addTo(current, items, Date.now()));

/** Empties the bank. */
export const clearMistakes = (): void => commit({});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Every saved mistake, worst first. */
export const useMistakes = (): MistakeItem[] => useSyncExternalStore(subscribe, () => snapshot);
