import { useState } from "react";
import { ecoFamily } from "../lib/eco";
import { scoreFor, type GameRecord } from "../lib/games";

interface Props {
  games: GameRecord[];
  onOpen: (game: GameRecord) => void;
  /** Accuracy (0-100) of the profiled player, by game id, when reviewed. */
  accuracy?: Map<string, number>;
  pageSize?: number;
}

const RESULT_LABEL = { 1: "Win", 0.5: "Draw", 0: "Loss" } as const;

export function GameList({ games, onOpen, accuracy, pageSize = 25 }: Props) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(games.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = games.slice(current * pageSize, (current + 1) * pageSize);

  if (games.length === 0) return <p className="muted">No games match.</p>;
  return (
    <div className="game-list">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Opponent</th>
            <th>Result</th>
            <th className="hide-narrow">Opening</th>
            {accuracy && <th className="num">Accuracy</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => {
            const color = g.playerColor ?? "w";
            const opponent = color === "w" ? g.black : g.white;
            const oppElo = color === "w" ? g.blackElo : g.whiteElo;
            const score = scoreFor(g.result, color);
            const label = score === null ? g.result : RESULT_LABEL[score as 0 | 0.5 | 1];
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
                {accuracy && <td className="num">{accuracy.has(g.id) ? `${accuracy.get(g.id)}%` : "—"}</td>}
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
