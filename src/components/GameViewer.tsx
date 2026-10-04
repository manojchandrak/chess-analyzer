import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoplay } from "../hooks/useAutoplay";
import { useLiveEval } from "../hooks/useLiveEval";
import { useSpokenMoves } from "../hooks/useSpokenMoves";
import { formatScore } from "../lib/accuracy";
import { analyzeGame, analyzeWithEvals, evalsFromWhitePerspective, type AnalysisResult } from "../lib/analyze";
import { CLASS_META } from "../lib/classify";
import { uciSquares, type BoardArrow } from "../lib/boardText";
import { EngineError, type StockfishEngine } from "../lib/engine";
import { setGameStats, statsFromAnalysis } from "../lib/gameStats";
import { toPgn, type GameRecord } from "../lib/games";
import { loadOpenings, openingsAlong, type OpeningName } from "../lib/openings";
import type { ParsedGame } from "../lib/pgn";
import { annotatedPgn, downloadText, pgnFilename } from "../lib/pgnExport";
import { sanSquares } from "../lib/uci";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";
import { ClassificationTable } from "./ClassificationTable";
import { EngineLines } from "./EngineLines";
import { EvalBar } from "./EvalBar";
import { EvalChart } from "./EvalChart";
import { PhaseTable } from "./PhaseTable";
import { PlayerSummary } from "./PlayerSummary";
import { ProgressBar } from "./ProgressBar";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MATE_CP = 90000;

// Finished Stockfish analyses, so reopening a game doesn't re-run the engine.
const analysisCache = new Map<string, AnalysisResult>();

interface Props {
  game: ParsedGame;
  record?: GameRecord | null;
  engine: StockfishEngine | null;
  heading?: string;
  onBack?: () => void;
  /** Run a full Stockfish review at this depth as soon as the game opens. */
  autoAnalyzeDepth?: number;
  /** Move to show first (for shared links), and a callback when the shown move changes. */
  initialPly?: number;
  onPlyChange?: (ply: number) => void;
  /** A link that reopens this game at the current move (Lichess and legend games). */
  shareUrl?: string | null;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function GameViewer({ game, record, engine, heading, onBack, autoAnalyzeDepth, initialPly, onPlyChange, shareUrl }: Props) {
  const [ply, setPly] = useState(() => Math.max(0, Math.min(initialPly ?? 0, game.moves.length)));
  const [flipped, setFlipped] = useState(record?.playerColor === "b");
  const [depth, setDepth] = useState(autoAnalyzeDepth ?? 12);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => {
    const hit = record ? analysisCache.get(`${record.id}:${autoAnalyzeDepth ?? 12}`) : undefined;
    if (hit) return hit;
    // Lichess games analyzed on the site come with evals: show them until Stockfish finishes.
    return record?.evals ? analyzeWithEvals(game, evalsFromWhitePerspective(game, record.evals), { bookPlies: record.openingPly ?? 0 }) : null;
  });
  const [fromStockfish, setFromStockfish] = useState(() => !!(record && analysisCache.has(`${record.id}:${autoAnalyzeDepth ?? 12}`)));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [engineOn, setEngineOn] = useState(false);
  const [showArrows, setShowArrows] = useState(true);
  const [focusLine, setFocusLine] = useState<{ fen: string; index: number } | null>(null);
  const [copied, setCopied] = useState<"pgn" | "link" | false>(false);
  const [openingDb, setOpeningDb] = useState<Map<string, OpeningName> | null>(null);

  const current = ply > 0 ? game.moves[ply - 1] : null;
  const fen = current ? current.fenAfter : (game.moves[0]?.fenBefore ?? START_FEN);
  const openings = useMemo(() => (openingDb ? openingsAlong(game.moves, openingDb) : null), [openingDb, game]);
  const opening = openings?.perPly[ply] ?? null;

  const { live, error: liveError, retry: retryLive } = useLiveEval(engineOn, fen);
  const { playing, toggle: toggleAutoplay } = useAutoplay(ply, game.moves.length, setPly);
  const { speak, supported: speechOk, toggle: toggleSpeak } = useSpokenMoves(ply, current?.san ?? null);

  useEffect(() => {
    loadOpenings().then(setOpeningDb);
  }, []);

