import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { StockfishEngine } from "../lib/engine";
import type { GameRecord, TimeClass } from "../lib/games";
import { loadLegendIndex } from "../lib/legendData";
import type { LegendIndexEntry } from "../lib/legends";
import { buildProfile, similarity, type Traits } from "../lib/profile";
import { reviewGame, summarize, type GameReview } from "../lib/review";
import { fetchChessComGames, fetchLichessGames } from "../lib/sources";
import { extractFeatures, type GameFeatures } from "../lib/style";
import { buildTips } from "../lib/tips";
import { GameList } from "./GameList";
import { ProfileView } from "./ProfileView";
import { ProgressBar } from "./ProgressBar";
import { TipsList } from "./TipsList";

interface Props {
  engine: StockfishEngine | null;
  onOpenGame: (game: GameRecord) => void;
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

export function MyGames({ engine, onOpenGame, onOpenLegend, onTraits }: Props) {
  const [names, setNames] = useState(savedNames);
  const [count, setCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [timeClass, setTimeClass] = useState<TimeClass | "all">("all");
  const [legends, setLegends] = useState<LegendIndexEntry[]>([]);
  const [reviews, setReviews] = useState<Map<string, GameReview>>(new Map());
  const [reviewCount, setReviewCount] = useState(10);
  const [reviewProgress, setReviewProgress] = useState<{ game: number; of: number; done: number; total: number } | null>(null);

  useEffect(() => {
    loadLegendIndex().then(setLegends, () => setLegends([]));
  }, []);

  const filtered = useMemo(() => games.filter((g) => timeClass === "all" || g.timeClass === timeClass), [games, timeClass]);
  const features = useMemo(
    () => filtered.map((g) => (g.playerColor ? extractFeatures(g, g.playerColor) : null)).filter((f): f is GameFeatures => f !== null),
    [filtered],
  );
  const profile = useMemo(() => (features.length ? buildProfile(features) : null), [features]);
  const closest = useMemo(
    () => (profile ? legends.map((l) => ({ legend: l, score: similarity(profile.traits, l.profile.traits) })).sort((a, b) => b.score - a.score) : []),
    [profile, legends],
  );
  const filteredReviews = useMemo(() => filtered.map((g) => reviews.get(g.id)).filter((r): r is GameReview => !!r), [filtered, reviews]);
  const summary = useMemo(() => (filteredReviews.length ? summarize(filteredReviews) : null), [filteredReviews]);
  const tips = useMemo(() => (profile ? buildTips(profile, filtered, summary) : []), [profile, filtered, summary]);
  const accuracy = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reviews.values()) {
      if (r.moves.length) map.set(r.gameId, Math.round(r.moves.reduce((a, m) => a + m.accuracy, 0) / r.moves.length));
    }
    return map;
  }, [reviews]);
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
    setLoading(true);
    setErrors([]);
    setMessages([]);
    setReviews(new Map());
    const log = (m: string) => setMessages((ms) => [...ms.filter((x) => !x.startsWith(m.split(":")[0])), m]);
    const results = await Promise.allSettled([lichess ? fetchLichessGames(lichess, count, log) : Promise.resolve([]), chesscom ? fetchChessComGames(chesscom, count, log) : Promise.resolve([])]);
    const loaded: GameRecord[] = [];
    const errs: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") loaded.push(...r.value);
      else errs.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
    loaded.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    setGames(loaded);
    setErrors(errs);
    setTimeClass("all");
    setLoading(false);

    // Lichess games the site already analyzed are reviewed instantly, no engine needed.
    const instant = new Map<string, GameReview>();
    for (const g of loaded.filter((x) => x.evals)) {
      const r = await reviewGame(g, engine, 0);
      if (r) instant.set(g.id, r);
    }
    setReviews(instant);
  }

  async function runReview() {
    if (!engine) return;
    const todo = filtered.filter((g) => g.playerColor && !reviews.has(g.id)).slice(0, reviewCount);
    for (let i = 0; i < todo.length; i++) {
      setReviewProgress({ game: i + 1, of: todo.length, done: 0, total: 1 });
      const r = await reviewGame(todo[i], engine, 10, (done, total) => setReviewProgress({ game: i + 1, of: todo.length, done, total }));
      if (r) setReviews((prev) => new Map(prev).set(r.gameId, r));
    }
    setReviewProgress(null);
  }

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
          </select>
        </div>
        <button className="btn btn-primary" disabled={loading || (!names.lichess.trim() && !names.chesscom.trim())}>
          {loading ? "Loading…" : "Load my games"}
        </button>
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
            {reviewProgress && (
              <ProgressBar done={reviewProgress.done} total={reviewProgress.total} label={`Game ${reviewProgress.game} of ${reviewProgress.of}`} />
            )}
          </section>

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
            <ProfileView profile={profile} subject="You" compare={closest[0] ? { name: closest[0].legend.name, traits: closest[0].legend.profile.traits } : null} />
          </section>

          <section>
            <h2>Games</h2>
            <GameList games={filtered} onOpen={onOpenGame} accuracy={accuracy} />
          </section>
        </>
      )}
    </div>
  );
}
