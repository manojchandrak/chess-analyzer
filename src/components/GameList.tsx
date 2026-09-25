import { useMemo, useState } from "react";
import { ecoFamily } from "../lib/eco";
import { scoreFor, type GameRecord } from "../lib/games";
import { useGameStats, type GameStats } from "../lib/gameStats";

interface Props {
  games: GameRecord[];
  onOpen: (game: GameRecord) => void;
  pageSize?: number;
  /** Offers a button that reviews the next unreviewed games in the current order. */
  onReview?: (games: GameRecord[]) => void;
  reviewing?: boolean;
}

type SortKey = "newest" | "oldest" | "brilliant" | "great" | "accuracy" | "performance" | "fewestBlunders" | "mostBlunders" | "opponent" | "longest";

const SORTS: { id: SortKey; label: string; needsStats?: boolean }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "brilliant", label: "Most brilliant moves", needsStats: true },
  { id: "great", label: "Most great moves", needsStats: true },
  { id: "accuracy", label: "Highest accuracy", needsStats: true },
  { id: "performance", label: "Best game performance", needsStats: true },
  { id: "fewestBlunders", label: "Fewest blunders", needsStats: true },
  { id: "mostBlunders", label: "Most blunders", needsStats: true },
  { id: "opponent", label: "Strongest opponent" },
  { id: "longest", label: "Longest games" },
];

const STAT_SORT: Partial<Record<SortKey, (s: GameStats) => number>> = {
  brilliant: (s) => s.brilliant * 1000 + s.great * 10 + s.accuracy / 10,
  great: (s) => s.great * 1000 + s.brilliant * 10 + s.accuracy / 10,
  accuracy: (s) => s.accuracy,
  performance: (s) => s.performance,
  fewestBlunders: (s) => -(s.blunders * 1000 + s.mistakes * 10) + s.accuracy / 100,
  mostBlunders: (s) => s.blunders * 1000 + s.mistakes * 10,
};

const RESULT_LABEL = { 1: "Win", 0.5: "Draw", 0: "Loss" } as const;
// The chosen order survives filters and re-opening the list during the visit.
let lastSort: SortKey = "newest";

export function GameList({ games, onOpen, pageSize = 25, onReview, reviewing }: Props) {
  const stats = useGameStats();
  const [sort, setSortState] = useState<SortKey>(lastSort);
  const [page, setPage] = useState(0);
  const setSort = (s: SortKey) => {
    lastSort = s;
    setSortState(s);
    setPage(0);
  };

  const sorted = useMemo(() => {
    const oppElo = (g: GameRecord) => (g.playerColor === "b" ? g.whiteElo : g.blackElo) ?? 0;
    const byDate = (a: GameRecord, b: GameRecord) => (b.date ?? "").localeCompare(a.date ?? "");
    const statKey = STAT_SORT[sort];
    const list = [...games];
    if (statKey) {
      // Reviewed games first, best to worst; unreviewed games after, newest first.
      list.sort((a, b) => {
        const sa = stats.get(a.id);
        const sb = stats.get(b.id);
        if (sa && sb) return statKey(sb) - statKey(sa);
        if (sa || sb) return sa ? -1 : 1;
        return byDate(a, b);
      });
    } else if (sort === "oldest") list.sort((a, b) => -byDate(a, b));
    else if (sort === "opponent") list.sort((a, b) => oppElo(b) - oppElo(a));
    else if (sort === "longest") list.sort((a, b) => b.moves.length - a.moves.length);
    else list.sort(byDate);
    return list;
  }, [games, sort, stats]);

  const reviewedCount = useMemo(() => games.filter((g) => stats.has(g.id)).length, [games, stats]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * pageSize, (current + 1) * pageSize);
  const showStats = reviewedCount > 0;
  const nextToReview = sorted.filter((g) => !stats.has(g.id)).slice(0, 10);

  if (games.length === 0) return <p className="muted">No games match.</p>;
  return (
    <div className="game-list">
      <div className="list-toolbar">
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          {reviewedCount} of {games.length} reviewed
          {SORTS.find((s) => s.id === sort)?.needsStats && reviewedCount < games.length ? ": only reviewed games can be ranked" : ""}
        </span>
        {onReview && nextToReview.length > 0 && (
          <button className="btn btn-ghost" disabled={reviewing} onClick={() => onReview(nextToReview)}>
            {reviewing ? "Reviewing…" : `Review next ${nextToReview.length} games`}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Opponent</th>
            <th>Result</th>
            <th className="hide-narrow">Opening</th>
            {showStats && (
              <>
                <th className="num" title="Brilliant / great moves">
                  !! / !
                </th>
                <th className="num" title="Accuracy">Acc.</th>
                <th className="num hide-narrow" title="Estimated performance rating">
                  Perf.
                </th>
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
                        "—"
                      )}
                    </td>
                    <td className="num">{s ? `${s.accuracy}%` : "—"}</td>
                    <td className="num hide-narrow">{s?.performance || "—"}</td>
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
