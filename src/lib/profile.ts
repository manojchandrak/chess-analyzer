// Aggregates per-game style features into a player profile: results, repertoire,
// raw style metrics, 0-100 traits and a style archetype.
import type { GameFeatures } from "./style.ts";

export interface Tally {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points per game, 0-100. */
  score: number;
}

export interface NamedTally extends Tally {
  name: string;
}

export interface Metrics {
  checksPerMove: number;
  capturesPerMove: number;
  /** Flank pawn pushes toward the enemy king per game (games where it castled). */
  stormPerGame: number;
  oppositeCastlingRate: number;
  castledRate: number;
  avgCastleMove: number | null;
  earlyQueenRate: number;
  /** Queens traded by move 25. */
  queenTradeRate: number;
  /** Played 4+ plies down 2+ pawns of material before move 40. */
  deficitRate: number;
  /** Score in those games (a sign of sacrifices that worked). */
  deficitScore: number | null;
  endgameRate: number;
  endgameScore: number | null;
  drawRate: number;
  avgLength: number;
  /** Share of wins that took 30 moves or fewer. */
  quickWinRate: number;
}

export type TraitKey = "aggression" | "risk" | "endgame" | "solidity" | "simplification";
export type Traits = Record<TraitKey, number>;

export interface Archetype {
  id: "attacker" | "positional" | "solid" | "universal";
  label: string;
  description: string;
}

export interface Profile {
  results: Tally;
  byColor: { w: Tally; b: Tally };
  metrics: Metrics;
  traits: Traits;
  archetype: Archetype;
  repertoire: {
    white: NamedTally[];
    black: NamedTally[];
    firstMoves: NamedTally[];
    /** Black's replies grouped by White's first move ("vs 1.e4"). */
    vsFirstMove: NamedTally[];
  };
}

export const TRAIT_LABELS: Record<TraitKey, { label: string; hint: string }> = {
  aggression: { label: "Aggression", hint: "Checks, pawn storms at the enemy king, opposite-side castling and quick wins" },
  risk: { label: "Sacrificial risk", hint: "How often you play on while down material" },
  endgame: { label: "Endgame appetite", hint: "How often your games reach an endgame, and how long they run" },
  solidity: { label: "Solidity", hint: "Castling, avoiding early queen sorties, and drawn games" },
  simplification: { label: "Simplification", hint: "Early queen trades and captures per move" },
};

function tally(items: GameFeatures[]): Tally {
  const wins = items.filter((g) => g.score === 1).length;
  const draws = items.filter((g) => g.score === 0.5).length;
  const games = items.length;
  return { games, wins, draws, losses: games - wins - draws, score: games ? Math.round(((wins + draws / 2) / games) * 100) : 0 };
}

