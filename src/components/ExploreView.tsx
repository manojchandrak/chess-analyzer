import { useEffect, useMemo, useState } from "react";
import { useLiveEval } from "../hooks/useLiveEval";
import { uciSquares, type BoardArrow } from "../lib/boardText";
import { EngineError, type StockfishEngine } from "../lib/engine";
import { currentFen, isPromotion, numbered, ownPiece, play, playUci, sideToMove, startExplore, status, targetsFrom, undo, type ExploreState } from "../lib/explore";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";
import { EngineLines } from "./EngineLines";
import { EvalBar } from "./EvalBar";

type Mode = "both" | "w" | "b";

/** Engine strength: search depth. Shallow searches make visible mistakes, deep ones don't. */
const LEVELS = [
  { id: "easy", label: "Beginner", depth: 1 },
  { id: "club", label: "Club player", depth: 6 },
  { id: "strong", label: "Strong", depth: 12 },
] as const;

interface Props {
  /** The position to continue from. */
  startFen: string;
  /** Moves (UCI) to play first, e.g. an alternative the user wants to follow. */
  initialUci?: string[];
  /** What the position is, for the heading ("after 12. Nf3", "from your FEN"). */
  label: string;
  flipped?: boolean;
  engine: StockfishEngine | null;
  onExit: () => void;
  exitLabel?: string;
}

function initialState(startFen: string, initialUci: string[] = []): ExploreState {
  return initialUci.reduce((s, uci) => playUci(s, uci) ?? s, startExplore(startFen));
}

/** A playable board for "continue from here": move pieces for both sides to explore, or play
 * one side against Stockfish. The live engine can score the position and draw its top lines. */
