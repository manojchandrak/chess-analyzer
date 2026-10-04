import { useMemo, useState, type FormEvent } from "react";
import { checkAnswer, isOwnPiece, legalTargets, loadSolved, saveSolved, type PuzzleItem } from "../lib/puzzles";
import { sanSquares } from "../lib/uci";
import { Board } from "./Board";

type Feedback = { kind: "correct" | "wrong" | "illegal" | "shown"; san?: string | null } | null;

interface PuzzleProps {
  puzzle: PuzzleItem;
  onSolved: () => void;
}

/** One position to solve: click a piece then a square, or type the move. Resets for each puzzle (keyed by id). */
function Puzzle({ puzzle, onSolved }: PuzzleProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [typed, setTyped] = useState("");
  const done = feedback?.kind === "correct" || feedback?.kind === "shown";
  const targets = useMemo(() => (selected ? legalTargets(puzzle.fen, selected) : []), [selected, puzzle.fen]);
  const answerArrow = done ? sanSquares(puzzle.fen, puzzle.best) : null;

  function attempt(move: string | { from: string; to: string; promotion?: string }) {
    const { result, san } = checkAnswer(puzzle.fen, move, puzzle.best);
    setSelected(null);
    setFeedback({ kind: result, san });
    if (result === "correct") onSolved();
  }

  function onSquare(square: string) {
    if (done) return;
    if (selected && targets.includes(square)) return attempt({ from: selected, to: square, promotion: "q" });
    setSelected(isOwnPiece(puzzle.fen, square) && square !== selected ? square : null);
    if (feedback?.kind === "wrong" || feedback?.kind === "illegal") setFeedback(null);
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    if (typed.trim() && !done) attempt(typed);
    setTyped("");
  }

  return (
    <div className="puzzle-body">
      <div className="puzzle-board">
        <Board fen={puzzle.fen} flipped={puzzle.color === "b"} onSquareClick={onSquare} selected={selected} targets={targets} arrows={answerArrow ? [{ ...answerArrow, color: "#81b64c", opacity: 0.9 }] : []} />
      </div>
      <div className="puzzle-info">
        <p>
          <strong>{puzzle.color === "w" ? "White" : "Black"} to move.</strong> In your game{puzzle.opponent ? ` against ${puzzle.opponent}` : ""}
          {puzzle.date ? ` (${puzzle.date})` : ""} you played <strong>{puzzle.played}</strong>, a {puzzle.quality}. Find the better move.
        </p>
        <form className="puzzle-form" onSubmit={submitTyped}>
          <label className="muted small" htmlFor="puzzle-move">
            Or type it (e.g. Nf3, O-O, exd5)
          </label>
          <div className="puzzle-form-row">
            <input id="puzzle-move" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={done} />
            <button className="btn btn-ghost" disabled={done || !typed.trim()}>
              Check
            </button>
          </div>
        </form>
        <div role="status" className="puzzle-feedback">
          {feedback?.kind === "correct" && (
            <p className="puzzle-ok">
              Correct: <strong>{puzzle.best}</strong> was the move.
            </p>
          )}
          {feedback?.kind === "wrong" && (
            <p className="puzzle-wrong">
              {feedback.san} isn't the best move here. Try again, or show the answer.
            </p>
          )}
          {feedback?.kind === "illegal" && <p className="puzzle-wrong">That isn't a legal move in this position.</p>}
          {feedback?.kind === "shown" && (
            <p>
              The best move was <strong>{puzzle.best}</strong>.
            </p>
          )}
        </div>
        {!done && (
          <button className="btn btn-ghost" onClick={() => setFeedback({ kind: "shown" })}>
            Show answer
          </button>
        )}
      </div>
    </div>
  );
}

/** Practice positions taken from the user's own mistakes. Progress is remembered in the browser. */
export function PuzzleDrill({ puzzles }: { puzzles: PuzzleItem[] }) {
  const [solved, setSolved] = useState(loadSolved);
  const [index, setIndex] = useState(0);
  if (puzzles.length === 0) return null;
  const i = Math.min(index, puzzles.length - 1);
  const puzzle = puzzles[i];
  const solvedHere = puzzles.filter((p) => solved.has(p.id)).length;
  const next = () => setIndex((i + 1) % puzzles.length);
  const prev = () => setIndex((i - 1 + puzzles.length) % puzzles.length);

  return (
    <div className="card puzzle">
      <div className="puzzle-head">
        <h3>Practice your mistakes</h3>
        <span className="muted small">
          Puzzle {i + 1} of {puzzles.length} · {solvedHere} solved{solved.has(puzzle.id) ? " · this one solved" : ""}
        </span>
      </div>
      <Puzzle
        key={puzzle.id}
        puzzle={puzzle}
        onSolved={() =>
          setSolved((s) => {
            const n = new Set(s).add(puzzle.id);
            saveSolved(n);
            return n;
          })
        }
      />
      <div className="puzzle-nav">
        <button className="btn btn-ghost" onClick={prev}>
          ← Previous
        </button>
        <button className="btn btn-primary" onClick={next}>
          Next puzzle →
        </button>
      </div>
    </div>
  );
}
