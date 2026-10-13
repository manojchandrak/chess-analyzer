import { describe, expect, it } from "vitest";
import type { GameStats } from "../gameStats";
import { averages, collectProgress, filterProgress, highlights, monthlyTrend, recentForm, timeClassesIn, type ProgressGame } from "../progress";

const stats = (over: Partial<GameStats> = {}): GameStats => ({ accuracy: 80, performance: 1800, brilliant: 0, great: 1, best: 10, inaccuracies: 2, mistakes: 1, blunders: 1, ...over });

describe("collectProgress", () => {
  it("dates a game from its saved numbers, or from the games the app knows about", () => {
    const map = new Map<string, GameStats>([
      ["lichess:a", stats({ date: "2026-09-03", score: 1, tc: "blitz" })],
      ["chesscom:b", stats()], // saved before dates were recorded
    ]);
    const known = [{ id: "chesscom:b", date: "2026-10-05", result: "0-1", playerColor: "w" as const, timeClass: "rapid" as const }];
    const { games, undated } = collectProgress(map, known);
    expect(undated).toBe(0);
    expect(games.map((g) => [g.id, g.month, g.site, g.timeClass, g.score])).toEqual([
      ["lichess:a", "2026-09", "lichess", "blitz", 1],
      ["chesscom:b", "2026-10", "chesscom", "rapid", 0],
    ]);
  });

  it("counts games it can't place on a timeline, and ignores games that aren't the player's own", () => {
    const map = new Map<string, GameStats>([
      ["lichess:a", stats()], // no date anywhere
      ["lichess:y", stats({ date: "1999" })], // only a year
      ["morphy-12", stats({ date: "1858-01-01" })], // a legend's game
      ["lichess:ok", stats({ date: "2026-10-01" })],
    ]);
    const { games, undated } = collectProgress(map, []);
    expect(games.map((g) => g.id)).toEqual(["lichess:ok"]);
    expect(undated).toBe(2);
  });

  it("orders games by date", () => {
    const map = new Map<string, GameStats>([
      ["lichess:b", stats({ date: "2026-10-09" })],
      ["lichess:a", stats({ date: "2026-08-01" })],
    ]);
    expect(collectProgress(map, []).games.map((g) => g.id)).toEqual(["lichess:a", "lichess:b"]);
  });
});

const game = (id: string, date: string, over: Partial<GameStats> = {}, extra: Partial<ProgressGame> = {}): ProgressGame => ({
  id,
  date,
  month: date.slice(0, 7),
  site: id.startsWith("chesscom") ? "chesscom" : "lichess",
  timeClass: "blitz",
  score: 1,
  stats: stats(over),
  ...extra,
});

describe("filterProgress", () => {
  const games = [game("lichess:1", "2026-04-10"), game("chesscom:2", "2026-09-10", {}, { timeClass: "rapid" }), game("lichess:3", "2026-10-10")];
  const all = { site: "all", timeClass: "all", months: null } as const;

  it("filters by site and time control", () => {
    expect(filterProgress(games, { ...all, site: "chesscom" }).map((g) => g.id)).toEqual(["chesscom:2"]);
    expect(filterProgress(games, { ...all, timeClass: "blitz" }).map((g) => g.id)).toEqual(["lichess:1", "lichess:3"]);
  });

  it("keeps only the last few months, counting the current one", () => {
    const now = new Date(2026, 9, 15); // 15 Oct 2026
    expect(filterProgress(games, { ...all, months: 1 }, now).map((g) => g.id)).toEqual(["lichess:3"]);
    expect(filterProgress(games, { ...all, months: 2 }, now).map((g) => g.id)).toEqual(["chesscom:2", "lichess:3"]);
    expect(filterProgress(games, { ...all, months: 12 }, now).length).toBe(3);
  });
});