  useEffect(() => onPlyChange?.(ply), [ply, onPlyChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(game.moves.length, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "Home") setPly(0);
      if (e.key === "End") setPly(game.moves.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  const runEngine = useCallback(
    async (atDepth: number) => {
      if (!engine) return;
      setEngineOn(true);
      setReviewError(null);
      setProgress({ done: 0, total: game.moves.length + 1 });
      try {
        const bookPlies = Math.max(record?.openingPly ?? 0, openingsAlong(game.moves, await loadOpenings()).bookPlies);
        const result = await analyzeGame(game, engine, atDepth, (done, total) => setProgress({ done, total }), { multiPv: 2, bookPlies });
        const key = record ? `${record.id}:${atDepth}` : null;
        if (key) analysisCache.set(key, result);
        if (record?.playerColor) setGameStats(record.id, statsFromAnalysis(result, record.playerColor));
        setAnalysis(result);
        setFromStockfish(true);
      } catch (e) {
        setReviewError(e instanceof EngineError ? e.message : "The review stopped because of an unexpected error.");
      } finally {
        setProgress(null);
      }
    },
    [engine, game, record],
  );

  useEffect(() => {
    if (autoAnalyzeDepth && engine && !fromStockfish) void runEngine(autoAnalyzeDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opened game
  }, [game, autoAnalyzeDepth, engine]);

  const currentAnalysis = analysis && ply > 0 ? analysis.moves[ply - 1] : null;

  // What the eval bar shows. To keep it steady while stepping through moves: the
  // review's eval until the live engine is at least as deep on this position,
  // or the live engine's last reading when there's no review.
  const liveHere = engineOn && live && live.fen === fen ? live : null;
  const liveShown = engineOn ? (liveHere ?? live) : null;
  const liveScore = liveShown
    ? (() => {
        const sign = liveShown.fen.split(" ")[1] === "w" ? 1 : -1;
        return { cp: liveShown.cp === null ? null : sign * liveShown.cp, mate: liveShown.mate === null ? null : sign * liveShown.mate, depth: liveShown.depth };
      })()
    : null;
  let bar: { cp: number | null; mate: number | null; depth: number | null; mated?: "w" | "b" } | null = null;
  if (liveHere && liveScore && (!analysis || liveHere.depth >= 14)) {
    bar = liveScore;
  } else if (!analysis && liveScore) {
    bar = liveScore;
  } else if (analysis) {
    const v = currentAnalysis ? currentAnalysis.evalAfterWhite : 20;
    bar = Math.abs(v) >= MATE_CP ? { cp: null, mate: v > 0 ? Math.max(1, Math.round((100000 - v) / 100)) : -Math.max(1, Math.round((100000 + v) / 100)), depth: null } : { cp: v, mate: null, depth: null };
  }
  if (bar && current?.san.includes("#")) bar = { cp: null, mate: null, depth: null, mated: current.color };

  // Arrows: the move the player should have made, and the live engine's top lines.
  const focus = focusLine && focusLine.fen === fen ? focusLine.index : 0;
  const arrows = useMemo(() => {
    if (!showArrows) return [];
    const out: BoardArrow[] = [];
    if (current && currentAnalysis?.bestSan) {
      const sq = sanSquares(current.fenBefore, currentAnalysis.bestSan);
      if (sq) out.push({ ...sq, color: "#81b64c", opacity: 0.8 });
    }
    if (liveHere) {
      liveHere.lines.slice(0, 3).forEach((line, i) => {
        const sq = uciSquares(line.pv[0] ?? "");
        if (sq) out.push({ ...sq, color: i === focus ? "#2f7fc0" : "#7aa6cf", opacity: i === focus ? 0.9 : 0.45 });
      });
    }
    return out;
  }, [showArrows, current, currentAnalysis, liveHere, focus]);

  const pairs = useMemo(() => {
    const out: { no: number; w?: number; b?: number }[] = [];
    game.moves.forEach((m, i) => {
      if (m.color === "w" || out.length === 0) out.push({ no: m.moveNumber });
      out[out.length - 1][m.color] = i;
    });
    return out;
  }, [game]);

  const moveButton = (i: number | undefined) => {
    if (i === undefined) return <span className="mv mv-empty" />;
    const cls = analysis?.moves[i]?.cls;
    const meta = cls ? CLASS_META[cls] : null;
    return (
      <button className={`mv${ply === i + 1 ? " mv-current" : ""}`} onClick={() => setPly(i + 1)} title={meta?.label} aria-current={ply === i + 1 ? "step" : undefined}>
        {game.moves[i].san}
        {meta && cls !== "good" && cls !== "excellent" && (
          <span className="mv-class" style={{ color: meta.color }}>
            {meta.symbol}
          </span>
        )}
      </button>
    );
  };

  const meta = currentAnalysis ? CLASS_META[currentAnalysis.cls] : null;

  return (
    <section className="viewer">
      <div className="viewer-head">
        {onBack && (
          <button className="btn btn-ghost" onClick={onBack}>
            ← Back
          </button>
        )}
        <div>
          <h2>{heading ?? `${game.white} vs ${game.black}`}</h2>
          <p className="muted">
            {game.white}
            {game.whiteElo ? ` (${game.whiteElo})` : ""} – {game.black}
            {game.blackElo ? ` (${game.blackElo})` : ""} · {game.result}
            {record?.date ? ` · ${record.date}` : ""}
            {record?.opening ? ` · ${record.opening}` : ""}
            {record?.url && (
              <>
                {" · "}
                <a href={record.url} target="_blank" rel="noreferrer">
                  open on {record.source === "lichess" ? "Lichess" : "Chess.com"}
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-board">
          <div className="board-wrap board-wrap-bar">
            <EvalBar cp={bar?.cp ?? 0} mate={bar?.mate ?? null} flipped={flipped} depth={bar?.depth} mated={bar?.mated} empty={!bar} />
            <Board
              fen={fen}
              flipped={flipped}
              lastMove={current ? { from: current.from, to: current.to } : null}
              badge={current && meta ? { square: current.to, symbol: meta.symbol, color: meta.color, label: meta.label } : null}
              arrows={arrows}
            />
          </div>
          <div className="viewer-controls" role="group" aria-label="Board controls">
            <button className="btn btn-ghost" onClick={() => setPly(0)} aria-label="First move">
              ⏮
            </button>
            <button className="btn btn-ghost" onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous move">
              ◀
            </button>
            <span className="ply-label" aria-live="polite">
              {current ? `${current.moveNumber}${current.color === "w" ? "." : "…"} ${current.san}` : "Start"}
            </span>
            <button className="btn btn-ghost" onClick={() => setPly((p) => Math.min(game.moves.length, p + 1))} aria-label="Next move">
              ▶
            </button>
            <button className="btn btn-ghost" onClick={() => setPly(game.moves.length)} aria-label="Last move">
              ⏭
            </button>
            <button className="btn btn-ghost" onClick={() => setFlipped((f) => !f)} aria-label="Flip board">
              ⇅
            </button>
            <button
              className={`btn btn-ghost${playing ? " btn-on" : ""}`}
              onClick={() => toggleAutoplay(() => setPly(0))}
              aria-label={playing ? "Pause autoplay" : "Autoplay the game"}
              aria-pressed={playing}
              title={playing ? "Pause" : "Play through the game"}
            >
              {playing ? "⏸" : "⏯"}
            </button>
            {speechOk && (
              <button
                className={`btn btn-ghost${speak ? " btn-on" : ""}`}
                onClick={toggleSpeak}
                aria-pressed={speak}
                aria-label="Read moves aloud"
                title={speak ? "Stop reading moves aloud" : "Read moves aloud"}
              >
                {speak ? "🔊" : "🔈"}
              </button>
            )}
            <button className={`btn btn-ghost${showArrows ? " btn-on" : ""}`} onClick={() => setShowArrows((s) => !s)} aria-pressed={showArrows} aria-label="Show arrows" title="Arrows for the best move and engine lines">
              ➚
            </button>
          </div>
          <BoardSettings />
        </div>

        <div className="viewer-moves">
          <div className="engine-panel engine-panel-col">
            <label className="toggle">
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
              <span className="toggle-track" />
              Stockfish
            </label>
            {engineOn && liveError && (
              <p className="error-message engine-error">
                {liveError}
                <button className="btn btn-ghost" onClick={retryLive}>
                  Retry
                </button>
              </p>
            )}
            {engineOn && !liveError && (
              <div className="engine-lines-slot" aria-live="off">
                {current?.san.includes("#") ? (
                  <strong>Checkmate</strong>
                ) : liveShown && liveScore ? (
                  <EngineLines info={liveShown} current={!!liveHere} focus={focus} onFocus={(index) => setFocusLine({ fen, index })} />
                ) : (
                  <span className="muted small">thinking…</span>
                )}
              </div>
            )}
            {engineOn && !liveError && liveShown && liveScore && (
              <span className="visually-hidden" aria-live="polite">
                Engine evaluation {formatScore(liveScore.cp, liveScore.mate)} at depth {liveScore.depth}
              </span>
            )}
          </div>

          {!currentAnalysis && (
            <div className="move-verdict">
              <span className="muted">
                {analysis ? "Step through the moves to see how each one was rated." : progress ? "Stockfish is rating every move…" : "Run the Stockfish review to rate every move."}
              </span>
            </div>
          )}
          {currentAnalysis && meta && (
            <div className="move-verdict" style={{ borderColor: meta.color }}>
              <span className="class-icon" style={{ background: meta.color }}>
                {meta.symbol}
              </span>
              <span>
                <strong>{currentAnalysis.san}</strong> is {currentAnalysis.cls === "book" ? "a book move" : `${article(meta.label)} ${meta.label.toLowerCase()} move`}
                {currentAnalysis.bestSan ? (
                  <>
                    . Best was <strong>{currentAnalysis.bestSan}</strong>
                  </>
                ) : null}
                .
              </span>
            </div>
          )}

          <div className="opening-line" aria-live="polite">
            {opening ? (
              <>
                <span className="eco">{opening.eco}</span> {opening.name}
                {openings && ply > openings.bookPlies && game.moves[openings.bookPlies] && (
                  <span className="muted small">
                    {" "}
                    · out of book from {game.moves[openings.bookPlies].moveNumber}
                    {game.moves[openings.bookPlies].color === "w" ? "." : "…"} {game.moves[openings.bookPlies].san}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">{ply === 0 ? "Starting position" : "Opening not in the book"}</span>
            )}
          </div>

          <div className="move-list" role="list" aria-label="Moves">
            {pairs.map((p) => (
              <div className="move-row" key={p.no} role="listitem">
                <span className="move-no">{p.no}.</span>
                {moveButton(p.w)}
                {moveButton(p.b)}
              </div>
            ))}
          </div>
          <div className="viewer-actions">
            {!fromStockfish && !progress && (
              <>
                <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Engine depth">
                  <option value={10}>Depth 10 (fast)</option>
                  <option value={12}>Depth 12</option>
                  <option value={16}>Depth 16 (slow)</option>
                </select>
                <button className="btn btn-primary" onClick={() => void runEngine(depth)} disabled={!engine}>
                  Review with Stockfish
                </button>
              </>
            )}
            <button
              className="btn btn-ghost"
              onClick={async () => {
                const pgn = record ? toPgn(record) : game.moves.map((m, i) => (i % 2 === 0 ? `${m.moveNumber}. ${m.san}` : m.san)).join(" ");
                try {
                  await navigator.clipboard.writeText(pgn);
                  setCopied("pgn");
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied === "pgn" ? "Copied" : "Copy PGN"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={!shareUrl}
              title={shareUrl ? "Copy a link to this game at this move" : "Only Lichess games and the legends' games can be shared by link"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl as string);
                  setCopied("link");
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button className="btn btn-ghost" onClick={() => downloadText(pgnFilename(game), annotatedPgn(game, record, analysis))} title={analysis ? "Moves with evaluations and annotations" : "Moves only; run the review first to include evaluations"}>
              Download PGN
            </button>
            <a className="btn btn-ghost" href={`https://lichess.org/analysis/${fen.replace(/ /g, "_")}`} target="_blank" rel="noreferrer">
              Open position on Lichess
            </a>
          </div>
        </div>
      </div>

      {progress && <ProgressBar done={progress.done} total={progress.total} label="Stockfish review" />}
      {reviewError && (
        <p className="error-message engine-error">
          {reviewError}
          <button className="btn btn-ghost" onClick={() => void runEngine(depth)}>
            Try again
          </button>
        </p>
      )}

      {analysis && (
        <div className="results">
          {!fromStockfish && record?.evals && <p className="muted small">Showing Lichess's own analysis of this game. Run the Stockfish review for Best, Great and Brilliant moves.</p>}
          <div className="player-summaries">
            <PlayerSummary color="White" stats={analysis.white} />
            <PlayerSummary color="Black" stats={analysis.black} />
          </div>
          <h3>Move classifications</h3>
          <ClassificationTable white={analysis.white} black={analysis.black} />
          <h3>Accuracy by phase</h3>
          <PhaseTable white={analysis.white} black={analysis.black} />
          <h3>Evaluation over time</h3>
          <EvalChart moves={analysis.moves} openingEndPly={analysis.openingEndPly} endgameStartPly={analysis.endgameStartPly} currentPly={ply} onSelect={setPly} />
        </div>
      )}
    </section>
  );
}
