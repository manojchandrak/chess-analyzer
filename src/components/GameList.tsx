import { useMemo, useState } from "react";
import { ecoFamily } from "../lib/eco";
import { scoreFor, type GameRecord } from "../lib/games";
import { useGameStats } from "../lib/gameStats";
import { DEFAULT_DIRECTION, needsReview, PRESETS, presetOf, sortGames, toggleSort, type Sort, type SortBy } from "../lib/gameSort";

interface Props {
  games: GameRecord[];
  onOpen: (game: GameRecord) => void;
  pageSize?: number;
  /** Offers a button that reviews the next unreviewed games in the current order. */
  onReview?: (games: GameRecord[]) => void;
  reviewing?: boolean;
}

const RESULT_LABEL = { 1: "Win", 0.5: "Draw", 0: "Loss" } as const;
const REVIEW_COUNTS = [10, 25, 50];
const NOT_REVIEWED = "Not reviewed yet. Open the game, or use the Review button above the table, to fill this in.";

// The chosen order survives filters and re-opening the list during the visit.
let lastSort: Sort = { by: "date", dir: "desc" };

/** A column header you can click to sort by that column; click again to reverse. */
function SortHeader({ by, sort, onSort, className, title, children }: { by: SortBy; sort: Sort; onSort: (by: SortBy) => void; className?: string; title?: string; children: React.ReactNode }) {
  const active = sort.by === by;
  const word = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={className} aria-sort={word} title={title}>
      <button type="button" className={`th-sort${active ? " th-sort-on" : ""}`} onClick={() => onSort(by)} aria-label={`${title ?? String(children)}: sort ${active && sort.dir === DEFAULT_DIRECTION[by] ? "the other way" : "by this column"}`}>
        {children}
        <span className="th-arrow" aria-hidden="true">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function GameList({ games, onOpen, pageSize = 25, onReview, reviewing }: Props) {
  const stats = useGameStats();
  const [sort, setSortState] = useState<Sort>(lastSort);
  const [page, setPage] = useState(0);
  const [reviewCount, setReviewCount] = useState(10);
  const setSort = (s: Sort) => {
    lastSort = s;
    setSortState(s);
    setPage(0);
  };

  const sorted = useMemo(() => sortGames(games, stats, sort), [games, sort, stats]);
  const reviewedCount = useMemo(() => games.filter((g) => stats.has(g.id)).length, [games, stats]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * pageSize, (current + 1) * pageSize);
  const showStats = reviewedCount > 0;
  const toReview = sorted.filter((g) => g.playerColor !== null && !stats.has(g.id));
  const next = toReview.slice(0, reviewCount);
  const preset = presetOf(sort);

  if (games.length === 0) return <p className="muted">No games match.</p>;
  return (
    <div className="game-list">
      <div className="list-toolbar">
        <label>
          Sort
          <select
            value={preset ?? ""}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (p) setSort(p.sort);
            }}
          >
            {preset === null && (
              <option value="" disabled>
                By column: {sort.by === "opening" ? "opening" : sort.by} ({sort.dir === "asc" ? "ascending" : "descending"})
              </option>
            )}
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          {reviewedCount} of {games.length} reviewed
          {needsReview(sort.by) && reviewedCount < games.length ? ": only reviewed games are ranked, the rest follow" : ""}
        </span>
        {onReview && toReview.length > 0 && (
          <span className="review-next">
            <button className="btn btn-ghost" disabled={reviewing} onClick={() => onReview(next)} title="Run Stockfish over the next unreviewed games, in the order shown below">
              {reviewing ? "Reviewing…" : `Review next ${next.length} game${next.length === 1 ? "" : "s"}`}
            </button>
            <select value={reviewCount} onChange={(e) => setReviewCount(Number(e.target.value))} aria-label="How many games to review" disabled={reviewing}>
              {REVIEW_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <SortHeader by="date" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} title="Date">
              Date
            </SortHeader>
            <SortHeader by="opponent" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} title="Opponent rating">
              Opponent
            </SortHeader>
            <SortHeader by="result" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} title="Result: wins, draws, losses">
              Result
            </SortHeader>
            <SortHeader by="opening" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} className="hide-narrow" title="Opening, alphabetically">
              Opening
            </SortHeader>
            {showStats && (
              <>
                <SortHeader by="brilliant" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} className="num" title="Brilliant and great moves">
                  !! / !
                </SortHeader>
                <SortHeader by="accuracy" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} className="num" title="Accuracy">
                  Acc.
                </SortHeader>
                <SortHeader by="performance" sort={sort} onSort={(by) => setSort(toggleSort(sort, by))} className="num hide-narrow" title="Estimated performance rating">
                  Perf.
                </SortHeader>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => {
            const color = g.playerColor ?? "w";
            const opponent = color === "w" ? g.black : g.white;
            const oppElo = color === "w" ? g.blackElo : g.whiteElo;
            const score = scoreFor(g.result, color);
            const label = score === null ? g.result : RESULT_LABEL[score as 0 | 0.5 | 1];
            const s = stats.get(g.id);
            const dash = (
              <span className="muted" title={NOT_REVIEWED}>
                —
              </span>
            );
            return (
              <tr key={g.id} onClick={() => onOpen(g)} className="clickable">
                <td className="nowrap">{g.date ?? "?"}</td>
                <td>
                  <span className={`color-dot color-${color}`} title={color === "w" ? "Played White" : "Played Black"} />
                  {opponent}
                  {oppElo ? <span className="muted"> ({oppElo})</span> : null}
                  {g.timeClass && g.source !== "legend" ? <span className="tag">{g.timeClass}</span> : null}
                  {g.source === "legend" && g.timeClass === "blitz" ? <span className="tag">fast / online</span> : null}
                </td>
                <td>
                  <span className={`result result-${label.toLowerCase()}`}>{label}</span>
                </td>
                <td className="hide-narrow">{g.opening ?? ecoFamily(g.eco) ?? g.eco ?? "—"}</td>
                {showStats && (
                  <>
                    <td className="num">
                      {s ? (
                        <>
                          <span className="count-brilliant">{s.brilliant}</span> / <span className="count-great">{s.great}</span>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="num">{s ? `${s.accuracy}%` : dash}</td>
                    <td className="num hide-narrow">{s?.performance || dash}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
            ← Previous
          </button>
          <span className="muted small">
            Page {current + 1} of {pages} · {games.length} games
          </span>
          <button className="btn btn-ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
