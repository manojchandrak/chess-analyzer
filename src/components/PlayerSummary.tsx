import type { PlayerStats } from "../lib/analyze";

function ratingDiffLabel(pgnElo: number | null, estimated: number | null): string | null {
  if (pgnElo === null || estimated === null) return null;
  const diff = estimated - pgnElo;
  if (Math.abs(diff) < 50) return "played about at their rating";
  return diff > 0 ? `played ~${diff} above their rating` : `played ~${Math.abs(diff)} below their rating`;
}

export function PlayerSummary({ color, stats }: { color: "White" | "Black"; stats: PlayerStats }) {
  const diffLabel = ratingDiffLabel(stats.pgnElo, stats.estimatedRating);
  return (
    <div className={`player-card player-card-${color.toLowerCase()}`}>
      <p className="player-color">{color}</p>
      <h3>{stats.name}</h3>
      <div className="rating-row">
        <div>
          <span className="rating-label">PGN rating</span>
          <span className="rating-value">{stats.pgnElo ?? "—"}</span>
        </div>
        <div>
          <span className="rating-label">Estimated performance</span>
          <span className="rating-value rating-estimated">{stats.estimatedRating ?? "—"}</span>
        </div>
      </div>
      {diffLabel && <p className="rating-diff">{diffLabel}</p>}
      <div className="overall-accuracy">
        <span className="accuracy-value">{stats.overall.accuracy ?? "—"}%</span>
        <span className="accuracy-label">overall accuracy</span>
      </div>
      <p className="quality-counts">
        {stats.overall.blunders} blunders · {stats.overall.mistakes} mistakes · {stats.overall.inaccuracies} inaccuracies
      </p>
    </div>
  );
}
