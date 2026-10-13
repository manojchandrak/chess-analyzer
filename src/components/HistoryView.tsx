import { useMemo, useState } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { scoreFor, type GameRecord } from "../lib/games";
import { useGameStats } from "../lib/gameStats";
import { removeFromHistory, useHistory } from "../lib/history";
import { FavoriteStar } from "./FavoriteStar";

type Filter = "all" | "favorites";
type Site = "all" | "lichess" | "chesscom";
const RESULT_LABEL = { 1: "Win", 0.5: "Draw", 0: "Loss" } as const;

const matches = (g: GameRecord, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [g.white, g.black, g.opening, g.eco, g.date].some((v) => v?.toLowerCase().includes(q));
};

/** The games opened for analysis, newest first, with favourites. Saved on this device, and to the account when logged in. */
export function HistoryView({ onOpen }: { onOpen: (game: GameRecord) => void }) {
  const entries = useHistory();
  const stats = useGameStats();
  const { session, status } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [site, setSite] = useState<Site>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(
    () => entries.filter((e) => e.game && (filter === "all" || e.favorite) && (site === "all" || e.game.source === site) && matches(e.game, query)),
    [entries, filter, site, query],
  );
  const favorites = entries.filter((e) => e.favorite).length;

  return (
    <section className="history">
      <div className="history-head">
        <h2>Game history</h2>
        <p className="muted small">
          Games you open for analysis from Lichess and Chess.com, with the ones you starred.{" "}
          {session ? "They are saved to your account and follow you to other devices." : status === "ready" ? "They are kept on this device; log in to keep them across devices." : "They are kept on this device."}
        </p>
      </div>

      <div className="history-filters">
        <div className="chips" role="group" aria-label="Show">
          <button className={`chip${filter === "all" ? " chip-on" : ""}`} onClick={() => setFilter("all")}>
            All ({entries.length})
          </button>
          <button className={`chip${filter === "favorites" ? " chip-on" : ""}`} onClick={() => setFilter("favorites")}>
            ★ Favourites ({favorites})
          </button>
        </div>
        <div className="chips" role="group" aria-label="Site">
          {(
            [
              ["all", "Both sites"],
              ["lichess", "Lichess"],
              ["chesscom", "Chess.com"],
            ] as const
          ).map(([id, text]) => (
            <button key={id} className={`chip${site === id ? " chip-on" : ""}`} onClick={() => setSite(id)}>
              {text}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players, opening or date" aria-label="Search history" />
      </div>

      {entries.length === 0 ? (
        <p className="muted intro">Nothing here yet. Open a game from My games or Analyze a game and it will appear here. Star the ones you want to keep handy.</p>
      ) : shown.length === 0 ? (
        <p className="muted intro">No games match.</p>
      ) : (
        <ul className="history-list">
          {shown.map((e) => {
            const g = e.game!;
            const color = g.playerColor ?? "w";
            const score = scoreFor(g.result, color);
            const label = score === null ? g.result : RESULT_LABEL[score as 0 | 0.5 | 1];
            const s = stats.get(g.id);
            return (
              <li key={e.id} className="history-row">
                <FavoriteStar game={g} />
                <button className="history-open" onClick={() => onOpen(g)}>
                  <span className="history-players">
                    {g.white}
                    {g.whiteElo ? <span className="muted"> ({g.whiteElo})</span> : null} – {g.black}
                    {g.blackElo ? <span className="muted"> ({g.blackElo})</span> : null}
                  </span>
                  <span className="history-meta muted small">
                    <span className="tag">{g.source === "lichess" ? "Lichess" : "Chess.com"}</span>
                    {g.date ?? "?"} · {g.opening ?? g.eco ?? "opening unknown"}
                    {g.timeClass ? ` · ${g.timeClass}` : ""}
                    {s ? ` · ${s.accuracy}% accuracy` : ""}
                  </span>
                </button>
                <span className={`result result-${label.toLowerCase()}`}>{label}</span>
                <button className="btn btn-ghost" onClick={() => removeFromHistory(e.id)} aria-label={`Remove ${g.white} vs ${g.black} from history`} title="Remove from history">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
