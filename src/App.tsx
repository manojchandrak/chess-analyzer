import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { GameViewer } from "./components/GameViewer";
import { Legends } from "./components/Legends";
import { MyGames } from "./components/MyGames";
import { PgnInput } from "./components/PgnInput";
import { RecentGames } from "./components/RecentGames";
import { getEngine } from "./lib/engine";
import type { GameRecord } from "./lib/games";
import { loadLegendGames, loadLegendIndex, withMoves } from "./lib/legendData";
import { parsePgn, parseRecord, type ParsedGame } from "./lib/pgn";
import type { Traits } from "./lib/profile";
import { buildHash, isShareable, parseHash, type Route, type Tab } from "./lib/route";
import { fetchLichessGame } from "./lib/sources";

interface Viewing {
  game: ParsedGame;
  record: GameRecord | null;
  heading?: string;
  autoAnalyzeDepth?: number;
  initialPly?: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "mine", label: "My games" },
  { id: "legends", label: "Legends" },
  { id: "pgn", label: "Analyze a game" },
];

/** Loads the game a shared link points at: a Lichess game by id, or one of a legend's games. */
async function loadSharedGame(id: string, signal: AbortSignal): Promise<GameRecord> {
  if (id.startsWith("lichess:")) return fetchLichessGame(id.slice("lichess:".length), signal);
  const index = await loadLegendIndex();
  const legend = index.find((l) => id.startsWith(`${l.id}-`));
  const record = legend ? (await loadLegendGames(legend)).find((g) => g.id === id) : undefined;
  if (!record) throw new Error("That game from the link wasn't found.");
  return withMoves(record);
}

function App() {
  const [initial] = useState(() => parseHash(window.location.hash));
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [legendId, setLegendId] = useState<string | null>(initial.legend ?? null);
  const [userTraits, setUserTraits] = useState<Traits | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [depth, setDepth] = useState(14);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [shared, setShared] = useState<{ loading: boolean; error: string | null }>({ loading: !!initial.game, error: null });
  const [viewPly, setViewPly] = useState(0);
  // Usernames from the link, and the ones the user last loaded (kept in the link so it can be shared).
  const [names, setNames] = useState<{ lichess?: string; chesscom?: string }>({ lichess: initial.lichess, chesscom: initial.chesscom });
  const [engine] = useState(getEngine);
  const scrollBack = useRef(0);
  const lastHash = useRef("");

  const openRecord = useCallback((record: GameRecord, heading?: string, ply?: number) => {
    try {
      scrollBack.current = window.scrollY;
      // Your own games get a full Stockfish review as soon as they open.
      const own = record.source === "lichess" || record.source === "chesscom";
      setViewPly(ply ?? 0);
      setViewing({ game: parseRecord(record), record, heading, autoAnalyzeDepth: own ? 12 : undefined, initialPly: ply });
      window.scrollTo(0, 0);
    } catch {
      alert("This game's moves couldn't be read.");
    }
  }, []);

  // Open the game a shared link points at (once, when the page loads).
  useEffect(() => {
    if (!initial.game) return;
    const controller = new AbortController();
    loadSharedGame(initial.game, controller.signal).then(
      (record) => {
        setShared({ loading: false, error: null });
        openRecord(record, undefined, initial.ply);
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setShared({ loading: false, error: e instanceof Error ? e.message : "The game from the link couldn't be loaded." });
      },
    );
    return () => controller.abort();
  }, [initial, openRecord]);

  // Keep the URL describing what's on screen, so it can be copied and shared.
  const shareable = viewing?.record && isShareable(viewing.record.id) ? viewing.record.id : undefined;
  const route: Route = { tab, legend: legendId ?? undefined, lichess: names.lichess, chesscom: names.chesscom, game: shareable, ply: shareable && viewPly > 0 ? viewPly : undefined };
  const hash = buildHash(route);
  useEffect(() => {
    if (shared.loading) return; // don't overwrite the link while its game is still loading
    lastHash.current = hash;
    if (window.location.hash !== hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  }, [hash, shared.loading]);

  // A different link pasted into this tab (or an edited hash) moves to that tab/legend.
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === lastHash.current) return;
      const r = parseHash(window.location.hash);
      setTab(r.tab);
      setLegendId(r.legend ?? null);
      setNames({ lichess: r.lichess, chesscom: r.chesscom });
      setViewing(null);
      if (r.game) {
        setShared({ loading: true, error: null });
        const controller = new AbortController();
        loadSharedGame(r.game, controller.signal).then(
          (record) => {
            setShared({ loading: false, error: null });
            openRecord(record, undefined, r.ply);
          },
          (e: unknown) => setShared({ loading: false, error: e instanceof Error ? e.message : "The game from the link couldn't be loaded." }),
        );
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [openRecord]);

  function closeViewer() {
    setViewing(null);
    setViewPly(0);
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

  const shareUrl = shareable ? `${window.location.origin}${window.location.pathname}${hash}` : null;

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

      {shared.loading && <p className="muted" role="status">Loading the game from the link…</p>}
      {shared.error && <p className="error-message">{shared.error}</p>}

      {viewing && (
        <GameViewer
          key={viewing.record?.id ?? "pgn"}
          game={viewing.game}
          record={viewing.record}
          engine={engine}
          heading={viewing.heading}
          onBack={closeViewer}
          autoAnalyzeDepth={viewing.autoAnalyzeDepth}
          initialPly={viewing.initialPly}
          onPlyChange={setViewPly}
          shareUrl={shareUrl}
        />
      )}

      {/* Tabs stay mounted so loaded games and filters survive opening a game. */}
      <div hidden={!!viewing || tab !== "mine"}>
        <MyGames
          engine={engine}
          initialNames={names}
          onLoaded={(n) => setNames({ lichess: n.lichess || undefined, chesscom: n.chesscom || undefined })}
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
