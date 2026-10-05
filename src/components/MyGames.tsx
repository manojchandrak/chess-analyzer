import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { StockfishEngine } from "../lib/engine";
import type { GameRecord, TimeClass } from "../lib/games";
import { loadLegendIndex } from "../lib/legendData";
import type { LegendIndexEntry } from "../lib/legends";
import { buildProfile, similarity, type Traits } from "../lib/profile";
import { EngineError } from "../lib/engine";
import { reviewGame, summarize, type GameReview } from "../lib/review";
import { useStorageProblem } from "../lib/store";
import { fetchChessComGames, fetchLichessGames } from "../lib/sources";
import { computeFeatures } from "../lib/features";
import type { GameFeatures } from "../lib/style";
import { buildTips } from "../lib/tips";
import { openingAccuracy } from "../lib/openingStats";
import { collectPuzzles } from "../lib/puzzles";
import { buildTrends } from "../lib/trends";
import { GameList } from "./GameList";
import { PuzzleDrill } from "./PuzzleDrill";
import { TrendsView } from "./TrendsView";
import { ProfileView } from "./ProfileView";
import { ProgressBar } from "./ProgressBar";
import { TipsList } from "./TipsList";

interface Props {
  engine: StockfishEngine | null;
  /** Usernames from a shared link; they fill the form (nothing is loaded until the user asks). */
  initialNames?: { lichess?: string; chesscom?: string };
  /** Called with the usernames when the user loads their games (so the page's link can include them). */
  onLoaded?: (names: { lichess: string; chesscom: string }) => void;
  onOpenGame: (game: GameRecord, heading?: string, ply?: number) => void;
  onOpenLegend: (id: string) => void;
  onTraits: (traits: Traits | null) => void;
}

const STORAGE_KEY = "chess-analyzer:usernames";

