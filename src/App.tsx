import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Drills } from "./components/Drills";
import { GameViewer } from "./components/GameViewer";
import { Legends } from "./components/Legends";
import { LoginPage } from "./components/LoginPage";
import { AccountMenu } from "./components/AccountMenu";
import { FenInput } from "./components/FenInput";
import { ImageInput } from "./components/ImageInput";
import { Forum } from "./components/Forum";
import { MyGames } from "./components/MyGames";
import { PgnInput } from "./components/PgnInput";
import { RecentGames } from "./components/RecentGames";
import { getEngine } from "./lib/engine";
import { useAuth } from "./lib/forum/auth-context";
import type { GameRecord } from "./lib/games";
import { loadLegendGames, loadLegendIndex, withMoves } from "./lib/legendData";
import { parsePgn, parseRecord, type ParsedGame } from "./lib/pgn";
import type { Traits } from "./lib/profile";
import { buildHash, isShareable, parseHash, type Route, type Tab } from "./lib/route";
import { AnalyticsConsent } from "./components/AnalyticsConsent";
import { NewGame } from "./components/NewGame";
import { InstallApp, OfflineNote } from "./components/InstallApp";
import { HistoryView } from "./components/HistoryView";
import { ProgressView } from "./components/ProgressView";
import { recordOpened } from "./lib/history";
import { decodeSharedGame, encodeSharedGame } from "./lib/shareLink";
import { START_FEN } from "./lib/explore";
import { AboutPage, PrivacyPage } from "./components/InfoPages";
import { fetchLichessGame } from "./lib/sources";

interface Viewing {
  game: ParsedGame;
  record: GameRecord | null;
  heading?: string;
  autoAnalyzeDepth?: number;
  initialPly?: number;
  /** Open straight into "play from this position" (no game to step through). */
  exploreFen?: string;
  exploreMode?: "both" | "w" | "b";
}

