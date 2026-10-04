import { summarizeTrend, type TrendPoint } from "../lib/trends";
import { LineChart } from "./LineChart";

export function TrendsView({ points }: { points: TrendPoint[] }) {
  const summary = summarizeTrend(points);
  if (!summary) {
    return <p className="muted small">Review games from at least two different months to see how your play changes over time.</p>;
  }
  const { accuracyChange, blunderChange, direction } = summary;
  const sign = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  return (
    <div className="card trends">
      <p>
        {direction === "improving" && <strong className="trend-up">Improving: </strong>}
        {direction === "declining" && <strong className="trend-down">Slipping: </strong>}
        {direction === "steady" && <strong>Steady: </strong>}
        accuracy {sign(accuracyChange)} points and blunders per game {sign(blunderChange)} in your recent months compared with your earlier ones.
      </p>
      <div className="trend-charts">
        <LineChart title="Accuracy (%)" points={points.map((p) => ({ label: p.label, value: p.accuracy }))} />
        <LineChart title="Blunders per game" points={points.map((p) => ({ label: p.label, value: p.blundersPerGame }))} format={(v) => v.toFixed(2)} better="lower" />
        <LineChart title="Score (%)" points={points.map((p) => ({ label: p.label, value: p.score }))} format={(v) => `${Math.round(v)}`} />
      </div>
      <p className="muted small">Based on the games you have reviewed, grouped by month ({points.reduce((s, p) => s + p.games, 0)} games in {points.length} months).</p>
    </div>
  );
}
