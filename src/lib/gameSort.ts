// Sorting for the games table: by any column (click its header) or by a named preset (the Sort menu).
import { ecoFamily } from "./eco.ts";
import { gameLength, scoreFor, type GameRecord } from "./games.ts";
import type { GameStats } from "./gameStats.ts";

export type SortBy = "date" | "opponent" | "result" | "opening" | "brilliant" | "great" | "accuracy" | "performance" | "blunders" | "length";
export type Direction = "asc" | "desc";
export interface Sort {
  by: SortBy;
  dir: Direction;
}

/** The direction a column sorts in the first time it is clicked: best, newest or strongest first. */
export const DEFAULT_DIRECTION: Record<SortBy, Direction> = {
  date: "desc",
  opponent: "desc",
  result: "desc",
  opening: "asc",
  brilliant: "desc",
  great: "desc",
  accuracy: "desc",
  performance: "desc",
  blunders: "desc",
  length: "desc",
};

/** Sorts that come from the engine review: only reviewed games can be ranked by them. */
export const needsReview = (by: SortBy) => by === "brilliant" || by === "great" || by === "accuracy" || by === "performance" || by === "blunders";

export const PRESETS: { id: string; label: string; sort: Sort }[] = [
  { id: "newest", label: "Newest first", sort: { by: "date", dir: "desc" } },
  { id: "oldest", label: "Oldest first", sort: { by: "date", dir: "asc" } },
  { id: "result", label: "Wins first", sort: { by: "result", dir: "desc" } },
  { id: "brilliant", label: "Most brilliant moves", sort: { by: "brilliant", dir: "desc" } },
  { id: "great", label: "Most great moves", sort: { by: "great", dir: "desc" } },
  { id: "accuracy", label: "Highest accuracy", sort: { by: "accuracy", dir: "desc" } },
  { id: "performance", label: "Best game performance", sort: { by: "performance", dir: "desc" } },
  { id: "fewestBlunders", label: "Fewest blunders", sort: { by: "blunders", dir: "asc" } },
  { id: "mostBlunders", label: "Most blunders", sort: { by: "blunders", dir: "desc" } },
  { id: "opponent", label: "Strongest opponent", sort: { by: "opponent", dir: "desc" } },
  { id: "longest", label: "Longest games", sort: { by: "length", dir: "desc" } },
];

/** The preset that matches a sort exactly, or null (a column sorted in a way the menu doesn't list). */
export const presetOf = (sort: Sort): string | null => PRESETS.find((p) => p.sort.by === sort.by && p.sort.dir === sort.dir)?.id ?? null;

/** What clicking a column header does: a new column starts in its default direction, the same one flips. */
export function toggleSort(current: Sort, by: SortBy): Sort {
  if (current.by !== by) return { by, dir: DEFAULT_DIRECTION[by] };
  return { by, dir: current.dir === "asc" ? "desc" : "asc" };
}

export const openingLabel = (g: GameRecord): string => g.opening ?? ecoFamily(g.eco) ?? g.eco ?? "";
const opponentElo = (g: GameRecord): number | null => (g.playerColor === "b" ? g.whiteElo : g.blackElo) ?? null;

/** How a reviewed game ranks for a review-based sort (bigger is more). */
const STAT_VALUE: Record<string, (s: GameStats) => number> = {
  brilliant: (s) => s.brilliant * 1000 + s.great * 10 + s.accuracy / 10,
  great: (s) => s.great * 1000 + s.brilliant * 10 + s.accuracy / 10,
  accuracy: (s) => s.accuracy,
  performance: (s) => s.performance,
  blunders: (s) => s.blunders * 1000 + s.mistakes * 10 + (100 - s.accuracy) / 100,
};

const newestFirst = (a: GameRecord, b: GameRecord) => (b.date ?? "").localeCompare(a.date ?? "");

/** Compares two values in a direction, always putting missing values last whatever the direction. */
function compare<T extends number | string>(a: T | null, b: T | null, dir: Direction): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const c = typeof a === "number" ? a - (b as number) : a.localeCompare(b as string);
  return dir === "asc" ? c : -c;
}

/** The games in the requested order (a new array). Ties fall back to newest first. */
export function sortGames(games: GameRecord[], stats: Map<string, GameStats>, sort: Sort): GameRecord[] {
  const list = [...games];
  const { by, dir } = sort;

  if (needsReview(by)) {
    // Reviewed games ranked by the sort; games that haven't been reviewed yet follow, newest first.
    const value = STAT_VALUE[by];
    return list.sort((a, b) => {
      const sa = stats.get(a.id);
      const sb = stats.get(b.id);
      if (sa && sb) return compare(value(sa), value(sb), dir) || newestFirst(a, b);
      if (sa || sb) return sa ? -1 : 1;
      return newestFirst(a, b);
    });
  }

  const key = (g: GameRecord): number | string | null => {
    switch (by) {
      case "date":
        return g.date ?? null;
      case "opponent":
        return opponentElo(g);
      case "result": {
        const score = scoreFor(g.result, g.playerColor ?? "w");
        return score;
      }
      case "opening":
        return openingLabel(g) || null;
      case "length":
        return gameLength(g);
      default:
        return null;
    }
  };
  return list.sort((a, b) => compare(key(a), key(b), dir) || newestFirst(a, b));
}
