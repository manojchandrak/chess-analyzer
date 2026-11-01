import { useState } from "react";
import { DRILLS, type Drill, type DrillPhase } from "../lib/drillData";
import { drillStatus, nextDrill, phaseProgress, resetProgress, useDrillProgress, type DrillStatus } from "../lib/drills";
import { useMistakes } from "../lib/mistakes";
import { DrillSession } from "./DrillSession";
import type { GameRecord } from "../lib/games";
import { DailyPuzzle } from "./DailyPuzzle";
import { MistakeDrills } from "./MistakeDrills";

const PHASES: { id: DrillPhase; label: string; blurb: string }[] = [
  { id: "opening", label: "Openings", blurb: "Play a main line from memory. The other side's moves are played for you, with the ideas explained as you go." },
  { id: "middlegame", label: "Middlegame", blurb: "Tactical patterns: mates, forks, pins, skewers and more. Stockfish defends, and checks every move you make." },
  { id: "endgame", label: "Endgame", blurb: "Basic mates and the key king-and-pawn and rook endings, played out against Stockfish." },
];

const STATUS_LABEL: Record<DrillStatus, string> = { new: "New", due: "Due", learning: "Learning", mastered: "★ Mastered" };

/** Opening, middlegame and endgame drills, scheduled by spaced repetition. */
export function Drills({ onOpenGame }: { onOpenGame?: (game: GameRecord, heading?: string, ply?: number) => void }) {
  const [phase, setPhase] = useState<DrillPhase>("opening");
  const [extra, setExtra] = useState<"daily" | "mistakes" | null>("daily");
  const showMistakes = extra === "mistakes";
  const showDaily = extra === "daily";
  const mistakes = useMistakes();
  const [active, setActive] = useState<Drill | null>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useDrillProgress();
  const inPhase = DRILLS.filter((d) => d.phase === phase);
  const stats = phaseProgress(DRILLS, phase, progress);
  const mistakesToDo = mistakes.filter((m) => ['new', 'due'].includes(drillStatus(progress[`mistake:${m.id}`]))).length;

  function open(d: Drill | null) {
    setActive(d);
    setAttempt((a) => a + 1);
    window.scrollTo(0, 0);
  }

  if (active) {
    return (
      <DrillSession
        key={`${active.id}:${attempt}`}
        drill={active}
        onBack={() => setActive(null)}
        onRetry={() => setAttempt((a) => a + 1)}
        onNext={() => open(nextDrill(DRILLS.filter((d) => d.phase === active.phase), progress, active.id))}
      />
    );
  }

  const meta = PHASES.find((p) => p.id === phase)!;
  return (
    <section className="drills">
      <div className="chips drill-phases" role="tablist">
        <button role="tab" aria-selected={showDaily} className={`chip${showDaily ? " chip-on" : ""}`} onClick={() => setExtra("daily")}>
          Daily puzzle
        </button>
        {PHASES.map((p) => {
          const s = phaseProgress(DRILLS, p.id, progress);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={phase === p.id && !extra}
              className={`chip${phase === p.id && !extra ? " chip-on" : ""}`}
              onClick={() => {
                setPhase(p.id);
                setExtra(null);
              }}
            >
              {p.label} <span className="drill-chip-count">{s.mastered}/{s.total}</span>
            </button>
          );
        })}
        <button role="tab" aria-selected={showMistakes} className={`chip${showMistakes ? " chip-on" : ""}`} onClick={() => setExtra("mistakes")}>
          My mistakes{mistakes.length > 0 && <span className="drill-chip-count"> {mistakesToDo > 0 ? `${mistakesToDo} to do` : mistakes.length}</span>}
        </button>
      </div>

      {showDaily ? (
        <DailyPuzzle onOpenGame={onOpenGame} />
      ) : showMistakes ? (
        <MistakeDrills />
      ) : (
        <>
      <div className="card drill-summary">
        <div>
          <h2>{meta.label} drills</h2>
          <p className="muted">{meta.blurb}</p>
          <p className="small">
            <strong>{stats.mastered}</strong> of {stats.total} mastered · <strong>{stats.due}</strong> due for review · <strong>{stats.fresh}</strong> new
          </p>
          <div className="drill-bar" aria-hidden>
            <div style={{ width: `${(stats.mastered / stats.total) * 100}%` }} />
          </div>
        </div>
        <div className="review-actions">
          <button className="btn btn-primary" onClick={() => open(nextDrill(inPhase, progress))}>
            {stats.due ? "Review due drills" : stats.fresh ? "Start next drill" : "Practise again"}
          </button>
        </div>
      </div>

      <div className="drill-grid">
        {inPhase.map((d) => {
          const rec = progress[d.id];
          const status = drillStatus(rec);
          return (
            <button key={d.id} className="closest-card drill-card" onClick={() => open(d)}>
              <span className="drill-card-top">
                <span className="eyebrow">{d.theme}</span>
                <span className={`tag drill-tag-${status}`}>{STATUS_LABEL[status]}</span>
              </span>
              <strong>{d.title}</strong>
              <span className="muted small">
                As {d.side === "w" ? "White" : "Black"}
                {rec ? ` · ${rec.clean}/${rec.attempts} clean` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <p className="muted small drill-footnote">
        Drills you solve cleanly come back after 1, 3, 7, 16 and then 35 days; anything you miss comes back sooner. Progress is kept in this browser.{" "}
        <button
          className="link"
          onClick={() => {
            if (confirm(`Reset your progress on the ${meta.label.toLowerCase()} drills?`)) resetProgress(inPhase.map((d) => d.id));
          }}
        >
          Reset {meta.label.toLowerCase()} progress
        </button>
      </p>
        </>
      )}
    </section>
  );
}
