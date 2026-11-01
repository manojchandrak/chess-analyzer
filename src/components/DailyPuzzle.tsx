import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { dayKey, fetchDailyPuzzle, isSolutionMove, loadDaily, playUci, saveDaily, streakOf, type DailyOutcome, type DailyPuzzle as Daily } from "../lib/dailyPuzzle";
import { fetchGmPuzzle, loadCachedGm, saveCachedGm, type GmPuzzle } from "../lib/gmPuzzle";
import type { GameRecord } from "../lib/games";
import { isOwnPiece, legalTargets, type PuzzleItem } from "../lib/puzzles";
import { pvToSan } from "../lib/uci";
import { Board } from "./Board";
import { Puzzle } from "./PuzzleDrill";

type Status = "playing" | "solved" | "shown";
type Source = "gm" | "lichess";
type OpenGame = (game: GameRecord, heading?: string, ply?: number) => void;

/** The daily puzzle: a position from a recent grandmaster game, or Lichess's puzzle of the day. Your streak is kept in this browser. */
export function DailyPuzzle({ onOpenGame }: { onOpenGame?: OpenGame }) {
  const [source, setSource] = useState<Source>("gm");
  const [history, setHistory] = useState(loadDaily);
  const today = dayKey(new Date());
  const record = (outcome: DailyOutcome) => setHistory((h) => saveDaily(h, today, outcome));
  const streak = streakOf(history, new Date());
  const doneToday = history[today] === "clean" || history[today] === "solved";

  return (
    <div className="card puzzle">
      <div className="puzzle-head">
        <h3>Daily puzzle</h3>
        <span className="muted small">
          {streak > 0 ? `🔥 ${streak}-day streak` : "Solve it to start a streak"}
          {doneToday ? " · today solved" : ""}
        </span>
      </div>
      <div className="chips" role="group" aria-label="Where today's puzzle comes from">
        <button className={`chip${source === "gm" ? " chip-on" : ""}`} onClick={() => setSource("gm")}>
          Grandmaster game
        </button>
        <button className={`chip${source === "lichess" ? " chip-on" : ""}`} onClick={() => setSource("lichess")}>
          Lichess puzzle
        </button>
      </div>
      {source === "gm" ? <GmDaily day={today} onFinish={record} onOpenGame={onOpenGame} /> : <LichessDaily onFinish={record} />}
    </div>
  );
}

/** A position from a recent grandmaster game. Who played it stays hidden until you've solved it, then you can open the whole game. */
function GmDaily({ day, onFinish, onOpenGame }: { day: string; onFinish: (outcome: DailyOutcome) => void; onOpenGame?: OpenGame }) {
  const [puzzle, setPuzzle] = useState<GmPuzzle | null>(() => loadCachedGm(day));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (puzzle) return;
    let current = true;
    fetchGmPuzzle(day)
      .then((p) => {
        saveCachedGm(day, p);
        if (current) setPuzzle(p);
      })
      .catch((e) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [attempt, day, puzzle]);

  if (error) {
    return (
      <p className="error-message">
        Couldn't find a grandmaster puzzle today ({error}). Try the Lichess puzzle instead, or{" "}
        <button
          className="link"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          try again
        </button>
        .
      </p>
    );
  }
  if (!puzzle) {
    return (
      <p className="muted" role="status">
        Finding a recent grandmaster game…
      </p>
    );
  }
  const item: PuzzleItem = { id: puzzle.id, gameId: puzzle.record.id, fen: puzzle.fen, color: puzzle.color, played: puzzle.best, best: puzzle.best, cpLoss: 0, quality: "mistake", opponent: null, date: null };
  const { record } = puzzle;
  return (
    <Puzzle
      key={puzzle.id}
      puzzle={item}
      onResult={onFinish}
      prompt={
        <p>
          <strong>{puzzle.color === "w" ? "White" : "Black"} to move.</strong> This position comes from a recent grandmaster game. The grandmaster found a strong move here. Can you find it?
        </p>
      }
      afterDone={
        <div className="puzzle-reveal">
          <p>
            <strong>{puzzle.gm}</strong> (GM) played <strong>{puzzle.best}</strong> against {puzzle.opponent}
            {record.date ? ` on ${record.date}` : ""}
            {record.timeClass ? `, ${record.timeClass}` : ""}.
          </p>
          <div className="puzzle-nav">
            {onOpenGame && (
              <button className="btn btn-primary" onClick={() => onOpenGame(record, `${record.white} vs ${record.black}`, puzzle.ply + 1)}>
                Replay the full game
              </button>
            )}
            {record.url && (
              <a className="btn btn-ghost" href={record.url} target="_blank" rel="noreferrer">
                On Lichess
              </a>
            )}
          </div>
        </div>
      }
    />
  );
}

