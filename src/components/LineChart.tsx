export interface ChartPoint {
  label: string;
  value: number | null;
}

interface Props {
  title: string;
  points: ChartPoint[];
  /** How to print a value (default: one decimal). */
  format?: (v: number) => string;
  /** Which direction is better, so the latest change can be colored. */
  better?: "higher" | "lower";
}

const W = 360;
const H = 130;
const PAD = { l: 36, r: 12, t: 12, b: 24 };

/** A small line chart with a table fallback for screen readers. */
export function LineChart({ title, points, format = (v) => v.toFixed(1), better = "higher" }: Props) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const min = lo - span * 0.15;
  const max = hi + span * 0.15;
  const x = (i: number) => PAD.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const drawn = points.map((p, i) => (p.value === null ? null : { x: x(i), y: y(p.value), ...p }));
  const path = drawn.filter(Boolean).map((p, i) => `${i === 0 ? "M" : "L"}${p!.x.toFixed(1)},${p!.y.toFixed(1)}`).join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const good = better === "higher" ? last >= first : last <= first;
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <figure className="line-chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: from ${format(first)} to ${format(last)} over ${points.length} months`}>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line className="lc-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="lc-axis" x={PAD.l - 6} y={y(v) + 3} textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}
        <path className={`lc-line ${good ? "lc-good" : "lc-bad"}`} d={path} fill="none" />
        {drawn.map(
          (p, i) =>
            p && (
              <g key={p.label}>
                <circle className={`lc-dot ${good ? "lc-good" : "lc-bad"}`} cx={p.x} cy={p.y} r={3.2}>
                  <title>{`${p.label}: ${format(p.value as number)}`}</title>
                </circle>
                {i % labelEvery === 0 && (
                  <text className="lc-axis" x={p.x} y={H - 6} textAnchor="middle">
                    {p.label}
                  </text>
                )}
              </g>
            ),
        )}
      </svg>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value === null ? "no data" : format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
