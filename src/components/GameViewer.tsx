import { useEffect, useMemo, useState } from "react";
import { analyzeGame, analyzeWithEvals, evalsFromWhitePerspective, type AnalysisResult } from "../lib/analyze";
import type { StockfishEngine } from "../lib/engine";
import { toPgn, type GameRecord } from "../lib/games";
import type { ParsedGame } from "../lib/pgn";
import { Board } from "./Board";
import { EvalChart } from "./EvalChart";
import { PhaseTable } from "./PhaseTable";
import { PlayerSummary } from "./PlayerSummary";
import { ProgressBar } from "./ProgressBar";

const MARK = { best: "", inaccuracy: "?!", mistake: "?", blunder: "??" } as const;

interface Props {
  game: ParsedGame;
  record?: GameRecord | null;
  engine: StockfishEngine | null;
  heading?: string;
  onBack?: () => void;
  /** Run Stockfish at this depth as soon as the game opens (uploaded PGNs). */
  autoAnalyzeDepth?: number;
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 90000) return cp > 0 ? "White mates" : "Black mates";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(1)}`;
}

export function GameViewer({ game, record, engine, heading, onBack, autoAnalyzeDepth }: Props) {
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(record?.playerColor === "b");
  const [depth, setDepth] = useState(12);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Lichess games that were analyzed on the site come with evals: use them directly.
  useEffect(() => {
    setPly(0);
    setAnalysis(record?.evals ? analyzeWithEvals(game, evalsFromWhitePerspective(game, record.evals)) : null);
  }, [game, record]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(game.moves.length, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  async function runEngine(atDepth = depth) {
    if (!engine) return;
    setProgress({ done: 0, total: game.moves.length + 1 });
    const result = await analyzeGame(game, engine, atDepth, (done, total) => setProgress({ done, total }));
    setAnalysis(result);
    setProgress(null);
  }

  useEffect(() => {
    if (autoAnalyzeDepth && engine) runEngine(autoAnalyzeDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opened game
  }, [game, autoAnalyzeDepth, engine]);

  const current = ply > 0 ? game.moves[ply - 1] : null;
  const fen = current ? current.fenAfter : (game.moves[0]?.fenBefore ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const currentAnalysis = analysis && ply > 0 ? analysis.moves[ply - 1] : null;
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
    const q = analysis?.moves[i]?.quality;
    return (
      <button className={`mv${ply === i + 1 ? " mv-current" : ""}${q && q !== "best" ? ` mv-${q}` : ""}`} onClick={() => setPly(i + 1)}>
        {game.moves[i].san}
        {q ? MARK[q] : ""}
      </button>
    );
  };

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
          <Board fen={fen} flipped={flipped} lastMove={current ? { from: current.from, to: current.to } : null} />
          <div className="viewer-controls">
            <button className="btn btn-ghost" onClick={() => setPly(0)} aria-label="First move">
              ⏮
            </button>
            <button className="btn btn-ghost" onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous move">
              ◀
            </button>
            <span className="ply-label">{current ? `${current.moveNumber}${current.color === "w" ? "." : "…"} ${current.san}` : "Start"}</span>
            <button className="btn btn-ghost" onClick={() => setPly((p) => Math.min(game.moves.length, p + 1))} aria-label="Next move">
              ▶
            </button>
            <button className="btn btn-ghost" onClick={() => setPly(game.moves.length)} aria-label="Last move">
              ⏭
            </button>
            <button className="btn btn-ghost" onClick={() => setFlipped((f) => !f)} aria-label="Flip board">
              ⇅
            </button>
          </div>
          {currentAnalysis && (
            <p className="position-eval">
              Eval {formatEval(currentAnalysis.evalAfterWhite)}
              {currentAnalysis.quality !== "best" && (
                <span className={`quality-tag mv-${currentAnalysis.quality}`}>
                  {currentAnalysis.quality} (−{(Math.min(currentAnalysis.cpLoss, 2000) / 100).toFixed(1)})
                </span>
              )}
            </p>
          )}
        </div>

        <div className="viewer-moves">
          <div className="move-list">
            {pairs.map((p) => (
              <div className="move-row" key={p.no}>
                <span className="move-no">{p.no}.</span>
                {moveButton(p.w)}
                {moveButton(p.b)}
              </div>
            ))}
          </div>
          <div className="viewer-actions">
            {!analysis && !progress && (
              <>
                <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Engine depth">
                  <option value={10}>Depth 10 (fast)</option>
                  <option value={12}>Depth 12</option>
                  <option value={16}>Depth 16 (slow)</option>
                </select>
                <button className="btn btn-primary" onClick={() => runEngine()} disabled={!engine}>
                  Analyze with Stockfish
                </button>
              </>
            )}
            <button
              className="btn btn-ghost"
              onClick={async () => {
                const pgn = record ? toPgn(record) : game.moves.map((m, i) => (i % 2 === 0 ? `${m.moveNumber}. ${m.san}` : m.san)).join(" ");
                try {
                  await navigator.clipboard.writeText(pgn);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy PGN"}
            </button>
          </div>
        </div>
      </div>

      {progress && <ProgressBar done={progress.done} total={progress.total} />}

      {analysis && (
        <div className="results">
          {record?.evals && <p className="muted small">Using Lichess's own server analysis of this game.</p>}
          <div className="player-summaries">
            <PlayerSummary color="White" stats={analysis.white} />
            <PlayerSummary color="Black" stats={analysis.black} />
          </div>
          <h3>Accuracy by phase</h3>
          <PhaseTable white={analysis.white} black={analysis.black} />
          <h3>Evaluation over time</h3>
          <EvalChart moves={analysis.moves} openingEndPly={analysis.openingEndPly} endgameStartPly={analysis.endgameStartPly} />
        </div>
      )}
    </section>
  );
}
