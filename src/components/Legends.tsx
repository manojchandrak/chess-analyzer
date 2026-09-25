import { useEffect, useMemo, useState } from "react";
import { ecoFamily } from "../lib/eco";
import { scoreFor, type GameRecord } from "../lib/games";
import { loadLegendGames, loadLegendIndex } from "../lib/legendData";
import type { LegendIndexEntry } from "../lib/legends";
import { archetypeOf, similarity, type Traits } from "../lib/profile";
import { GameList } from "./GameList";
import { ProfileView } from "./ProfileView";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenGame: (game: GameRecord, heading?: string) => void;
  /** The user's traits, when they've loaded their games, for comparison. */
  userTraits: Traits | null;
}

type ResultFilter = "all" | "win" | "draw" | "loss";

export function Legends({ selectedId, onSelect, onOpenGame, userTraits }: Props) {
  const [index, setIndex] = useState<LegendIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLegendIndex().then(setIndex, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error-message">{error}</p>;
  if (!index) return <p className="muted">Loading legends…</p>;

  const selected = index.find((l) => l.id === selectedId);
  if (selected) return <LegendDetail key={selected.id} legend={selected} others={index} onBack={() => onSelect(null)} onOpenGame={onOpenGame} userTraits={userTraits} onSelect={onSelect} />;

  return (
    <div className="legend-grid">
      {index.map((l) => {
        const match = userTraits ? similarity(userTraits, l.profile.traits) : null;
        return (
          <button key={l.id} className="card legend-card" onClick={() => onSelect(l.id)}>
            <span className="legend-name">{l.name}</span>
            <span className="muted small">
              {l.years} · {l.title}
            </span>
            <span className="legend-known">{l.knownFor}</span>
            <span className="legend-meta">
              <span className="tag">{archetypeOf(l.profile.traits).label}</span>
              <span className="muted small">{l.games.toLocaleString()} games</span>
              {match !== null && <span className="match">{match}% like you</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LegendDetail({
  legend,
  others,
  onBack,
  onOpenGame,
  userTraits,
  onSelect,
}: {
  legend: LegendIndexEntry;
  others: LegendIndexEntry[];
  onBack: () => void;
  onOpenGame: Props["onOpenGame"];
  userTraits: Traits | null;
  onSelect: (id: string) => void;
}) {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultFilter>("all");
  const [color, setColor] = useState<"all" | "w" | "b">("all");
  const [family, setFamily] = useState("all");
  const [classicalOnly, setClassicalOnly] = useState(false);

  useEffect(() => {
    loadLegendGames(legend).then(setGames, (e: Error) => setError(e.message));
  }, [legend]);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games ?? []) {
      const f = ecoFamily(g.eco);
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [games]);

  const filtered = useMemo(() => {
    if (!games) return [];
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => {
        const c = g.playerColor ?? "w";
        const s = scoreFor(g.result, c);
        if (result !== "all" && s !== { win: 1, draw: 0.5, loss: 0 }[result]) return false;
        if (color !== "all" && c !== color) return false;
        if (family !== "all" && ecoFamily(g.eco) !== family) return false;
        if (classicalOnly && g.timeClass !== "classical") return false;
        if (q && !`${g.white} ${g.black} ${g.event ?? ""} ${g.date ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [games, query, result, color, family, classicalOnly]);

  const similar = others
    .filter((o) => o.id !== legend.id)
    .map((o) => ({ o, s: similarity(legend.profile.traits, o.profile.traits) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const headingFor = (g: GameRecord) => `${g.white} vs ${g.black}${g.event ? `, ${g.event}` : ""}${g.date ? ` ${g.date.slice(0, 4)}` : ""}`;

  return (
    <div className="legend-detail">
      <button className="btn btn-ghost" onClick={onBack}>
        ← All legends
      </button>
      <header className="legend-header">
        <h2>{legend.name}</h2>
        <p className="muted">
          {legend.years} · {legend.title}
        </p>
        <p>{legend.blurb}</p>
        <p className="muted small">
          Known for: <strong>{legend.knownFor}</strong>. The measured style below comes from {legend.profileGames.toLocaleString()}{" "}
          {legend.profileBasis === "classical" ? "classical over-the-board " : ""}games in the collection, so it can differ from the reputation: a long career includes many quiet, drawn games.
        </p>
      </header>

      {legend.famous.length > 0 && games && (
        <div className="famous">
          {legend.famous.map((f) => (
            <button key={f.index} className="btn btn-primary" onClick={() => onOpenGame(games[f.index], `${f.title}: ${headingFor(games[f.index])}`)}>
              ▶ {f.title}
            </button>
          ))}
        </div>
      )}

      <ProfileView profile={legend.profile} subject={legend.name} compare={userTraits ? { name: "You", traits: userTraits } : null} />

      <p className="muted small similar">
        Most similar legends:{" "}
        {similar.map(({ o, s }, i) => (
          <span key={o.id}>
            {i > 0 && ", "}
            <button className="link" onClick={() => onSelect(o.id)}>
              {o.name}
            </button>{" "}
            ({s}%)
          </span>
        ))}
      </p>

      <section>
        <h3>Games</h3>
        {error && <p className="error-message">{error}</p>}
        {!games && !error && <p className="muted">Loading {legend.games.toLocaleString()} games…</p>}
        {games && (
          <>
            <div className="filters">
              <input type="search" placeholder="Opponent, event or year" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search games" />
              <select value={result} onChange={(e) => setResult(e.target.value as ResultFilter)} aria-label="Result">
                <option value="all">All results</option>
                <option value="win">Wins</option>
                <option value="draw">Draws</option>
                <option value="loss">Losses</option>
              </select>
              <select value={color} onChange={(e) => setColor(e.target.value as "all" | "w" | "b")} aria-label="Color">
                <option value="all">Both colors</option>
                <option value="w">As White</option>
                <option value="b">As Black</option>
              </select>
              <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Opening">
                <option value="all">All openings</option>
                {families.map(([f, n]) => (
                  <option key={f} value={f}>
                    {f} ({n})
                  </option>
                ))}
              </select>
              {games.some((g) => g.timeClass === "blitz") && (
                <label className="check">
                  <input type="checkbox" checked={classicalOnly} onChange={(e) => setClassicalOnly(e.target.checked)} /> Classical only
                </label>
              )}
            </div>
            <GameList key={`${query}|${result}|${color}|${family}|${classicalOnly}`} games={filtered} onOpen={(g) => onOpenGame(g, headingFor(g))} />
          </>
        )}
      </section>
    </div>
  );
}
