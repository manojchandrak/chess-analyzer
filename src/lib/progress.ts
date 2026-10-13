// Progress over time, drawn from the per-game numbers saved when games are reviewed (accuracy, estimated performance,
// blunders, mistakes, brilliant moves, result, date, time control). Plain functions on plain data.
import { scoreFor, type GameRecord, type TimeClass } from "./games.ts";
import type { GameStats } from "./gameStats.ts";
import { monthLabel } from "./trends.ts";

export type SiteFilter = "all" | "lichess" | "chesscom";

export interface ProgressGame {
  id: string;
  /** As recorded: "2026-10-12", or "2026-10" when only the month is known. */
  date: string;
  /** "2026-10" */
  month: string;
  site: "lichess" | "chesscom";
  timeClass: TimeClass | null;
  /** 1, 0.5 or 0 for the player, when known. */
  score: number | null;
  stats: GameStats;
}

type Known = Pick<GameRecord, "id" | "date" | "result" | "playerColor" | "timeClass">;

/** Turns saved review numbers into dated games. A game whose date isn't in its saved numbers takes it from the games the app
 * knows about (the history list). Games with no usable month are counted but can't be placed on a timeline. */
export function collectProgress(stats: Map<string, GameStats>, known: Known[]): { games: ProgressGame[]; undated: number } {
  const byId = new Map(known.map((k) => [k.id, k]));
  const games: ProgressGame[] = [];
  let undated = 0;
  for (const [id, s] of stats) {
    const site = id.startsWith("lichess:") ? "lichess" : id.startsWith("chesscom:") ? "chesscom" : null;
    if (!site) continue; // only the person's own games, not a legend's or a pasted PGN
    const k = byId.get(id);
    const date = s.date ?? k?.date ?? null;
    const month = date?.match(/^(\d{4}-\d{2})/)?.[1];
    if (!date || !month) {
      undated++;
      continue;
    }
    const score = s.score ?? (k?.playerColor ? scoreFor(k.result, k.playerColor) : null);
    games.push({ id, date, month, site, timeClass: s.tc ?? k?.timeClass ?? null, score, stats: s });
  }
  games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { games, undated };
}

export interface ProgressFilter {
  site: SiteFilter;
  timeClass: TimeClass | "all";
  /** Only the last this-many months (counting the current one); null for everything. */
  months: number | null;
}

export function filterProgress(games: ProgressGame[], f: ProgressFilter, now = new Date()): ProgressGame[] {
  let cutoff = "";
  if (f.months !== null) {
    const d = new Date(now.getFullYear(), now.getMonth() - (f.months - 1), 1);
    cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return games.filter((g) => (f.site === "all" || g.site === f.site) && (f.timeClass === "all" || g.timeClass === f.timeClass) && g.month >= cutoff);
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Averages {
  games: number;
  accuracy: number | null;
  performance: number | null;
  blundersPerGame: number | null;
  mistakesPerGame: number | null;
  inaccuraciesPerGame: number | null;
  /** Brilliant and great moves per game. */
  greatPerGame: number | null;
  /** Points per game as a percentage (a win is 100, a draw 50), over the games whose result is known. */
  scorePct: number | null;
}

export function averages(games: ProgressGame[]): Averages {
  const r = (n: number | null, dp = 1) => (n === null ? null : round(n, dp));
  const scores = games.map((g) => g.score).filter((s): s is number => s !== null);
  return {
    games: games.length,
    accuracy: r(mean(games.map((g) => g.stats.accuracy))),
    performance: (() => {
      const p = mean(games.map((g) => g.stats.performance).filter((v) => v > 0));
      return p === null ? null : Math.round(p);
    })(),
    blundersPerGame: r(mean(games.map((g) => g.stats.blunders)), 2),
    mistakesPerGame: r(mean(games.map((g) => g.stats.mistakes)), 2),
    inaccuraciesPerGame: r(mean(games.map((g) => g.stats.inaccuracies)), 2),
    greatPerGame: r(mean(games.map((g) => g.stats.brilliant + g.stats.great)), 2),
    scorePct: scores.length ? Math.round((mean(scores) ?? 0) * 100) : null,
  };
}

export interface MonthPoint extends Averages {
  key: string;
  label: string;
}

/** The games grouped by the month they were played, oldest first. */
export function monthlyTrend(games: ProgressGame[]): MonthPoint[] {
  const byMonth = new Map<string, ProgressGame[]>();
  for (const g of games) byMonth.set(g.month, [...(byMonth.get(g.month) ?? []), g]);
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, gs]) => ({ key, label: monthLabel(key), ...averages(gs) }));
}

export interface Form {
  recent: Averages;
  /** The same number of games just before the recent ones; null when there aren't enough to compare. */
  previous: Averages | null;
  accuracyChange: number | null;
  blunderChange: number | null;
  direction: "improving" | "declining" | "steady" | null;
}

/** How the latest games compare with the ones before them (by default 20 against 20). Needs at least 5 in each group. */
export function recentForm(games: ProgressGame[], window = 20): Form {
  const recentGames = games.slice(-window);
  const previousGames = games.slice(-window * 2, -window);
  const recent = averages(recentGames);
  if (recentGames.length < 5 || previousGames.length < 5) return { recent, previous: null, accuracyChange: null, blunderChange: null, direction: null };
  const previous = averages(previousGames);
  const accuracyChange = recent.accuracy !== null && previous.accuracy !== null ? round(recent.accuracy - previous.accuracy) : null;
  const blunderChange = recent.blundersPerGame !== null && previous.blundersPerGame !== null ? round(recent.blundersPerGame - previous.blundersPerGame, 2) : null;
  const direction = accuracyChange === null ? null : accuracyChange >= 1 ? "improving" : accuracyChange <= -1 ? "declining" : "steady";
  return { recent, previous, accuracyChange, blunderChange, direction };
}

export interface Highlights {
  bestAccuracy: ProgressGame | null;
  mostBrilliant: ProgressGame | null;
}

export function highlights(games: ProgressGame[]): Highlights {
  const best = (score: (g: ProgressGame) => number) => games.reduce<ProgressGame | null>((top, g) => (top === null || score(g) > score(top) ? g : top), null);
  const mostBrilliant = best((g) => g.stats.brilliant * 2 + g.stats.great);
  return { bestAccuracy: best((g) => g.stats.accuracy), mostBrilliant: mostBrilliant && mostBrilliant.stats.brilliant + mostBrilliant.stats.great > 0 ? mostBrilliant : null };
}

/** The time controls that appear in the games, in a fixed order, for the filter. */
export function timeClassesIn(games: ProgressGame[]): TimeClass[] {
  const order: TimeClass[] = ["bullet", "blitz", "rapid", "classical", "daily"];
  return order.filter((t) => games.some((g) => g.timeClass === t));
}
