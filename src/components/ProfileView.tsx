import { archetypeOf, TRAIT_LABELS, type NamedTally, type Profile, type TraitKey, type Traits } from "../lib/profile";

interface Props {
  profile: Profile;
  /** Overlays another player's traits (e.g. the closest legend) on the bars. */
  compare?: { name: string; traits: Traits } | null;
  /** "You" for the user, the legend's name otherwise. */
  subject: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function TallyTable({ title, rows, limit = 6 }: { title: string; rows: NamedTally[]; limit?: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="tally">
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Opening</th>
            <th className="num">Games</th>
            <th className="num">W / D / L</th>
            <th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.games}</td>
              <td className="num">
                {r.wins} / {r.draws} / {r.losses}
              </td>
              <td className="num">
                <span className="score-bar" style={{ ["--score" as string]: `${r.score}%` }}>
                  {r.score}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProfileView({ profile, compare, subject }: Props) {
  const { results, byColor, metrics: m, traits, repertoire } = profile;
  const archetype = archetypeOf(traits);
  return (
    <div className="profile">
      <div className="profile-top">
        <div className="card archetype">
          <p className="eyebrow">Measured style</p>
          <h3>{archetype.label}</h3>
          <p>{archetype.description}</p>
        </div>
        <div className="card results-card">
          <p className="eyebrow">Results</p>
          <p className="big">{results.score}%</p>
          <p className="muted">
            {results.games} games · {results.wins}W {results.draws}D {results.losses}L
          </p>
          <p className="muted small">
            White {byColor.w.score}% ({byColor.w.games}) · Black {byColor.b.score}% ({byColor.b.games})
          </p>
        </div>
      </div>

      <div className="card">
        <div className="traits-head">
          <h3>Style traits</h3>
          {compare && (
            <p className="legend-key">
              <span className="key key-you" /> {subject} <span className="key key-compare" /> {compare.name}
            </p>
          )}
        </div>
        <p className="muted small">0 = least of the 12 legends, 100 = most. Blitz and bullet games naturally run higher on aggression and lower on endgames.</p>
        {(Object.keys(TRAIT_LABELS) as TraitKey[]).map((k) => (
          <div className="trait" key={k} title={TRAIT_LABELS[k].hint}>
            <span className="trait-label">{TRAIT_LABELS[k].label}</span>
            <span className="trait-track">
              <span className="trait-fill" style={{ width: `${traits[k]}%` }} />
              {compare && <span className="trait-marker" style={{ left: `${compare.traits[k]}%` }} title={`${compare.name}: ${compare.traits[k]}`} />}
            </span>
            <span className="trait-value">{traits[k]}</span>
          </div>
        ))}
      </div>

      <div className="card stats-grid">
        <div>
          <span className="stat">{m.avgLength.toFixed(0)}</span>
          <span className="stat-label">moves per game</span>
        </div>
        <div>
          <span className="stat">{pct(m.castledRate)}</span>
          <span className="stat-label">games castled{m.avgCastleMove ? `, avg move ${m.avgCastleMove.toFixed(0)}` : ""}</span>
        </div>
        <div>
          <span className="stat">{pct(m.queenTradeRate)}</span>
          <span className="stat-label">queens traded by move 25</span>
        </div>
        <div>
          <span className="stat">{pct(m.endgameRate)}</span>
          <span className="stat-label">reach an endgame{m.endgameScore !== null ? ` (score ${m.endgameScore}%)` : ""}</span>
        </div>
        <div>
          <span className="stat">{pct(m.deficitRate)}</span>
          <span className="stat-label">played down material{m.deficitScore !== null ? ` (score ${m.deficitScore}%)` : ""}</span>
        </div>
        <div>
          <span className="stat">{(m.checksPerMove * 100).toFixed(1)}</span>
          <span className="stat-label">checks per 100 moves</span>
        </div>
      </div>

      <div className="card repertoire">
        <h3>Repertoire</h3>
        <div className="tally-grid">
          <TallyTable title="As White" rows={repertoire.white} />
          <TallyTable title="As Black" rows={repertoire.black} />
          <TallyTable title="First move as White" rows={repertoire.firstMoves} limit={4} />
          <TallyTable title="As Black, facing" rows={repertoire.vsFirstMove} limit={4} />
        </div>
      </div>
    </div>
  );
}