/** Today's puzzle from Lichess, solved over several moves. */
function LichessDaily({ onFinish }: { onFinish: (outcome: DailyOutcome) => void }) {
  const [puzzle, setPuzzle] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchDailyPuzzle()
      .then((p) => current && setPuzzle(p))
      .catch((e) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <p className="error-message">
        Couldn't load today's puzzle ({error}).{" "}
        <button
          className="link"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </p>
    );
  }
  if (!puzzle) {
    return (
      <p className="muted" role="status">
        Loading today's puzzle…
      </p>
    );
  }
  return <DailyBoard key={puzzle.id} puzzle={puzzle} onFinish={onFinish} />;
}

function DailyBoard({ puzzle, onFinish }: { puzzle: Daily; onFinish: (outcome: "clean" | "solved" | "failed") => void }) {
  const [fen, setFen] = useState(puzzle.fen);
  /** Index in the solution of the move you must find next. */
  const [step, setStep] = useState(0);
  const [replying, setReplying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [wrong, setWrong] = useState<string | null>(null);
  const [wrongTries, setWrongTries] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const targets = useMemo(() => (selected ? legalTargets(fen, selected) : []), [selected, fen]);
  const playing = status === "playing" && !replying;

  // The opponent's reply is played for you after a short pause.
  useEffect(() => {
    if (!replying) return;
    const timer = setTimeout(() => {
      const reply = puzzle.solution[step];
      const next = reply ? playUci(fen, reply) : null;
      if (next && reply) {
        setFen(next);
        setLastMove({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
        setStep(step + 1);
      }
      setReplying(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [replying, step, fen, puzzle.solution]);

  function finish(outcome: "clean" | "solved") {
    setStatus("solved");
    onFinish(outcome);
  }

  function attempt(move: { from: string; to: string; promotion?: string }) {
    setSelected(null);
    if (!isSolutionMove(fen, puzzle.solution, step, move)) {
      setWrongTries((n) => n + 1);
      try {
        const san = new Chess(fen).move(move).san;
        setWrong(`${san} isn't it. Try again.`);
      } catch {
        setWrong("That isn't a legal move.");
      }
      return;
    }
    const chess = new Chess(fen);
    chess.move(move);
    setWrong(null);
    setShowHint(false);
    setFen(chess.fen());
    setLastMove({ from: move.from, to: move.to });
    if (step + 1 >= puzzle.solution.length || chess.isCheckmate()) return finish(wrongTries === 0 && !hinted ? "clean" : "solved");
    setStep(step + 1);
    setReplying(true);
  }

  function onSquare(square: string) {
    if (!playing) return;
    if (selected && targets.includes(square)) return attempt({ from: selected, to: square, promotion: "q" });
    setSelected(isOwnPiece(fen, square) && square !== selected ? square : null);
    setWrong(null);
  }

  const solutionText = pvToSan(puzzle.fen, puzzle.solution, 12);
  const hintSquare = puzzle.solution[step]?.slice(0, 2);
  const lichessUrl = `https://lichess.org/training/${puzzle.id}`;

  return (
    <div className="puzzle-body">
      <div className="puzzle-board">
        <Board fen={fen} flipped={puzzle.color === "b"} lastMove={lastMove} onSquareClick={onSquare} selected={selected} targets={targets} hints={showHint && hintSquare ? [hintSquare] : []} />
      </div>
      <div className="puzzle-info">
        <p>
          <strong>{puzzle.color === "w" ? "White" : "Black"} to move.</strong> Find the best line: you play your moves and the opponent's replies are played for you.
        </p>
        <p className="muted small">
          {puzzle.rating ? `Rated ${puzzle.rating}` : "Today's puzzle"}
          {puzzle.themes.length > 0 ? ` · ${puzzle.themes.map(humanTheme).join(", ")}` : ""} ·{" "}
          <a href={lichessUrl} target="_blank" rel="noreferrer">
            Lichess
          </a>
        </p>
        <div role="status" className="puzzle-feedback">
          {status === "playing" && replying && <p className="muted">Good. Here's the reply…</p>}
          {status === "playing" && !replying && step > 0 && !wrong && <p className="puzzle-ok">Right. Keep going.</p>}
          {wrong && <p className="puzzle-wrong">{wrong}</p>}
          {status === "solved" && (
            <p className="puzzle-ok">
              Solved{wrongTries === 0 && !hinted ? " with no mistakes" : ""}! The line was <strong>{solutionText}</strong>.
            </p>
          )}
          {status === "shown" && (
            <p>
              The solution was <strong>{solutionText}</strong>.
            </p>
          )}
        </div>
        {status === "playing" && (
          <div className="puzzle-nav">
            <button
              className="btn btn-ghost"
              disabled={replying}
              onClick={() => {
                setHinted(true);
                setShowHint(true);
              }}
            >
              Hint
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStatus("shown");
                setReplying(false);
                setSelected(null);
                setWrong(null);
                onFinish("failed");
              }}
            >
              Show solution
            </button>
          </div>
        )}
        {status !== "playing" && <p className="muted small">Come back tomorrow for a new one.</p>}
      </div>
    </div>
  );
}

/** "mateIn3" → "mate in 3", "endgame" → "endgame". */
function humanTheme(theme: string): string {
  return theme.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
}
