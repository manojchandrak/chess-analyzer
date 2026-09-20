import { useEffect, useRef, useState } from "react";
import "./App.css";
import { EvalChart } from "./components/EvalChart";
import { PgnInput } from "./components/PgnInput";
import { PhaseTable } from "./components/PhaseTable";
import { PlayerSummary } from "./components/PlayerSummary";
import { ProgressBar } from "./components/ProgressBar";
import { analyzeGame, type AnalysisResult } from "./lib/analyze";
import { StockfishEngine } from "./lib/engine";
import { parsePgn } from "./lib/pgn";

type Status = "idle" | "analyzing" | "done" | "error";

function App() {
  const [pgnText, setPgnText] = useState("");
  const [depth, setDepth] = useState(14);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(() => {
    const engine = new StockfishEngine(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    engineRef.current = engine;
    return () => engine.terminate();
  }, []);

  async function handleAnalyze() {
    setStatus("analyzing");
    setError(null);
    setResult(null);
    try {
      let game;
      try {
        game = parsePgn(pgnText);
      } catch (e) {
        throw new Error(`Couldn't parse this PGN: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (game.moves.length === 0) {
        throw new Error("No moves found — check that this is a valid PGN.");
      }
      if (!engineRef.current) throw new Error("Engine is not ready yet, try again in a moment.");

      setProgress({ done: 0, total: game.moves.length + 1 });
      const analysis = await analyzeGame(game, engineRef.current, depth, (done, total) =>
        setProgress({ done, total }),
      );
      setResult(analysis);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Game Analyzer</h1>
        <p>
          Upload a PGN to get Stockfish-powered accuracy by opening/middlegame/endgame, and an
          estimated performance rating for both players.
        </p>
      </header>

      <PgnInput
        pgnText={pgnText}
        onChange={setPgnText}
        depth={depth}
        onDepthChange={setDepth}
        onAnalyze={handleAnalyze}
        disabled={status === "analyzing"}
      />

      {status === "analyzing" && <ProgressBar done={progress.done} total={progress.total} />}
      {status === "error" && error && <p className="error-message">{error}</p>}

      {result && status === "done" && (
        <section className="results">
          <div className="player-summaries">
            <PlayerSummary color="White" stats={result.white} />
            <PlayerSummary color="Black" stats={result.black} />
          </div>

          <h2>Accuracy by Phase</h2>
          <PhaseTable white={result.white} black={result.black} />

          <h2>Evaluation Over Time</h2>
          <EvalChart moves={result.moves} openingEndPly={result.openingEndPly} endgameStartPly={result.endgameStartPly} />

          <p className="disclaimer">
            Accuracy and phase boundaries are computed heuristically from engine evaluations
            (Stockfish, depth {depth}); estimated ratings are a rough approximation from average
            centipawn loss, not an official rating. Treat both as directional, not exact.
          </p>
        </section>
      )}
    </div>
  );
}

export default App;