function savedNames(): { lichess: string; chesscom: string } {
  try {
    return { lichess: "", chesscom: "", ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { lichess: "", chesscom: "" };
  }
}

export function MyGames({ engine, initialNames, onLoaded, onOpenGame, onOpenLegend, onTraits }: Props) {
  const [names, setNames] = useState(() => ({ ...savedNames(), ...(initialNames?.lichess ? { lichess: initialNames.lichess } : {}), ...(initialNames?.chesscom ? { chesscom: initialNames.chesscom } : {}) }));
  const [count, setCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [timeClass, setTimeClass] = useState<TimeClass | "all">("all");
  const [legends, setLegends] = useState<LegendIndexEntry[]>([]);
  const [reviews, setReviews] = useState<Map<string, GameReview>>(new Map());
  const [reviewCount, setReviewCount] = useState(10);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const storageProblem = useStorageProblem();
  const [reviewProgress, setReviewProgress] = useState<{ game: number; of: number; done: number; total: number } | null>(null);
  // Style features per game id, computed once per load (in batches for big loads).
  const [featureMap, setFeatureMap] = useState<Map<string, GameFeatures | null>>(new Map());
  const loadGen = useRef(0);
  const abort = useRef<AbortController | null>(null);

  // A different link pasted into the open page changes the usernames.
  const linkLichess = initialNames?.lichess;
  const linkChesscom = initialNames?.chesscom;
  const linkKey = `${linkLichess ?? ""}|${linkChesscom ?? ""}`;
  const [seenLinkKey, setSeenLinkKey] = useState(linkKey);
  if (linkKey !== seenLinkKey) {
    setSeenLinkKey(linkKey);
    if (linkLichess || linkChesscom) setNames((n) => ({ ...n, ...(linkLichess ? { lichess: linkLichess } : {}), ...(linkChesscom ? { chesscom: linkChesscom } : {}) }));
  }

  useEffect(() => {
    loadLegendIndex().then(setLegends, () => setLegends([]));
  }, []);

  const filtered = useMemo(() => games.filter((g) => timeClass === "all" || g.timeClass === timeClass), [games, timeClass]);
  const features = useMemo(() => filtered.map((g) => featureMap.get(g.id)).filter((f): f is GameFeatures => !!f), [filtered, featureMap]);
  const profile = useMemo(() => (features.length ? buildProfile(features) : null), [features]);
  const closest = useMemo(
    () => (profile ? legends.map((l) => ({ legend: l, score: similarity(profile.traits, l.profile.traits) })).sort((a, b) => b.score - a.score) : []),
    [profile, legends],
  );
  const filteredReviews = useMemo(() => filtered.map((g) => reviews.get(g.id)).filter((r): r is GameReview => !!r), [filtered, reviews]);
  const summary = useMemo(() => (filteredReviews.length ? summarize(filteredReviews) : null), [filteredReviews]);
  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const trends = useMemo(() => buildTrends(filtered, reviews), [filtered, reviews]);
  const puzzles = useMemo(() => collectPuzzles(filteredReviews, gameMap), [filteredReviews, gameMap]);
  const openingAcc = useMemo(() => openingAccuracy(filteredReviews), [filteredReviews]);
  const tips = useMemo(() => (profile ? buildTips(profile, filtered, summary) : []), [profile, filtered, summary]);
  const timeClasses = useMemo(() => [...new Set(games.map((g) => g.timeClass).filter(Boolean))] as TimeClass[], [games]);

  useEffect(() => onTraits(profile?.traits ?? null), [profile, onTraits]);

  async function load(e: FormEvent) {
    e.preventDefault();
    const lichess = names.lichess.trim();
    const chesscom = names.chesscom.trim();
    if (!lichess && !chesscom) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lichess, chesscom }));
    } catch {
      // not remembered; fine
    }
    onLoaded?.({ lichess, chesscom });
    const gen = ++loadGen.current;
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setErrors([]);
    setMessages([]);
    setReviews(new Map());
    setFeatureMap(new Map());
    const log = (m: string) => setMessages((ms) => [...ms.filter((x) => !x.startsWith(m.split(":")[0])), m]);
    const max = count || Infinity;
    const results = await Promise.allSettled([
      lichess ? fetchLichessGames(lichess, max, log, controller.signal) : Promise.resolve([]),
      chesscom ? fetchChessComGames(chesscom, max, log, controller.signal) : Promise.resolve([]),
    ]);
    if (gen !== loadGen.current) return;
    const loaded: GameRecord[] = [];
    const errs: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") loaded.push(...r.value);
      else if (!controller.signal.aborted) errs.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
    loaded.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    setGames(loaded);
    setErrors(errs);
    setTimeClass("all");
    setLoading(false);
    abort.current = null;

    // Read every game's moves for the style profile (in a worker, so thousands of
    // games don't freeze the page).
    const yieldToPage = () => new Promise((r) => setTimeout(r, 0));
    const fm = await computeFeatures(
      loaded,
      (done, total) => {
        if (total > 300) log(`Style: read ${done.toLocaleString()} of ${total.toLocaleString()} games…`);
      },
      () => gen !== loadGen.current,
    );
    if (!fm || gen !== loadGen.current) return;
    setFeatureMap(fm);
    if (loaded.length > 300) log(`Style: profile built from ${loaded.length.toLocaleString()} games.`);

    // Lichess games the site already analyzed are reviewed instantly, no engine needed.
    const analyzed = loaded.filter((x) => x.evals);
    const instant = new Map<string, GameReview>();
    for (const [i, g] of analyzed.entries()) {
      const r = await reviewGame(g, engine, 0);
      if (r) instant.set(g.id, r);
      if (i % 25 === 24) {
        if (analyzed.length > 50) log(`Review: ${(i + 1).toLocaleString()} of ${analyzed.length.toLocaleString()} Lichess-analyzed games…`);
        await yieldToPage();
        if (gen !== loadGen.current) return;
      }
    }
    setReviews(instant);
    if (analyzed.length > 50) log(`Review: ${analyzed.length.toLocaleString()} Lichess-analyzed games included.`);
  }

  /** Reviews these games one after another with Stockfish; each result appears in the table as it finishes. */
  async function reviewGames(todo: GameRecord[]) {
    if (!engine || todo.length === 0) return;
    setReviewError(null);
    try {
      for (let i = 0; i < todo.length; i++) {
        setReviewProgress({ game: i + 1, of: todo.length, done: 0, total: 1 });
        const r = await reviewGame(todo[i], engine, 10, (done, total) => setReviewProgress({ game: i + 1, of: todo.length, done, total }));
        if (r) setReviews((prev) => new Map(prev).set(r.gameId, r));
      }
    } catch (e) {
      setReviewError(e instanceof EngineError ? e.message : "The review stopped because of an unexpected error.");
    } finally {
      setReviewProgress(null);
    }
  }

  const runReview = () => reviewGames(filtered.filter((g) => g.playerColor && !reviews.has(g.id)).slice(0, reviewCount));
  const unreviewed = filtered.filter((g) => g.playerColor && !reviews.has(g.id)).length;

  return (
    <div className="my-games">
      <form className="card load-form" onSubmit={load}>
        <div className="field">
          <label htmlFor="lichess">Lichess username</label>
          <input id="lichess" value={names.lichess} onChange={(e) => setNames({ ...names, lichess: e.target.value })} placeholder="e.g. DrNykterstein" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="chesscom">Chess.com username</label>
          <input id="chesscom" value={names.chesscom} onChange={(e) => setNames({ ...names, chesscom: e.target.value })} placeholder="e.g. MagnusCarlsen" autoComplete="off" />
        </div>
        <div className="field field-small">
          <label htmlFor="count">Games per site</label>
          <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={0}>All games</option>
          </select>
        </div>
        <button className="btn btn-primary" disabled={loading || (!names.lichess.trim() && !names.chesscom.trim())}>
          {loading ? "Loading…" : "Load my games"}
        </button>
        {loading && (
          <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>
            Stop and use what's loaded
          </button>
        )}
        {count === 0 && !loading && <p className="muted small load-hint">Loading every game can take a while for big accounts: Lichess sends roughly 10–20 games a second (Chess.com is much faster). You can stop at any point and keep what has loaded.</p>}
      </form>

      {(loading || messages.length > 0) && (
        <ul className="messages">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {errors.map((e) => (
        <p className="error-message" key={e}>
          {e}
        </p>
      ))}

      {!profile && !loading && games.length === 0 && (
        <p className="muted intro">
          Enter your Lichess and/or Chess.com username. Your public games are loaded straight from each site into this page. Nothing is sent anywhere else.
        </p>
      )}

      {profile && (
        <>
          {timeClasses.length > 1 && (
            <div className="chips" role="group" aria-label="Time control">
              {(["all", ...timeClasses] as const).map((tc) => (
                <button key={tc} className={`chip${timeClass === tc ? " chip-on" : ""}`} onClick={() => setTimeClass(tc)}>
                  {tc === "all" ? `All (${games.length})` : `${tc} (${games.filter((g) => g.timeClass === tc).length})`}
                </button>
              ))}
            </div>
          )}

          <section>
            <h2>Where you can improve</h2>
            <TipsList tips={tips} />
            <div className="card review-box">
              <div>
                <h3>Engine review</h3>
                <p className="muted small">
                  {summary
                    ? `${summary.games} games reviewed: ${summary.accuracy}% accuracy, ${summary.blundersPerGame.toFixed(1)} blunders per game. Opening ${summary.phases.opening.accuracy ?? "—"}% · middlegame ${summary.phases.middlegame.accuracy ?? "—"}% · endgame ${summary.phases.endgame.accuracy ?? "—"}%.`
                    : "Run Stockfish over your recent games to find which phase you lose points in, whether you blunder under time pressure, and whether you convert winning positions."}
                  {filteredReviews.some((r) => r.engine === "lichess") ? " Games Lichess already analyzed are included automatically." : ""}
                </p>
              </div>
              {unreviewed > 0 && !reviewProgress && (
                <div className="review-actions">
                  <select value={reviewCount} onChange={(e) => setReviewCount(Number(e.target.value))} aria-label="Games to review">
                    <option value={5}>next 5 games</option>
                    <option value={10}>next 10 games</option>
                    <option value={25}>next 25 games</option>
                  </select>
                  <button className="btn btn-primary" onClick={runReview} disabled={!engine}>
                    Review with Stockfish
                  </button>
                </div>
              )}
            </div>
            {reviewError && <p className="error-message">{reviewError} Games reviewed so far are kept.</p>}
            {storageProblem && <p className="error-message">{storageProblem}</p>}
            {reviewProgress && (
              <ProgressBar done={reviewProgress.done} total={reviewProgress.total} label={`Game ${reviewProgress.game} of ${reviewProgress.of}`} />
            )}
          </section>

          {summary && (
            <section>
              <h2>Progress over time</h2>
              <TrendsView points={trends} />
            </section>
          )}

          {summary && (
            <section>
              <h2>Practice</h2>
              {puzzles.length > 0 ? (
                <PuzzleDrill puzzles={puzzles} />
              ) : (
                <p className="muted small">Practice puzzles are built from the mistakes and blunders in games you review with Stockfish.</p>
              )}
            </section>
          )}

          <section>
            <h2>Your playing style</h2>
            {closest.length > 0 && (
              <div className="closest">
                <p className="muted">Closest legends by style:</p>
                <div className="closest-list">
                  {closest.slice(0, 3).map(({ legend, score }) => (
                    <button key={legend.id} className="closest-card" onClick={() => onOpenLegend(legend.id)}>
                      <strong>{legend.name}</strong>
                      <span className="muted small">{legend.knownFor}</span>
                      <span className="match">{score}% match</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ProfileView profile={profile} subject="You" openingAccuracy={openingAcc} compare={closest[0] ? { name: closest[0].legend.name, traits: closest[0].legend.profile.traits } : null} />
          </section>

          <section>
            <h2>Games</h2>
            <GameList games={filtered} onOpen={onOpenGame} onReview={engine ? reviewGames : undefined} reviewing={!!reviewProgress} />
          </section>
        </>
      )}
    </div>
  );
}
