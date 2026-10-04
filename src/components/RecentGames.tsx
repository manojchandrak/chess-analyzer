import { useState, type FormEvent } from "react";
import { useAutoReview } from "../hooks/useAutoReview";
import type { StockfishEngine } from "../lib/engine";
import type { GameRecord } from "../lib/games";
import { fetchChessComGames, fetchLichessGames } from "../lib/sources";
import { GameList } from "./GameList";

const STORAGE_KEY = "chess-analyzer:usernames";
const OPTIONS_KEY = "chess-analyzer:recent-options";
const COUNTS = [10, 15, 25, 50, 100];

function savedNames(): { lichess: string; chesscom: string } {
  try {
    return { lichess: "", chesscom: "", ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { lichess: "", chesscom: "" };
  }
}

/** How many games to load per site and whether to review them automatically, remembered between visits. */
function savedOptions(): { count: number; auto: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") as { count?: number; auto?: boolean };
    return { count: COUNTS.includes(saved.count as number) ? (saved.count as number) : 15, auto: saved.auto !== false };
  } catch {
    return { count: 15, auto: true };
  }
}

/** Lists a player's latest games from both sites; picking one opens it for full analysis. The accuracy,
 * brilliant-move and performance columns are filled in automatically (from what is saved in this browser,
 * from Lichess's own analysis, and by reviewing the rest with Stockfish in the background). */
export function RecentGames({ onAnalyze, engine }: { onAnalyze: (game: GameRecord) => void; engine: StockfishEngine | null }) {
  const [names, setNames] = useState(savedNames);
  const [options, setOptions] = useState(savedOptions);
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const { progress, error: reviewError, stoppedByUser, stop, retry } = useAutoReview(games, engine, options.auto);

  function setOption(change: Partial<typeof options>) {
    const next = { ...options, ...change };
    setOptions(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // not remembered; fine
    }
  }

  async function load(e: FormEvent) {
    e.preventDefault();
    const lichess = names.lichess.trim();
    const chesscom = names.chesscom.trim();
    if (!lichess && !chesscom) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lichess, chesscom }));
    } catch {
      // not remembered; fine
    }
    setLoading(true);
    const results = await Promise.allSettled([lichess ? fetchLichessGames(lichess, options.count) : Promise.resolve([]), chesscom ? fetchChessComGames(chesscom, options.count) : Promise.resolve([])]);
    const loaded = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    loaded.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    setErrors(results.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [])));
    setGames(loaded);
    setLoading(false);
  }

  return (
    <div className="card recent-games">
      <h3>Analyze one of your recent games</h3>
      <form className="load-form" onSubmit={load}>
        <div className="field">
          <label htmlFor="recent-lichess">Lichess username</label>
          <input id="recent-lichess" value={names.lichess} onChange={(e) => setNames({ ...names, lichess: e.target.value })} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="recent-chesscom">Chess.com username</label>
          <input id="recent-chesscom" value={names.chesscom} onChange={(e) => setNames({ ...names, chesscom: e.target.value })} autoComplete="off" />
        </div>
        <div className="field field-small">
          <label htmlFor="recent-count">Games per site</label>
          <select id="recent-count" value={options.count} onChange={(e) => setOption({ count: Number(e.target.value) })}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={loading || (!names.lichess.trim() && !names.chesscom.trim())}>
          {loading ? "Loading…" : "Show recent games"}
        </button>
        <label className="toggle auto-review-toggle load-hint" title="Reviews each game with Stockfish in the background and remembers the result in this browser">
          <input type="checkbox" checked={options.auto} onChange={(e) => setOption({ auto: e.target.checked })} />
          <span className="toggle-track" />
          Fill in accuracy, brilliant moves and performance automatically
        </label>
      </form>
      {errors.map((e) => (
        <p className="error-message" key={e}>
          {e}
        </p>
      ))}
      {games && (
        <>
          <p className="muted small">Pick a game: it opens on the board and Stockfish reviews every move.{options.auto ? " Numbers for the other columns fill in on their own: games you've reviewed before appear straight away, and the rest are reviewed in the background." : ""}</p>
          {progress && (
            <div className="progress" role="status">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
              <p className="progress-label">
                Reviewing game {progress.done + 1} of {progress.total}{" "}
                <button type="button" className="link" onClick={stop}>
                  Stop
                </button>
              </p>
            </div>
          )}
          {stoppedByUser && options.auto && (
            <p className="muted small">
              Stopped.{" "}
              <button type="button" className="link" onClick={retry}>
                Fill in the rest
              </button>
            </p>
          )}
          {reviewError && (
            <p className="error-message">
              {reviewError}{" "}
              <button type="button" className="link" onClick={retry}>
                Try again
              </button>
            </p>
          )}
          <GameList games={games} onOpen={onAnalyze} pageSize={10} />
        </>
      )}
    </div>
  );
}