const ALL_TABS: { id: Tab; label: string }[] = [
  { id: "mine", label: "My games" },
  { id: "legends", label: "Legends" },
  { id: "pgn", label: "Analyze a game" },
  { id: "drills", label: "Drills" },
  { id: "history", label: "History" },
  { id: "progress", label: "Progress" },
  { id: "forum", label: "Community" },
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

const CARRIED_LINK_ERROR = "That link's game couldn't be read. It may have been cut off when it was copied.";

function App() {
  const [initial] = useState(() => parseHash(window.location.hash));
  const [tab, setTab] = useState<Tab>(initial.tab);
  // A link that carries its game inside it opens straight away (no lookup needed).
  const [carriedGame] = useState(() => (initial.data ? decodeSharedGame(initial.data) : null));
  const [viewing, setViewing] = useState<Viewing | null>(() => (carriedGame ? { game: carriedGame, record: null, autoAnalyzeDepth: 12, initialPly: initial.ply } : null));
  const [legendId, setLegendId] = useState<string | null>(initial.legend ?? null);
  const [thread, setThread] = useState<string | null>(initial.thread ?? null);
  const { status: forumStatus, recovering } = useAuth();
  // The Community tab and Log in button appear once the forum is set up (or while developing, to show the setup steps).
  const forumAvailable = forumStatus === "ready" || (import.meta.env.DEV && forumStatus === "off");
  const TABS = ALL_TABS.filter((t) => t.id !== "forum" || forumAvailable);
  // Following a password-reset link shows the "choose a new password" form, whatever tab was open.
  const current: Tab = recovering ? "login" : tab;
  const returnTab = useRef<Tab>("forum");
  const openLogin = () => {
    returnTab.current = tab === "login" ? "forum" : tab;
    setViewing(null);
    setTab("login");
  };
  const openInfo = (page: "about" | "privacy") => {
    setViewing(null);
    setTab(page);
    window.scrollTo(0, 0);
  };
  const [userTraits, setUserTraits] = useState<Traits | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [depth, setDepth] = useState(14);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [shared, setShared] = useState<{ loading: boolean; error: string | null }>({ loading: !!initial.game, error: initial.data && !carriedGame ? CARRIED_LINK_ERROR : null });
  const [viewPly, setViewPly] = useState(carriedGame ? (initial.ply ?? 0) : 0);
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
      recordOpened(record);
      window.scrollTo(0, 0);
    } catch {
      alert("This game's moves couldn't be read.");
    }
  }, [setViewPly]);

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
  // Games with no id to look up (Chess.com games, pasted PGNs) are shared by carrying their moves in the link.
  const viewingGame = viewing?.game;
  const viewingExplore = viewing?.exploreFen;
  const carried = useMemo(() => (viewingGame && !shareable && !viewingExplore ? encodeSharedGame(viewingGame) : null), [viewingGame, shareable, viewingExplore]);
  const linkedGame = shareable ?? carried;
  const route: Route = { tab, legend: legendId ?? undefined, thread: tab === "forum" ? (thread ?? undefined) : undefined, lichess: names.lichess, chesscom: names.chesscom, game: shareable, data: carried ?? undefined, ply: linkedGame && viewPly > 0 ? viewPly : undefined };
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
      setThread(r.thread ?? null);
      setNames({ lichess: r.lichess, chesscom: r.chesscom });
      setViewing(null);
      if (r.data) {
        const game = decodeSharedGame(r.data);
        if (game) {
          setViewPly(r.ply ?? 0);
          setViewing({ game, record: null, autoAnalyzeDepth: 12, initialPly: r.ply });
        } else setShared({ loading: false, error: CARRIED_LINK_ERROR });
      }
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

  function startFromFen(fen: string, mode?: "both" | "w" | "b") {
    scrollBack.current = window.scrollY;
    setViewing({ game: { white: "Position", black: "", whiteElo: null, blackElo: null, result: "*", moves: [] }, record: null, exploreFen: fen, exploreMode: mode });
  }

  function analyzePgn() {
    analyzeText(pgnText);
  }

  function analyzeText(text: string) {
    setPgnError(null);
    try {
      const game = parsePgn(text);
      if (game.moves.length === 0) throw new Error("No moves found — check that this is a valid PGN.");
      scrollBack.current = window.scrollY;
      setViewing({ game, record: null, autoAnalyzeDepth: depth });
    } catch (e) {
      setPgnError(`Couldn't parse this PGN: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const shareUrl = linkedGame ? `${window.location.origin}${window.location.pathname}${hash}` : null;

  return (
    <div className="app">
      <OfflineNote />
      <header className="app-header">
        <AccountMenu onLogin={openLogin} />
        <h1>MyChessAnalyzer</h1>
        <p>Load your Lichess and Chess.com games to see your playing style and where to improve, study how the legends played, or train openings, middlegames and endgames with drills.</p>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={current === t.id && !viewing}
              className={`tab${current === t.id ? " tab-on" : ""}`}
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
          exploreFen={viewing.exploreFen}
          exploreMode={viewing.exploreMode}
          onPlyChange={setViewPly}
          shareUrl={shareUrl}
        />
      )}

      {/* Tabs stay mounted so loaded games and filters survive opening a game. */}
      <div hidden={!!viewing || current !== "mine"}>
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
      <div hidden={!!viewing || current !== "legends"}>
        <Legends selectedId={legendId} onSelect={setLegendId} onOpenGame={openRecord} userTraits={userTraits} />
      </div>
      <div hidden={!!viewing || current !== "pgn"}>
        <NewGame onStart={(mode) => startFromFen(START_FEN, mode)} />
        <RecentGames engine={engine} onAnalyze={(g) => openRecord(g)} />
        <h3 className="or-heading">Or start from a position</h3>
        <FenInput onStart={startFromFen} />
        <h3 className="or-heading">Or paste a PGN</h3>
        <PgnInput pgnText={pgnText} onChange={setPgnText} depth={depth} onDepthChange={setDepth} onAnalyze={analyzePgn} disabled={!engine} />
        {pgnError && <p className="error-message">{pgnError}</p>}
        <h3 className="or-heading">Or upload a picture</h3>
        <ImageInput onAnalyzePgn={analyzeText} onAnalyzeFen={startFromFen} disabled={!engine} />
      </div>

      <div hidden={!!viewing || current !== "drills"}>
        <Drills />
      </div>

      {/* The forum and login mount only while they are open, so visitors who never use them cost the forum nothing. */}
      {!viewing && current === "history" && <HistoryView onOpen={(g) => openRecord(g)} />}
      {!viewing && current === "progress" && <ProgressView onOpen={(g) => openRecord(g)} />}
      {!viewing && current === "forum" && <Forum threadId={thread} onOpenThread={setThread} onLogin={openLogin} />}
      {!viewing && current === "login" && <LoginPage onDone={() => setTab(returnTab.current)} />}
      {!viewing && current === "about" && <AboutPage onClose={() => setTab("mine")} />}
      {!viewing && current === "privacy" && <PrivacyPage onClose={() => setTab("mine")} />}

      <footer className="app-footer muted small">
        Engine: Stockfish 19 (WASM), running in your browser. Games load directly from the Lichess and Chess.com public APIs. Legends' games from PGN Mentor.
        <nav className="footer-links" aria-label="About this site">
          <button className="link-button" onClick={() => openInfo("about")}>
            About
          </button>
          <button className="link-button" onClick={() => openInfo("privacy")}>
            Privacy
          </button>
          <a className="link-button" href={`${import.meta.env.BASE_URL}legends/`}>
            Legend profiles
          </a>
          <a className="link-button" href={`${import.meta.env.BASE_URL}openings/`}>
            Opening guides
          </a>
          <InstallApp />
        </nav>
      </footer>
      <AnalyticsConsent onOpenPrivacy={() => openInfo("privacy")} />
    </div>
  );
}

export default App;
