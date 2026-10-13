import { useMemo, useState } from "react";
import { useAuth } from "../lib/forum/auth-context";
import type { GameRecord, TimeClass } from "../lib/games";
import { useGameStats } from "../lib/gameStats";
import { useHistory } from "../lib/history";
import { averages, collectProgress, filterProgress, highlights, monthlyTrend, recentForm, timeClassesIn, type ProgressFilter, type ProgressGame, type SiteFilter } from "../lib/progress";
import { LineChart } from "./LineChart";

const RANGES: { label: string; months: number | null }[] = [
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "12 months", months: 12 },
  { label: "All time", months: null },
];
const SITES: { id: SiteFilter; label: string }[] = [
  { id: "all", label: "Both sites" },
  { id: "lichess", label: "Lichess" },
  { id: "chesscom", label: "Chess.com" },
];
const RESULT = { 1: "Win", 0.5: "Draw", 0: "Loss" } as const;

const signed = (n: number, dp = 1) => `${n > 0 ? "+" : ""}${n.toFixed(dp)}`;

function Card({ label, value, note, tone }: { label: string; value: string; note?: string | null; tone?: "good" | "bad" }) {
  return (
    <div className="card progress-card">
      <span className="muted small">{label}</span>
      <strong className="progress-value">{value}</strong>
      {note && <span className={`small ${tone === "good" ? "trend-up" : tone === "bad" ? "trend-down" : "muted"}`}>{note}</span>}
    </div>
  );
}

/** How your play changes over time, from the games Stockfish has reviewed: accuracy, estimated performance, blunders and results,
 * by month and over your latest games. Saved on this device and, when logged in, to the account. */
