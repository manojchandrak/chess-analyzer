// Filters for the "recent games" list: which site, which colour, how it ended and the time control.
import { scoreFor, type GameRecord, type TimeClass } from "./games.ts";

export interface GameFilter {
  source: "all" | "lichess" | "chesscom";
  color: "all" | "w" | "b";
  result: "all" | "win" | "draw" | "loss";
  timeClass: "all" | TimeClass;
}

export const NO_FILTER: GameFilter = { source: "all", color: "all", result: "all", timeClass: "all" };

const SOURCES = ["all", "lichess", "chesscom"];
const COLORS = ["all", "w", "b"];
const RESULTS = ["all", "win", "draw", "loss"];
const TIME_CLASSES = ["all", "bullet", "blitz", "rapid", "classical", "daily"];

/** A saved filter, with anything unrecognised reset to "all" so old or edited storage can't break the list. */
export function cleanFilter(raw: unknown): GameFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: string[]): T => (typeof value === "string" && allowed.includes(value) ? (value as T) : ("all" as T));
  return { source: pick(r.source, SOURCES), color: pick(r.color, COLORS), result: pick(r.result, RESULTS), timeClass: pick(r.timeClass, TIME_CLASSES) };
}

export function isFiltered(f: GameFilter): boolean {
  return f.source !== "all" || f.color !== "all" || f.result !== "all" || f.timeClass !== "all";
}

export function filterGames(games: GameRecord[], f: GameFilter): GameRecord[] {
  if (!isFiltered(f)) return games;
  return games.filter((g) => {
    if (f.source !== "all" && g.source !== f.source) return false;
    if (f.timeClass !== "all" && g.timeClass !== f.timeClass) return false;
    if (f.color !== "all" && g.playerColor !== f.color) return false;
    if (f.result !== "all") {
      const score = g.playerColor ? scoreFor(g.result, g.playerColor) : null;
      const outcome = score === 1 ? "win" : score === 0.5 ? "draw" : score === 0 ? "loss" : null;
      if (outcome !== f.result) return false;
    }
    return true;
  });
}
