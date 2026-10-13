// The list of games a person opened for analysis, and which of them they marked as favourites, for Lichess and Chess.com
// games. Entries are keyed by the site-prefixed game id ("lichess:abc123", "chesscom:<id>"), so the two sites never clash.
// These are plain functions on plain data; history.ts keeps the live copy in browser storage.
import type { GameRecord } from "./games.ts";

export interface HistoryEntry {
  id: string;
  /** The game, without its heavy per-move evaluations and clocks. Null for a removed entry. */
  game: GameRecord | null;
  favorite: boolean;
  /** Whether the game was ever opened for analysis. A game that was only starred leaves the list when un-starred. */
  opened: boolean;
  /** When the game was last opened (or first favourited), in ms. Newest first in the list. */
  openedAt: number;
  /** When this entry last changed, in ms. The newest change wins when two devices disagree. */
  updatedAt: number;
  /** A removed entry is kept for a while so the removal reaches the person's other devices. */
  removed?: boolean;
}

export type HistoryMap = Record<string, HistoryEntry>;

/** How many opened-but-not-favourite games are kept. Favourites are never dropped to make room. */
export const MAX_RECENT = 300;
const REMOVED_KEPT_MS = 90 * 86_400_000;

/** Only games from the two sites are kept (not pasted PGNs or the legends' collections). */
export const trackable = (g: Pick<GameRecord, "source">): boolean => g.source === "lichess" || g.source === "chesscom";

const slim = (g: GameRecord): GameRecord => ({ ...g, evals: null, clocks: null });
const active = (e: HistoryEntry | undefined): e is HistoryEntry => !!e && !e.removed && !!e.game;

/** Reads stored history, ignoring anything that isn't a well-formed entry. */
export function parseHistory(raw: unknown): HistoryMap {
  const out: HistoryMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!e || typeof e !== "object") continue;
    const x = e as Partial<HistoryEntry>;
    if (typeof x.updatedAt !== "number" || typeof x.openedAt !== "number") continue;
    if (x.removed) out[id] = { id, game: null, favorite: false, opened: false, openedAt: x.openedAt, updatedAt: x.updatedAt, removed: true };
    else if (x.game && typeof x.game === "object" && typeof (x.game as GameRecord).id === "string") out[id] = { id, game: x.game, favorite: x.favorite === true, opened: x.opened !== false, openedAt: x.openedAt, updatedAt: x.updatedAt };
  }
  return out;
}

/** Drops removals that have had time to reach every device, and retires the oldest non-favourites beyond the limit. */
export function prune(map: HistoryMap, now: number): HistoryMap {
  const next: HistoryMap = {};
  for (const [id, e] of Object.entries(map)) if (!e.removed || now - e.updatedAt < REMOVED_KEPT_MS) next[id] = e;
  const recent = Object.values(next)
    .filter((e) => active(e) && !e.favorite)
    .sort((a, b) => b.openedAt - a.openedAt);
  for (const e of recent.slice(MAX_RECENT)) next[e.id] = { id: e.id, game: null, favorite: false, opened: false, openedAt: e.openedAt, updatedAt: now, removed: true };
  return next;
}

/** A game was opened for analysis: add it (or move it to the top), keeping its favourite mark. */
export function recordOpened(map: HistoryMap, game: GameRecord, now: number): HistoryMap {
  if (!trackable(game)) return map;
  const prev = map[game.id];
  return prune({ ...map, [game.id]: { id: game.id, game: slim(game), favorite: active(prev) ? prev.favorite : false, opened: true, openedAt: now, updatedAt: now } }, now);
}

/** Marks a game as a favourite, or clears the mark. A game never opened is added to the list. */
export function toggleFavorite(map: HistoryMap, game: GameRecord, now: number): HistoryMap {
  if (!trackable(game)) return map;
  const prev = map[game.id];
  const was = active(prev) && prev.favorite;
  // Un-starring a game that was never opened takes it back out of the list.
  if (was && !prev.opened) return removeEntry(map, game.id, now);
  return prune({ ...map, [game.id]: { id: game.id, game: active(prev) ? prev.game : slim(game), favorite: !was, opened: active(prev) ? prev.opened : false, openedAt: active(prev) ? prev.openedAt : now, updatedAt: now } }, now);
}

/** Takes a game out of the list (and its favourite mark with it). */
export function removeEntry(map: HistoryMap, id: string, now: number): HistoryMap {
  const prev = map[id];
  if (!prev) return map;
  return { ...map, [id]: { id, game: null, favorite: false, opened: false, openedAt: prev.openedAt, updatedAt: now, removed: true } };
}

/** The entries to show, newest first. */
export function visibleEntries(map: HistoryMap): HistoryEntry[] {
  return Object.values(map)
    .filter(active)
    .sort((a, b) => b.openedAt - a.openedAt);
}

/** Combines two devices' lists: for each game the most recent change wins (this device's, on a tie). */
export function mergeHistory(local: HistoryMap, remote: HistoryMap): HistoryMap {
  const merged: HistoryMap = { ...remote };
  for (const [id, e] of Object.entries(local)) {
    const other = merged[id];
    if (!other || e.updatedAt >= other.updatedAt) merged[id] = e;
  }
  return merged;
}