export function ProgressView({ onOpen }: { onOpen: (game: GameRecord) => void }) {
  const stats = useGameStats();
  const entries = useHistory();
  const { session } = useAuth();
  const [filter, setFilter] = useState<ProgressFilter>({ site: "all", timeClass: "all", months: null });

  const records = useMemo(() => new Map(entries.flatMap((e) => (e.game ? [[e.id, e.game] as const] : []))), [entries]);
  const { all, undated } = useMemo(() => {
    const { games, undated: n } = collectProgress(stats, [...records.values()]);
    return { all: games, undated: n };
  }, [stats, records]);
  const games = useMemo(() => filterProgress(all, filter), [all, filter]);
  const timeClasses = useMemo(() => timeClassesIn(all), [all]);
  const avg = useMemo(() => averages(games), [games]);
  const trend = useMemo(() => monthlyTrend(games), [games]);
  const form = useMemo(() => recentForm(games), [games]);
  const best = useMemo(() => highlights(games), [games]);
  const recent = useMemo(() => [...games].reverse().slice(0, 10), [games]);

  const describe = (g: ProgressGame) => {
    const r = records.get(g.id);
    return r ? `${r.white} vs ${r.black}` : g.id.replace(/^(lichess|chesscom):/, "$1 ");
  };
  const openButton = (g: ProgressGame) => {
    const r = records.get(g.id);
    return r ? (
      <button className="btn btn-ghost" onClick={() => onOpen(r)}>
        Open
      </button>
    ) : null;
  };

  if (all.length === 0) {
    return (
      <section className="progress">
        <h2>Your progress</h2>
        <p className="muted intro">
          Nothing to chart yet. Every time Stockfish reviews one of your Lichess or Chess.com games (open a game from My games, or use the Review button there), its accuracy, mistakes and result are saved, and your progress over time appears here.
          {undated > 0 ? ` ${undated} reviewed ${undated === 1 ? "game doesn't" : "games don't"} have a date yet; load your games in My games to fill them in.` : ""}
        </p>
      </section>
    );
  }

  const { recent: r, previous: p } = form;
  return (
    <section className="progress">
      <div className="history-head">
        <h2>Your progress</h2>
        <p className="muted small">
          Based on {all.length} reviewed {all.length === 1 ? "game" : "games"}
          {undated > 0 ? ` (${undated} more without a date can't be placed on the timeline; load your games in My games to fill them in)` : ""}.{" "}
          {session ? "Saved to your account, so it follows you to other devices." : "Kept on this device; log in to keep it across devices."}
        </p>
      </div>

      <div className="history-filters">
        <div className="chips" role="group" aria-label="Site">
          {SITES.map((s) => (
            <button key={s.id} className={`chip${filter.site === s.id ? " chip-on" : ""}`} onClick={() => setFilter((f) => ({ ...f, site: s.id }))}>
              {s.label}
            </button>
          ))}
        </div>
        {timeClasses.length > 1 && (
          <div className="chips" role="group" aria-label="Time control">
            {(["all", ...timeClasses] as (TimeClass | "all")[]).map((t) => (
              <button key={t} className={`chip${filter.timeClass === t ? " chip-on" : ""}`} onClick={() => setFilter((f) => ({ ...f, timeClass: t }))}>
                {t === "all" ? "Any time control" : t}
              </button>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label="Period">
          {RANGES.map((x) => (
            <button key={x.label} className={`chip${filter.months === x.months ? " chip-on" : ""}`} onClick={() => setFilter((f) => ({ ...f, months: x.months }))}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <p className="muted intro">No reviewed games match these filters.</p>
      ) : (
        <>
          <div className="progress-cards">
            <Card label="Games reviewed" value={String(avg.games)} />
            <Card label="Average accuracy" value={avg.accuracy === null ? "—" : `${avg.accuracy}%`} note={form.accuracyChange !== null ? `${signed(form.accuracyChange)} vs the 20 before` : null} tone={form.accuracyChange === null ? undefined : form.accuracyChange > 0 ? "good" : form.accuracyChange < 0 ? "bad" : undefined} />
            <Card label="Estimated performance" value={avg.performance === null ? "—" : String(avg.performance)} note={r.performance !== null && p?.performance != null ? `${signed(r.performance - p.performance, 0)} vs the 20 before` : null} tone={r.performance !== null && p?.performance != null ? (r.performance > p.performance ? "good" : r.performance < p.performance ? "bad" : undefined) : undefined} />
            <Card label="Blunders per game" value={avg.blundersPerGame === null ? "—" : avg.blundersPerGame.toFixed(2)} note={form.blunderChange !== null ? `${signed(form.blunderChange, 2)} vs the 20 before` : null} tone={form.blunderChange === null ? undefined : form.blunderChange < 0 ? "good" : form.blunderChange > 0 ? "bad" : undefined} />
            <Card label="Score" value={avg.scorePct === null ? "—" : `${avg.scorePct}%`} note="points per game" />
          </div>

          <p>
            {form.direction === "improving" && <strong className="trend-up">Improving: </strong>}
            {form.direction === "declining" && <strong className="trend-down">Slipping: </strong>}
            {form.direction === "steady" && <strong>Steady: </strong>}
            {form.direction
              ? `over your latest ${r.games} games, accuracy is ${signed(form.accuracyChange ?? 0)} points and blunders per game ${signed(form.blunderChange ?? 0, 2)} compared with the ${p?.games} before.`
              : "Review at least 10 games to see how your latest games compare with the ones before."}
          </p>

          <div className="card trends">
            {trend.length >= 2 ? (
              <div className="trend-charts">
                <LineChart title="Accuracy (%)" points={trend.map((t) => ({ label: t.label, value: t.accuracy }))} />
                <LineChart title="Estimated performance" points={trend.map((t) => ({ label: t.label, value: t.performance }))} format={(v) => `${Math.round(v)}`} />
                <LineChart title="Blunders per game" points={trend.map((t) => ({ label: t.label, value: t.blundersPerGame }))} format={(v) => v.toFixed(2)} better="lower" />
                <LineChart title="Mistakes per game" points={trend.map((t) => ({ label: t.label, value: t.mistakesPerGame }))} format={(v) => v.toFixed(2)} better="lower" />
                <LineChart title="Score (%)" points={trend.map((t) => ({ label: t.label, value: t.scorePct }))} format={(v) => `${Math.round(v)}`} />
              </div>
            ) : (
              <p className="muted small">Charts appear once you have reviewed games from at least two different months.</p>
            )}
            <p className="muted small">Each point is a month's average over the games reviewed in it ({trend.length} {trend.length === 1 ? "month" : "months"}, {games.length} games).</p>
          </div>

          {(best.bestAccuracy || best.mostBrilliant) && (
            <>
              <h3>Highlights</h3>
              <ul className="history-list">
                {best.bestAccuracy && (
                  <li className="history-row">
                    <span className="history-open">
                      <span className="history-players">Most accurate game: {best.bestAccuracy.stats.accuracy}%</span>
                      <span className="history-meta muted small">
                        {describe(best.bestAccuracy)} · {best.bestAccuracy.date}
                      </span>
                    </span>
                    {openButton(best.bestAccuracy)}
                  </li>
                )}
                {best.mostBrilliant && (
                  <li className="history-row">
                    <span className="history-open">
                      <span className="history-players">
                        Most brilliant moves: {best.mostBrilliant.stats.brilliant} brilliant, {best.mostBrilliant.stats.great} great
                      </span>
                      <span className="history-meta muted small">
                        {describe(best.mostBrilliant)} · {best.mostBrilliant.date}
                      </span>
                    </span>
                    {openButton(best.mostBrilliant)}
                  </li>
                )}
              </ul>
            </>
          )}

          <h3>Latest games</h3>
          <ul className="history-list">
            {recent.map((g) => {
              const label = g.score === null ? null : RESULT[g.score as 0 | 0.5 | 1];
              return (
                <li key={g.id} className="history-row">
                  <span className="history-open">
                    <span className="history-players">{describe(g)}</span>
                    <span className="history-meta muted small">
                      <span className="tag">{g.site === "lichess" ? "Lichess" : "Chess.com"}</span>
                      {g.date}
                      {g.timeClass ? ` · ${g.timeClass}` : ""} · {g.stats.accuracy}% accuracy · {g.stats.blunders} {g.stats.blunders === 1 ? "blunder" : "blunders"}, {g.stats.mistakes} {g.stats.mistakes === 1 ? "mistake" : "mistakes"}
                    </span>
                  </span>
                  {label && <span className={`result result-${label.toLowerCase()}`}>{label}</span>}
                  {openButton(g)}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

