import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatScore } from "../lib/accuracy";
import { analyzeGame, analyzeWithEvals, evalsFromWhitePerspective, type AnalysisResult } from "../lib/analyze";
import { setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";
import { CLASS_META } from "../lib/classify";
import { getLiveEngine, type LiveInfo, type StockfishEngine } from "../lib/engine";
import { setGameStats, statsFromAnalysis } from "../lib/gameStats";
import { toPgn, type GameRecord } from "../lib/games";
import { loadOpenings, openingsAlong, type OpeningName } from "../lib/openings";
import type { ParsedGame } from "../lib/pgn";
import { sanToSpeech, say, speechSupported, stopSpeaking } from "../lib/speech";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";
import { ClassificationTable } from "./ClassificationTable";
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
}

/** The engine's line as numbered SAN ("12. Nf3 Nc6 13. d4"), converted from UCI. */
function pvToSan(fen: string, pv: string[], max = 10): string {
  const chess = new Chess(fen);
  const parts: string[] = [];
  for (const uci of pv.slice(0, max)) {
    const turn = chess.turn();
    const moveNo = chess.moveNumber();
    let san: string;
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      break;
    }
    parts.push(turn === "w" ? `${moveNo}. ${san}` : parts.length === 0 ? `${moveNo}… ${san}` : san);
  }
  return parts.join(" ");
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function GameViewer({ game, record, engine, heading, onBack, autoAnalyzeDepth }: Props) {
  const cacheKey = (d: number) => (record ? `${record.id}:${d}` : null);
  const [ply, setPly] = useState(0);
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
  const [engineOn, setEngineOn] = useState(false);
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [openingDb, setOpeningDb] = useState<Map<string, OpeningName> | null>(null);
  const [playing, setPlaying] = useState(false);
  const { speak } = useBoardPrefs();
  const spokenPly = useRef(0);

  const current = ply > 0 ? game.moves[ply - 1] : null;
  const fen = current ? current.fenAfter : (game.moves[0]?.fenBefore ?? START_FEN);
  const openings = useMemo(() => (openingDb ? openingsAlong(game.moves, openingDb) : null), [openingDb, game]);
  const opening = openings?.perPly[ply] ?? null;

  useEffect(() => {
    loadOpenings().then(setOpeningDb);
    return () => stopSpeaking();
  }, []);

  // Autoplay: step forward every 1.6 s until the end of the game.
  useEffect(() => {
    if (!playing) return;
    if (ply >= game.moves.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setPly((p) => p + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, ply, game]);

  // Read each newly shown move aloud (just the move).
  useEffect(() => {
    if (!speak || ply === spokenPly.current) return;
    spokenPly.current = ply;
    if (current) say(sanToSpeech(current.san));
  }, [ply, speak, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(game.moves.length, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  // Live engine: follows the position on screen while switched on.
  useEffect(() => {
    if (!engineOn) return;
    const live = getLiveEngine();
    live.onInfo(setLive);
    live.analyze(fen);
    return () => {
      live.onInfo(null);
      live.stop();
    };
  }, [engineOn, fen]);

  async function runEngine(atDepth = depth) {
    if (!engine) return;
    setEngineOn(true);
    setProgress({ done: 0, total: game.moves.length + 1 });
    const bookPlies = Math.max(record?.openingPly ?? 0, openingsAlong(game.moves, await loadOpenings()).bookPlies);
    const result = await analyzeGame(game, engine, atDepth, (done, total) => setProgress({ done, total }), { multiPv: 2, bookPlies });
    const key = cacheKey(atDepth);
    if (key) analysisCache.set(key, result);
    if (record?.playerColor) setGameStats(record.id, statsFromAnalysis(result, record.playerColor));
    setAnalysis(result);
    setFromStockfish(true);
    setProgress(null);
  }

  useEffect(() => {
    if (autoAnalyzeDepth && engine && !fromStockfish) runEngine(autoAnalyzeDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opened game
  }, [game, autoAnalyzeDepth, engine]);

  const currentAnalysis = analysis && ply > 0 ? analysis.moves[ply - 1] : null;

  // What the eval bar shows: the live engine when it's on this position, else the review.
  const liveHere = engineOn && live && live.fen === fen ? live : null;
  let bar: { cp: number | null; mate: number | null; depth: number | null; mated?: "w" | "b" } | null = null;
  if (liveHere) {
    const sign = fen.split(" ")[1] === "w" ? 1 : -1;
    bar = { cp: liveHere.cp === null ? null : sign * liveHere.cp, mate: liveHere.mate === null ? null : sign * liveHere.mate, depth: liveHere.depth };
  } else if (analysis) {
    const v = currentAnalysis ? currentAnalysis.evalAfterWhite : 20;
    bar = Math.abs(v) >= MATE_CP ? { cp: null, mate: v > 0 ? Math.max(1, Math.round((100000 - v) / 100)) : -Math.max(1, Math.round((100000 + v) / 100)), depth: null } : { cp: v, mate: null, depth: null };
  }
  if (bar && current?.san.includes("#")) bar = { cp: null, mate: null, depth: null, mated: current.color };

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
      <button className={`mv${ply === i + 1 ? " mv-current" : ""}`} onClick={() => setPly(i + 1)} title={meta?.label}>
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
          <div className={`board-wrap${bar ? " board-wrap-bar" : ""}`}>
            {bar && <EvalBar cp={bar.cp} mate={bar.mate} flipped={flipped} depth={bar.depth} mated={bar.mated} />}
            <Board
              fen={fen}
              flipped={flipped}
              lastMove={current ? { from: current.from, to: current.to } : null}
              badge={current && meta ? { square: current.to, symbol: meta.symbol, color: meta.color, label: meta.label } : null}
            />
          </div>
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
            <button
              className={`btn btn-ghost${playing ? " btn-on" : ""}`}
              onClick={() => {
                if (!playing && ply >= game.moves.length) setPly(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause autoplay" : "Autoplay the game"}
              title={playing ? "Pause" : "Play through the game"}
            >
              {playing ? "⏸" : "⏯"}
            </button>
            {speechSupported() && (
              <button
                className={`btn btn-ghost${speak ? " btn-on" : ""}`}
                onClick={() => {
                  if (speak) stopSpeaking();
                  spokenPly.current = ply;
                  setBoardPrefs({ speak: !speak });
                }}
                aria-pressed={speak}
                aria-label="Read moves aloud"
                title={speak ? "Stop reading moves aloud" : "Read moves aloud"}
              >
                {speak ? "🔊" : "🔈"}
              </button>
            )}
          </div>
          <BoardSettings />
        </div>

        <div className="viewer-moves">
          <div className="engine-panel">
            <label className="toggle">
              <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
              <span className="toggle-track" />
              Stockfish
            </label>
            {engineOn && (
              <span className="engine-line">
                {liveHere ? (
                  <>
                    <strong>{bar?.mated ? "Checkmate" : bar ? formatScore(bar.cp, bar.mate) : ""}</strong> <span className="muted small">depth {liveHere.depth}</span> <span className="pv">{pvToSan(fen, liveHere.pv)}</span>
                  </>
                ) : (
                  <span className="muted small">thinking…</span>
                )}
              </span>
            )}
          </div>

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
            {!fromStockfish && !progress && (
              <>
                <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Engine depth">
                  <option value={10}>Depth 10 (fast)</option>
                  <option value={12}>Depth 12</option>
                  <option value={16}>Depth 16 (slow)</option>
                </select>
                <button className="btn btn-primary" onClick={() => runEngine()} disabled={!engine}>
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

      {progress && <ProgressBar done={progress.done} total={progress.total} label="Stockfish review" />}

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
