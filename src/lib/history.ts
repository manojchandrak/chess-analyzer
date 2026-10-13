// The live history list: kept in browser storage (and, for signed-in people, saved to their account by the sync layer).
import { useSyncExternalStore } from "react";
import type { GameRecord } from "./games.ts";
import { parseHistory, prune, recordOpened as openedIn, removeEntry as removedFrom, toggleFavorite as toggledIn, visibleEntries, type HistoryEntry, type HistoryMap } from "./historyCore.ts";
import { reportStorageProblem } from "./store.ts";

const KEY = "chess-analyzer:history:v1";
const listeners = new Set<() => void>();

function read(): HistoryMap {
  try {
    return parseHistory(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return {};
  }
}

let current = read();
let snapshot: HistoryEntry[] = visibleEntries(current);

function commit(next: HistoryMap): void {
  if (next === current) return;
  current = next;
  snapshot = visibleEntries(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    reportStorageProblem("Your browser couldn't save your game history (storage is full or unavailable), so it will reset when you close this page.");
  }
  listeners.forEach((l) => l());
}

/** Re-reads the list from browser storage, after saved data from the person's account was written into it. */
export function reloadHistory(): void {
  current = prune(read(), Date.now());
  snapshot = visibleEntries(current);
  listeners.forEach((l) => l());
}

export const recordOpened = (game: GameRecord): void => commit(openedIn(current, game, Date.now()));
export const toggleFavorite = (game: GameRecord): void => commit(toggledIn(current, game, Date.now()));
export const removeFromHistory = (id: string): void => commit(removedFrom(current, id, Date.now()));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The games opened for analysis, newest first (favourites included). */
export const useHistory = (): HistoryEntry[] => useSyncExternalStore(subscribe, () => snapshot);

/** The ids of the favourite games, to show a filled star in lists. */
export function useFavoriteIds(): Set<string> {
  const entries = useHistory();
  return favoriteIdsOf(entries);
}

let lastEntries: HistoryEntry[] | null = null;
let lastIds = new Set<string>();
function favoriteIdsOf(entries: HistoryEntry[]): Set<string> {
  if (entries !== lastEntries) {
    lastEntries = entries;
    lastIds = new Set(entries.filter((e) => e.favorite).map((e) => e.id));
  }
  return lastIds;
}