function groupTally(items: GameFeatures[], key: (g: GameFeatures) => string | null, min = 1): NamedTally[] {
  const groups = new Map<string, GameFeatures[]>();
  for (const g of items) {
    const k = key(g);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  return [...groups.entries()]
    .map(([name, gs]) => ({ name, ...tally(gs) }))
    .filter((t) => t.games >= min)
    .sort((a, b) => b.games - a.games);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (xs: GameFeatures[], pred: (g: GameFeatures) => boolean) => (xs.length ? xs.filter(pred).length / xs.length : 0);
const scoreOf = (xs: GameFeatures[]) => (xs.length ? Math.round(mean(xs.map((g) => g.score)) * 100) : null);

export function computeMetrics(games: GameFeatures[]): Metrics {
  const ownMoves = games.reduce((a, g) => a + g.ownMoves, 0) || 1;
  const vsCastled = games.filter((g) => g.opponentCastled);
  const castled = games.filter((g) => g.castled);
  const deficit = games.filter((g) => g.sustainedDeficit >= 2);
  const endgames = games.filter((g) => g.reachedEndgame);
  const wins = games.filter((g) => g.score === 1);
  return {
    checksPerMove: games.reduce((a, g) => a + g.checks, 0) / ownMoves,
    capturesPerMove: games.reduce((a, g) => a + g.captures, 0) / ownMoves,
    stormPerGame: mean(vsCastled.map((g) => g.stormPushes)),
    oppositeCastlingRate: rate(games.filter((g) => g.castled && g.opponentCastled), (g) => g.castled !== g.opponentCastled),
    castledRate: rate(games.filter((g) => g.length >= 15), (g) => g.castled !== null),
    avgCastleMove: castled.length ? mean(castled.map((g) => g.castledAtMove ?? 0)) : null,
    earlyQueenRate: rate(games, (g) => g.earlyQueen),
    queenTradeRate: rate(games, (g) => g.queensOffAt !== null && g.queensOffAt <= 25),
    deficitRate: rate(games, (g) => g.sustainedDeficit >= 2),
    deficitScore: scoreOf(deficit),
    endgameRate: rate(games, (g) => g.reachedEndgame),
    endgameScore: scoreOf(endgames),
    drawRate: rate(games, (g) => g.score === 0.5),
    avgLength: mean(games.map((g) => g.length)),
    quickWinRate: rate(wins, (g) => g.length <= 30),
  };
}

// Each metric is scaled to 0-100 between bounds taken from the 12 legends'
// collections (roughly the lowest and highest legend, widened a little), so a
// trait of 50 is "middle of the legends" and 0/100 are the extremes.
const SCALE: Record<keyof Omit<Metrics, "avgCastleMove" | "deficitScore" | "endgameScore">, [number, number]> = {
  checksPerMove: [0.03, 0.1],
  capturesPerMove: [0.19, 0.245],
  stormPerGame: [1.1, 2],
  oppositeCastlingRate: [0.06, 0.18],
  castledRate: [0.74, 0.94],
  earlyQueenRate: [0.03, 0.09],
  queenTradeRate: [0.2, 0.38],
  deficitRate: [0.05, 0.3],
  endgameRate: [0.17, 0.43],
  drawRate: [0.08, 0.57],
  avgLength: [33, 47],
  quickWinRate: [0.1, 0.5],
};

function norm(key: keyof typeof SCALE, value: number): number {
  const [lo, hi] = SCALE[key];
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

export function computeTraits(m: Metrics): Traits {
  const avg = (xs: number[]) => Math.round(mean(xs));
  return {
    aggression: avg([norm("checksPerMove", m.checksPerMove), norm("stormPerGame", m.stormPerGame), norm("oppositeCastlingRate", m.oppositeCastlingRate), norm("quickWinRate", m.quickWinRate)]),
    risk: avg([norm("deficitRate", m.deficitRate)]),
    endgame: avg([norm("endgameRate", m.endgameRate), norm("avgLength", m.avgLength)]),
    solidity: avg([norm("castledRate", m.castledRate), 100 - norm("earlyQueenRate", m.earlyQueenRate), norm("drawRate", m.drawRate)]),
    simplification: avg([norm("queenTradeRate", m.queenTradeRate), norm("capturesPerMove", m.capturesPerMove)]),
  };
}

const ARCHETYPES: Record<Archetype["id"], Omit<Archetype, "id">> = {
  attacker: {
    label: "Attacker",
    description: "Goes for the king: checks, pawn storms and opposite-side castling, and willing to give material for the initiative.",
  },
  positional: {
    label: "Positional player",
    description: "Prefers trading down into favorable endgames and winning them slowly over attacking directly.",
  },
  solid: {
    label: "Solid / prophylactic",
    description: "Keeps the king safe, avoids early adventures and is hard to beat, at the cost of more draws.",
  },
  universal: {
    label: "Universal",
    description: "No single trait dominates: attacks, defends and grinds endgames as the position asks.",
  },
};

export function archetypeOf(t: Traits): Archetype {
  const scores: [Archetype["id"], number][] = [
    ["attacker", (t.aggression * 2 + t.risk) / 3],
    ["positional", (t.endgame + t.simplification + (100 - t.aggression)) / 3],
    ["solid", (t.solidity * 2 + (100 - t.aggression)) / 3],
  ];
  scores.sort((x, y) => y[1] - x[1]);
  const id = scores[0][1] < 58 ? "universal" : scores[0][0];
  return { id, ...ARCHETYPES[id] };
}

export function buildProfile(games: GameFeatures[]): Profile {
  const metrics = computeMetrics(games);
  const traits = computeTraits(metrics);
  const white = games.filter((g) => g.color === "w");
  const black = games.filter((g) => g.color === "b");
  return {
    results: tally(games),
    byColor: { w: tally(white), b: tally(black) },
    metrics,
    traits,
    archetype: archetypeOf(traits),
    repertoire: {
      white: groupTally(white, (g) => g.family),
      black: groupTally(black, (g) => g.family),
      firstMoves: groupTally(white, (g) => (g.firstMove ? `1.${g.firstMove}` : null)),
      vsFirstMove: groupTally(black, (g) => (g.facedFirstMove ? `vs 1.${g.facedFirstMove}` : null)),
    },
  };
}

/** 0-100 similarity between two trait profiles (100 = identical). */
export function similarity(a: Traits, b: Traits): number {
  const keys = Object.keys(a) as TraitKey[];
  const dist = Math.sqrt(keys.reduce((s, k) => s + (a[k] - b[k]) ** 2, 0) / keys.length);
  return Math.max(0, Math.round(100 - dist));
}
