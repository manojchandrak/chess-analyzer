import { useState, type FormEvent } from "react";
import type { GameRecord } from "../lib/games";
import { fetchChessComGames, fetchLichessGames } from "../lib/sources";
import { GameList } from "./GameList";

const STORAGE_KEY = "chess-analyzer:usernames";

function savedNames(): { lichess: string; chesscom: string } {
  try {
    return { lichess: "", chesscom: "", ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { lichess: "", chesscom: "" };
  }
}

/** Lists a player's latest games from both sites; picking one opens it for full analysis. */
export function RecentGames({ onAnalyze }: { onAnalyze: (game: GameRecord) => void }) {
  const [names, setNames] = useState(savedNames);
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

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
    const results = await Promise.allSettled([lichess ? fetchLichessGames(lichess, 15) : Promise.resolve([]), chesscom ? fetchChessComGames(chesscom, 15) : Promise.resolve([])]);
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
        <button className="btn btn-primary" disabled={loading || (!names.lichess.trim() && !names.chesscom.trim())}>
          {loading ? "Loading…" : "Show recent games"}
        </button>
      </form>
      {errors.map((e) => (
        <p className="error-message" key={e}>
          {e}
        </p>
      ))}
      {games && (
        <>
          <p className="muted small">Pick a game: it opens on the board and Stockfish reviews every move.</p>
          <GameList games={games} onOpen={onAnalyze} pageSize={10} />
        </>
      )}
    </div>
  );
}
