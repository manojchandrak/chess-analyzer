import { useMemo, useState } from "react";
import { drillStatus, nextDrill, recordResult, resetProgress, useDrillProgress } from "../lib/drills";
import { clearMistakes, useMistakes } from "../lib/mistakes";
import { Puzzle } from "./PuzzleDrill";

/** The positions where you went wrong in your own reviewed games, practised on a spaced-repetition schedule:
 * solve one cleanly and it comes back after a day, then 3, 7, 16 and 35; miss it and it comes back within minutes. */
export function MistakeDrills() {
  const items = useMistakes();
  const progress = useDrillProgress();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  // The schedule keys each mistake as "mistake:<game id>#<ply>", alongside the opening, middlegame and endgame drills.
  const entries = useMemo(() => items.map((item) => ({ id: `mistake:${item.id}`, item })), [items]);
  const counts = useMemo(() => {
    const c = { new: 0, due: 0, learning: 0, mastered: 0 };
    for (const e of entries) c[drillStatus(progress[e.id])]++;
    return c;
  }, [entries, progress]);
  const current = currentId ? entries.find((e) => e.id === currentId) : undefined;

  function open(id: string | null) {
    setCurrentId(id);
    setAnswered(false);
    window.scrollTo(0, 0);
  }

  if (current) {
    const position = entries.findIndex((e) => e.id === current.id) + 1;
    return (
      <div className="card puzzle">
        <div className="puzzle-head">
          <h3>My mistakes</h3>
          <span className="muted small">
            Mistake {position} of {entries.length}
          </span>
        </div>
        <Puzzle
          key={current.id}
          puzzle={current.item}
          onResult={(result) => {
            recordResult(current.id, result);
            setAnswered(true);
          }}
        />
        <div className="puzzle-nav">
          <button className="btn btn-ghost" onClick={() => open(null)}>
            Stop
          </button>
          <button className="btn btn-primary" disabled={!answered} onClick={() => open(nextDrill(entries, progress, current.id)?.id ?? null)}>
            Next mistake →
          </button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card drill-summary">
        <div>
          <h2>My mistakes</h2>
          <p className="muted">
            Nothing here yet. When Stockfish reviews one of your Lichess or Chess.com games (open a game from My games, or use the Review button there), the positions where you went wrong are saved here, and you can practise finding the better move. They follow you to other devices when you are logged in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card drill-summary">
      <div>
        <h2>My mistakes</h2>
        <p className="muted">Positions from your own reviewed games where you went wrong. Find the move you missed.</p>
        <p className="small">
          <strong>{counts.mastered}</strong> of {entries.length} mastered · <strong>{counts.due}</strong> due for review · <strong>{counts.new}</strong> new
        </p>
        <div className="drill-bar" aria-hidden>
          <div style={{ width: `${(counts.mastered / entries.length) * 100}%` }} />
        </div>
        <p className="muted small drill-footnote">
          Solve one cleanly and it comes back after 1, 3, 7, 16 and then 35 days; anything you miss comes back sooner.{" "}
          <button
            className="link"
            onClick={() => {
              if (confirm("Remove all your saved mistakes and their progress?")) {
                resetProgress(entries.map((e) => e.id));
                clearMistakes();
              }
            }}
          >
            Remove all
          </button>
        </p>
      </div>
      <div className="review-actions">
        <button className="btn btn-primary" onClick={() => open(nextDrill(entries, progress)?.id ?? null)}>
          {counts.due ? "Review due mistakes" : counts.new ? "Start practising" : "Practise again"}
        </button>
      </div>
    </div>
  );
}