export function ExploreView({ startFen, initialUci, label, flipped: startFlipped = false, engine, onExit, exitLabel = "← Back to the game" }: Props) {
  const [state, setState] = useState(() => initialState(startFen, initialUci));
  const [mode, setMode] = useState<Mode>("both");
  const [levelId, setLevelId] = useState<(typeof LEVELS)[number]["id"]>("club");
  const [flipped, setFlipped] = useState(startFlipped);
  const [selected, setSelected] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<{ from: string; to: string } | null>(null);
  // The position the engine failed to answer (so we don't retry in a loop until the user asks).
  const [failedFen, setFailedFen] = useState<string | null>(null);
  const [engineOn, setEngineOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<{ fen: string; arrow: BoardArrow } | null>(null);
  const [focusLine, setFocusLine] = useState<{ fen: string; index: number } | null>(null);

  const fen = currentFen(state);
  const turn = sideToMove(state);
  const result = useMemo(() => status(state), [state]);
  const last = state.moves[state.moves.length - 1] ?? null;
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[1];
  const humanTurn = mode === "both" || mode === turn;
  const engineTurn = mode !== "both" && mode !== turn && !result.over && !!engine;
  const thinking = engineTurn && failedFen !== fen;
  const targets = useMemo(() => (selected ? targetsFrom(fen, selected) : []), [selected, fen]);

  const { live, error: liveError, retry: retryLive } = useLiveEval(engineOn && !result.over, fen);
  const liveHere = engineOn && live && live.fen === fen ? live : null;
  const focus = focusLine && focusLine.fen === fen ? focusLine.index : 0;

  // The engine's reply, when it is the engine's turn.
  useEffect(() => {
    if (!engineTurn || !engine || failedFen === fen) return;
    let cancelled = false; // leaving this position (undo, reset, new mode) cancels the pending reply
    engine.evaluate(fen, level.depth).then(
      (e) => {
        if (cancelled) return;
        if (e.best) setState((s) => (currentFen(s) === fen ? (playUci(s, e.best as string) ?? s) : s));
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof EngineError ? err.message : "The engine couldn't reply.");
        setFailedFen(fen);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fen, engineTurn, engine, failedFen, level.depth]);

  function attempt(from: string, to: string, promotion?: string) {
    const next = play(state, { from, to, promotion });
    setSelected(null);
    setPromoting(null);
    setHint(null);
    if (next) setState(next);
  }

  function onSquare(square: string) {
    if (result.over || !humanTurn || promoting) return;
    if (selected && targets.includes(square)) {
      if (isPromotion(fen, selected, square)) setPromoting({ from: selected, to: square });
      else attempt(selected, square);
      return;
    }
    setSelected(ownPiece(fen, square) && square !== selected ? square : null);
  }

  async function showHint() {
    if (!engine) return;
    setError(null);
    try {
      const e = await engine.evaluate(fen, 12);
      const sq = e.best ? uciSquares(e.best) : null;
      if (sq) setHint({ fen, arrow: { ...sq, color: "#81b64c", opacity: 0.9 } });
    } catch (err) {
      setError(err instanceof EngineError ? err.message : "The engine couldn't find a hint.");
    }
  }

  const takeBack = () => {
    // Against the engine, take back your move and its reply together.
    const plies = mode === "both" ? 1 : humanTurn ? Math.min(2, state.moves.length) : 1;
    setState((s) => undo(s, plies));
    setSelected(null);
    setHint(null);
  };

  const arrows: BoardArrow[] = [];
  if (hint && hint.fen === fen) arrows.push(hint.arrow);
  if (liveHere && !result.over) {
    liveHere.lines.slice(0, 3).forEach((line, i) => {
      const sq = uciSquares(line.pv[0] ?? "");
      if (sq) arrows.push({ ...sq, color: i === focus ? "#2f7fc0" : "#7aa6cf", opacity: i === focus ? 0.9 : 0.45 });
    });
  }

  const liveShown = engineOn ? (liveHere ?? live) : null;
  const sign = liveShown ? (liveShown.fen.split(" ")[1] === "w" ? 1 : -1) : 1;
  const bar = liveShown ? { cp: liveShown.cp === null ? null : sign * liveShown.cp, mate: liveShown.mate === null ? null : sign * liveShown.mate, depth: liveShown.depth } : null;
  const matedColor = result.text?.startsWith("Checkmate") ? turn : undefined;
  const rows = numbered(state);

  return (
    <section className="viewer explore">
      <div className="viewer-head">
        <button className="btn btn-ghost" onClick={onExit}>
          {exitLabel}
        </button>
        <div>
          <h2>Playing on {label}</h2>
          <p className="muted">
            {mode === "both" ? "Move pieces for both sides to explore ideas." : `You play ${mode === "w" ? "White" : "Black"} against Stockfish (${level.label}).`} Click a piece and a square, or drag it.
          </p>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-board">
          <div className="board-wrap board-wrap-bar">
            <EvalBar cp={bar?.cp ?? 0} mate={bar?.mate ?? null} flipped={flipped} depth={bar?.depth} mated={matedColor} empty={!bar && !matedColor} />
            <Board fen={fen} flipped={flipped} lastMove={last ? { from: last.from, to: last.to } : null} onSquareClick={onSquare} selected={selected} targets={targets} arrows={arrows} />
          </div>
          {promoting && (
            <div className="promotion-choice" role="group" aria-label="Promote the pawn to">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button key={p} className="btn btn-ghost" onClick={() => attempt(promoting.from, promoting.to, p)}>
                  {{ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[p]}
                </button>
              ))}
            </div>
          )}
          <div className="viewer-controls" role="group" aria-label="Board controls">
            <button className="btn btn-ghost" onClick={takeBack} disabled={state.moves.length === 0} aria-label="Take back a move">
              ↶ Undo
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setState(startExplore(startFen));
                setSelected(null);
                setHint(null);
              }}
              disabled={state.moves.length === 0}
            >
              Reset
            </button>
            <button className="btn btn-ghost" onClick={() => setFlipped((f) => !f)} aria-label="Flip board">
              ⇅
            </button>
            <button className="btn btn-ghost" onClick={() => void showHint()} disabled={!engine || result.over || !humanTurn}>
              Show best move
            </button>
          </div>
          <BoardSettings />
        </div>

        <div className="viewer-moves">
          <div className="explore-options card">
            <div className="chips" role="group" aria-label="Who plays">
              {([["both", "Analysis board"], ["w", "Play White"], ["b", "Play Black"]] as const).map(([id, text]) => (
                <button
                  key={id}
                  className={`chip${mode === id ? " chip-on" : ""}`}
                  onClick={() => {
                    setMode(id);
                    setSelected(null);
                    if (id === "b") setFlipped(true);
                    if (id === "w") setFlipped(false);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
            {mode !== "both" && (
              <label className="muted small">
                Opponent{" "}
                <select value={levelId} onChange={(e) => setLevelId(e.target.value as typeof levelId)} aria-label="Engine strength">
                  {LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="toggle">
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
              <span className="toggle-track" />
              Live evaluation
            </label>
          </div>

          <div role="status" className="explore-status">
            {result.over ? (
              <strong>{result.text}</strong>
            ) : thinking ? (
              <span className="muted">Stockfish is thinking…</span>
            ) : (
              <span className="muted">
                {turn === "w" ? "White" : "Black"} to move{result.inCheck ? " (in check)" : ""}.
              </span>
            )}
          </div>
          {(error || liveError) && (
            <p className="error-message engine-error">
              {error ?? liveError}
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setError(null);
                  setFailedFen(null);
                  retryLive();
                }}
              >
                Retry
              </button>
            </p>
          )}

          {engineOn && !result.over && (
            <div className="engine-lines-slot" aria-live="off">
              {liveShown ? <EngineLines info={liveShown} current={!!liveHere} focus={focus} onFocus={(index) => setFocusLine({ fen, index })} /> : <span className="muted small">thinking…</span>}
            </div>
          )}

          <div className="move-list explore-moves" role="list" aria-label="Moves played from this position">
            {rows.length === 0 && <p className="muted small explore-empty">No moves yet. Make a move on the board.</p>}
            {rows.map((r) => (
              <div className="move-row" key={r.no} role="listitem">
                <span className="move-no">{r.no}.</span>
                <span className="mv mv-static">{r.w ?? "…"}</span>
                {r.b ? <span className="mv mv-static">{r.b}</span> : <span className="mv mv-empty" />}
              </div>
            ))}
          </div>
          <div className="viewer-actions">
            <button
              className="btn btn-ghost"
              onClick={() => void navigator.clipboard?.writeText(fen)}
              title="Copy this position as FEN"
            >
              Copy FEN
            </button>
            <a className="btn btn-ghost" href={`https://lichess.org/analysis/${fen.replace(/ /g, "_")}`} target="_blank" rel="noreferrer">
              Open on Lichess
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
