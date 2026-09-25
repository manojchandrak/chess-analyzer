import type { Tip } from "../lib/tips";

const PRIORITY_LABEL = { high: "Priority", medium: "Worth fixing", low: "Minor", strength: "Strength" } as const;

export function TipsList({ tips }: { tips: Tip[] }) {
  if (tips.length === 0) {
    return <p className="muted">No clear weaknesses stand out in these games. Run the engine review below for a closer look.</p>;
  }
  return (
    <ol className="tips">
      {tips.map((t) => (
        <li key={t.title} className={`tip tip-${t.priority}`}>
          <span className="tip-badge">{PRIORITY_LABEL[t.priority]}</span>
          <div>
            <h4>{t.title}</h4>
            <p>{t.detail}</p>
            {t.resource && (
              <a href={t.resource.url} target="_blank" rel="noreferrer">
                {t.resource.label} ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
