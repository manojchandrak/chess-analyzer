import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SYNCED_EVENT } from "../lib/sync/apply";
import { useAuth } from "../lib/forum/auth-context";
import { readUsernames, saveUsernames } from "../lib/usernames";
import { useAutoReview } from "../hooks/useAutoReview";
import type { StockfishEngine } from "../lib/engine";
import type { GameRecord, TimeClass } from "../lib/games";
import { cleanFilter, filterGames, isFiltered, NO_FILTER, type GameFilter } from "../lib/gameFilter";
import { fetchChessComGames, fetchLichessGames } from "../lib/sources";
import { GameList } from "./GameList";
import { UsernameOwnership } from "./UsernameOwnership";

const OPTIONS_KEY = "chess-analyzer:recent-options";
const COUNTS = [10, 15, 25, 50, 100];
const PAGE_SIZES = [5, 10, 25, 50];
const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical", "daily"];

function savedNames(): { lichess: string; chesscom: string } {
  const { lichess, chesscom } = readUsernames();
  return { lichess, chesscom };
}

/** How many games to load per site and whether to review them automatically, remembered between visits. */
type Options = { count: number; auto: boolean; pageSize: number; filter: GameFilter };
const DEFAULT_OPTIONS: Options = { count: 15, auto: true, pageSize: 10, filter: NO_FILTER };

function savedOptions(): Options {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") as Partial<Options>;
    return {
      count: COUNTS.includes(saved.count as number) ? (saved.count as number) : DEFAULT_OPTIONS.count,
      auto: saved.auto !== false,
      pageSize: PAGE_SIZES.includes(saved.pageSize as number) ? (saved.pageSize as number) : DEFAULT_OPTIONS.pageSize,
      filter: cleanFilter(saved.filter),
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/** Lists a player's latest games from both sites; picking one opens it for full analysis. The accuracy,
 * brilliant-move and performance columns are filled in automatically (from what is saved in this browser,
 * from Lichess's own analysis, and by reviewing the rest with Stockfish in the background). */
export function RecentGames({ onAnalyze, engine }: { onAnalyze: (game: GameRecord) => void; engine: StockfishEngine | null }) {
  const { session } = useAuth();
  const [loadedNames, setLoadedNames] = useState<{ lichess: string; chesscom: string } | null>(null);
  const [names, setNames] = useState(savedNames);
  const [options, setOptions] = useState(savedOptions);
  // Usernames and options saved to the account arrive after login; show them without a reload.
  useEffect(() => {
    const refresh = () => {
      setNames(savedNames());
      setOptions(savedOptions());
    };
    window.addEventListener(SYNCED_EVENT, refresh);
    return () => window.removeEventListener(SYNCED_EVENT, refresh);
  }, []);
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const shown = useMemo(() => (games ? filterGames(games, options.filter) : null), [games, options.filter]);
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

  function setFilter(change: Partial<GameFilter>) {
    setOption({ filter: { ...options.filter, ...change } });
  }

  async function load(e: FormEvent) {
    e.preventDefault();
    const lichess = names.lichess.trim();
    const chesscom = names.chesscom.trim();
    if (!lichess && !chesscom) return;
    saveUsernames({ lichess, chesscom }, !!session);
    setLoadedNames({ lichess, chesscom });
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
      <UsernameOwnership loaded={loadedNames} />
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
          <div className="chips" role="group" aria-label="Filter games">
            <select aria-label="Site" value={options.filter.source} onChange={(e) => setFilter({ source: e.target.value as GameFilter["source"] })}>
              <option value="all">All sites</option>
              <option value="lichess">Lichess</option>
              <option value="chesscom">Chess.com</option>
            </select>
            <select aria-label="Colour" value={options.filter.color} onChange={(e) => setFilter({ color: e.target.value as GameFilter["color"] })}>
              <option value="all">Either colour</option>
              <option value="w">As White</option>
              <option value="b">As Black</option>
            </select>
            <select aria-label="Result" value={options.filter.result} onChange={(e) => setFilter({ result: e.target.value as GameFilter["result"] })}>
              <option value="all">Any result</option>
              <option value="win">Wins</option>
              <option value="draw">Draws</option>
              <option value="loss">Losses</option>
            </select>
            <select aria-label="Time control" value={options.filter.timeClass} onChange={(e) => setFilter({ timeClass: e.target.value as GameFilter["timeClass"] })}>
              <option value="all">Any time control</option>
              {TIME_CLASSES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <select aria-label="Games per page" value={options.pageSize} onChange={(e) => setOption({ pageSize: Number(e.target.value) })}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            {isFiltered(options.filter) && (
              <button type="button" className="link" onClick={() => setOption({ filter: NO_FILTER })}>
                Clear filters
              </button>
            )}
          </div>
          {isFiltered(options.filter) && <p className="muted small">Showing {shown?.length ?? 0} of {games.length} games</p>}
          <GameList games={shown ?? games} onOpen={onAnalyze} pageSize={options.pageSize} />
        </>
      )}
    </div>
  );
}
