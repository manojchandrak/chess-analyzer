interface Props {
  done: number;
  total: number;
  label?: string;
}

export function ProgressBar({ done, total, label }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">
        {label ? `${label}: ` : ""}Analyzing position {done} of {total} ({pct}%)
      </p>
    </div>
  );
}
