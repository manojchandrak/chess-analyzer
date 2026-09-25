import { useCallback, useRef, useState } from "react";
import "./App.css";
import { GameViewer } from "./components/GameViewer";
import { Legends } from "./components/Legends";
import { MyGames } from "./components/MyGames";
import { PgnInput } from "./components/PgnInput";
import { RecentGames } from "./components/RecentGames";
import { getEngine } from "./lib/engine";
import type { GameRecord } from "./lib/games";
import { parsePgn, parseRecord, type ParsedGame } from "./lib/pgn";
import type { Traits } from "./lib/profile";

type Tab = "mine" | "legends" | "pgn";

interface Viewing {
  game: ParsedGame;
  record: GameRecord | null;
  heading?: string;
  autoAnalyzeDepth?: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "mine", label: "My games" },
  { id: "legends", label: "Legends" },
  { id: "pgn", label: "Analyze a game" },
];

function App() {
  const [tab, setTab] = useState<Tab>("mine");
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [legendId, setLegendId] = useState<string | null>(null);
  const [userTraits, setUserTraits] = useState<Traits | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [depth, setDepth] = useState(14);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [engine] = useState(getEngine);
  const scrollBack = useRef(0);

  const openRecord = useCallback((record: GameRecord, heading?: string) => {
    try {
      scrollBack.current = window.scrollY;
      // Your own games get a full Stockfish review as soon as they open.
      const own = record.source === "lichess" || record.source === "chesscom";
      setViewing({ game: parseRecord(record), record, heading, autoAnalyzeDepth: own ? 12 : undefined });
      window.scrollTo(0, 0);
    } catch {
      alert("This game's moves couldn't be read.");
    }
  }, []);

  function closeViewer() {
    setViewing(null);
    requestAnimationFrame(() => window.scrollTo(0, scrollBack.current));
  }

  function analyzePgn() {
    setPgnError(null);
    try {
      const game = parsePgn(pgnText);
      if (game.moves.length === 0) throw new Error("No moves found — check that this is a valid PGN.");
      scrollBack.current = window.scrollY;
      setViewing({ game, record: null, autoAnalyzeDepth: depth });
    } catch (e) {
      setPgnError(`Couldn't parse this PGN: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Game Analyzer</h1>
        <p>Load your Lichess and Chess.com games to see your playing style and where to improve, or study how the legends played.</p>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id && !viewing}
              className={`tab${tab === t.id ? " tab-on" : ""}`}
              onClick={() => {
                setViewing(null);
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {viewing && (
        <GameViewer key={viewing.record?.id ?? "pgn"} game={viewing.game} record={viewing.record} engine={engine} heading={viewing.heading} onBack={closeViewer} autoAnalyzeDepth={viewing.autoAnalyzeDepth} />
      )}

      {/* Tabs stay mounted so loaded games and filters survive opening a game. */}
      <div hidden={!!viewing || tab !== "mine"}>
        <MyGames
          engine={engine}
          onOpenGame={openRecord}
          onOpenLegend={(id) => {
            setLegendId(id);
            setTab("legends");
            window.scrollTo(0, 0);
          }}
          onTraits={setUserTraits}
        />
      </div>
      <div hidden={!!viewing || tab !== "legends"}>
        <Legends selectedId={legendId} onSelect={setLegendId} onOpenGame={openRecord} userTraits={userTraits} />
      </div>
      <div hidden={!!viewing || tab !== "pgn"}>
        <RecentGames onAnalyze={(g) => openRecord(g)} />
        <h3 className="or-heading">Or paste a PGN</h3>
        <PgnInput pgnText={pgnText} onChange={setPgnText} depth={depth} onDepthChange={setDepth} onAnalyze={analyzePgn} disabled={!engine} />
        {pgnError && <p className="error-message">{pgnError}</p>}
      </div>

      <footer className="app-footer muted small">
        Engine: Stockfish 19 (WASM), running in your browser. Games load directly from the Lichess and Chess.com public APIs. Legends' games from PGN Mentor.
      </footer>
    </div>
  );
}

export default App;