describe("averages and monthly trend", () => {
  it("averages accuracy, blunders and score, skipping unknowns", () => {
    const a = averages([game("lichess:1", "2026-10-01", { accuracy: 70, blunders: 3, performance: 1500 }, { score: 0 }), game("lichess:2", "2026-10-02", { accuracy: 90, blunders: 1, performance: 0 }, { score: 1 }), game("lichess:3", "2026-10-03", { accuracy: 80 }, { score: null })]);
    expect(a.games).toBe(3);
    expect(a.accuracy).toBe(80);
    expect(a.performance).toBe(1650); // the game with no rating estimate is left out of that average
    expect(a.blundersPerGame).toBe(1.67);
    expect(a.scorePct).toBe(50);
  });

  it("returns nothing to show for no games", () => {
    expect(averages([])).toMatchObject({ games: 0, accuracy: null, performance: null, blundersPerGame: null, scorePct: null });
  });

  it("groups by month, oldest first, with readable labels", () => {
    const trend = monthlyTrend([game("lichess:1", "2026-10-01", { accuracy: 80 }), game("lichess:2", "2026-08-05", { accuracy: 60 }), game("lichess:3", "2026-08-20", { accuracy: 70 })]);
    expect(trend.map((p) => [p.key, p.label, p.games, p.accuracy])).toEqual([
      ["2026-08", "Aug 26", 2, 65],
      ["2026-10", "Oct 26", 1, 80],
    ]);
  });
});

describe("recentForm", () => {
  const run = (n: number, from: number, acc: number, blunders: number) => Array.from({ length: n }, (_, i) => game(`lichess:${from + i}`, `2026-0${1 + Math.floor((from + i) / 10)}-${String(1 + ((from + i) % 28)).padStart(2, "0")}`, { accuracy: acc, blunders }));

  it("compares the latest games with the same number before them", () => {
    const f = recentForm([...run(20, 0, 70, 3), ...run(20, 20, 78, 1)]);
    expect(f.accuracyChange).toBe(8);
    expect(f.blunderChange).toBe(-2);
    expect(f.direction).toBe("improving");
  });

  it("reports slipping and steady play", () => {
    expect(recentForm([...run(20, 0, 80, 1), ...run(20, 20, 74, 2)]).direction).toBe("declining");
    expect(recentForm([...run(20, 0, 80, 1), ...run(20, 20, 80.4, 1)]).direction).toBe("steady");
  });

  it("won't compare without enough games on both sides", () => {
    expect(recentForm(run(8, 0, 70, 2)).previous).toBeNull();
    expect(recentForm(run(8, 0, 70, 2)).direction).toBeNull();
    expect(recentForm([...run(3, 0, 70, 2), ...run(20, 3, 75, 1)], 20).previous).toBeNull();
  });
});

describe("highlights and filters", () => {
  it("picks the most accurate game and the one with the most brilliant moves", () => {
    const h = highlights([game("lichess:1", "2026-10-01", { accuracy: 70 }), game("lichess:2", "2026-10-02", { accuracy: 92, great: 0 }), game("lichess:3", "2026-10-03", { accuracy: 75, brilliant: 2, great: 1 })]);
    expect(h.bestAccuracy?.id).toBe("lichess:2");
    expect(h.mostBrilliant?.id).toBe("lichess:3");
  });

  it("shows no brilliant highlight when there were none", () => {
    expect(highlights([game("lichess:1", "2026-10-01", { brilliant: 0, great: 0 })]).mostBrilliant).toBeNull();
    expect(highlights([])).toEqual({ bestAccuracy: null, mostBrilliant: null });
  });

  it("lists only the time controls that occur, in a fixed order", () => {
    expect(timeClassesIn([game("lichess:1", "2026-10-01", {}, { timeClass: "rapid" }), game("lichess:2", "2026-10-02", {}, { timeClass: "bullet" }), game("lichess:3", "2026-10-03", {}, { timeClass: null })])).toEqual(["bullet", "rapid"]);
  });
});
