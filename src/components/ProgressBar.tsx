interface Props {
  done: number;
  total: number;
}

export function ProgressBar({ done, total }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">
        Analyzing position {done} of {total} ({pct}%)
      </p>
    </div>
  );
}
