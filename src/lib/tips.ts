// Turns a profile (and, when available, an engine review) into concrete,
// evidence-backed suggestions. Each tip quotes the numbers it is based on.
import type { GameRecord } from "./games.ts";
import type { Profile } from "./profile.ts";
import type { ReviewSummary } from "./review.ts";

export interface Tip {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low" | "strength";
  resource?: { label: string; url: string };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const openingUrl = (family: string) => `https://lichess.org/opening/${encodeURIComponent(family.replace(/\s*\/.*$/, "").replace(/ /g, "_"))}`;

export function buildTips(profile: Profile, games: GameRecord[], review: ReviewSummary | null): Tip[] {
  const tips: Tip[] = [];
  const { results, byColor, metrics: m, repertoire } = profile;
  if (results.games < 10) {
    return [{ title: "Load more games", detail: `Only ${results.games} games were found. Suggestions need at least 10 finished games to be meaningful.`, priority: "medium" }];
  }

  // Time trouble: losses on the clock
  const mine = games.filter((g) => g.playerColor);
  const losses = mine.filter((g) => (g.result === "1-0" && g.playerColor === "b") || (g.result === "0-1" && g.playerColor === "w"));
  const timeLosses = losses.filter((g) => g.termination === "timeout");
  if (losses.length >= 3 && timeLosses.length / losses.length >= 0.2) {
    tips.push({
      title: "You lose a lot of games on time",
      detail: `${timeLosses.length} of your ${losses.length} losses (${pct(timeLosses.length / losses.length)}) were on the clock. Play time controls with an increment, decide faster in the opening, and keep a reserve for the last 10 moves.`,
      priority: "high",
    });
  }

  // Early collapses
  const shortLosses = losses.filter((g) => g.moves.split(" ").length <= 50);
  if (losses.length >= 5 && shortLosses.length / losses.length >= 0.35) {
    tips.push({
      title: "Many of your losses end before move 25",
      detail: `${shortLosses.length} of ${losses.length} losses were over within 25 moves. That usually means opening traps or an exposed king: finish development and castle before starting operations.`,
      priority: "high",
      resource: { label: "Opening puzzles on Lichess", url: "https://lichess.org/training/opening" },
    });
  }

  // Engine-based tips
  if (review && review.games >= 3) {
    const phases = (["opening", "middlegame", "endgame"] as const).filter((p) => review.phases[p].accuracy !== null && review.phases[p].moves >= 10);
    const sorted = [...phases].sort((a, b) => (review.phases[a].accuracy ?? 0) - (review.phases[b].accuracy ?? 0));
    if (sorted.length >= 2) {
      const worst = sorted[0];
      const best = sorted[sorted.length - 1];
      const gap = (review.phases[best].accuracy ?? 0) - (review.phases[worst].accuracy ?? 0);
      if (gap >= 4) {
        const resource =
          worst === "opening"
            ? { label: "Opening puzzles on Lichess", url: "https://lichess.org/training/opening" }
            : worst === "middlegame"
              ? { label: "Middlegame puzzles on Lichess", url: "https://lichess.org/training/middlegame" }
              : { label: "Endgame practice on Lichess", url: "https://lichess.org/practice" };
        tips.push({
          title: `Your ${worst} is your weakest phase`,
          detail: `Engine accuracy: ${worst} ${review.phases[worst].accuracy}% vs ${best} ${review.phases[best].accuracy}% across ${review.games} reviewed games.`,
          priority: "high",
          resource,
        });
        tips.push({ title: `Your ${best} is your strongest phase`, detail: `${review.phases[best].accuracy}% accuracy in the ${best}.`, priority: "strength" });
      }
    }
    if (review.blunders > 0 && review.blundersPerGame >= 0.8) {
      const hanging = review.hangingBlunders / review.blunders;
      tips.push({
        title: hanging >= 0.4 ? "You leave pieces hanging" : "Cut down on blunders",
        detail:
          `${review.blundersPerGame.toFixed(1)} blunders per game.` +
          (hanging >= 0.4 ? ` In ${pct(hanging)} of them the opponent immediately won a piece. Before each move, check what your opponent can capture next.` : " Before each move, check your opponent's checks, captures and threats."),
        priority: "high",
        resource: hanging >= 0.4 ? { label: "Hanging-piece puzzles on Lichess", url: "https://lichess.org/training/hangingPiece" } : { label: "Lichess puzzles", url: "https://lichess.org/training" },
      });
    }
    if (review.lowClock && review.normalClock && review.lowClock.moves >= 10 && review.lowClock.blunderRate >= review.normalClock.blunderRate * 2 && review.lowClock.blunderRate >= 0.05) {
      tips.push({
        title: "Your play falls apart when the clock runs low",
        detail: `You blunder ${pct(review.lowClock.blunderRate)} of moves when under 10% of your time, vs ${pct(review.normalClock.blunderRate)} otherwise. Spend less time early so you're not in a scramble.`,
        priority: "medium",
      });
    }
    if (review.missedWins >= 2 && review.missedWins / Math.max(1, review.winningPositions) >= 0.25) {
      tips.push({
        title: "You don't convert winning positions",
        detail: `You were +3 or better in ${review.winningPositions} games but won only ${review.winningPositions - review.missedWins}. When ahead, trade pieces, remove counterplay and don't rush.`,
        priority: "medium",
        resource: { label: "'Advantage' puzzles on Lichess", url: "https://lichess.org/training/advantage" },
      });
    }
  }

  // Openings
  const families = [
    ...repertoire.white.map((f) => ({ ...f, side: "White" })),
    ...repertoire.black.map((f) => ({ ...f, side: "Black" })),
  ].filter((f) => f.games >= 4);
  const weak = families.filter((f) => f.score <= results.score - 15).sort((a, b) => a.score - b.score).slice(0, 2);
  for (const f of weak) {
    tips.push({
      title: `Rework your ${f.name} games as ${f.side}`,
      detail: `You score ${f.score}% in ${f.games} ${f.name} games with ${f.side} (overall ${results.score}%). Learn its main plans and typical traps, or steer toward openings you understand better.`,
      priority: "medium",
      resource: { label: `${f.name} on Lichess`, url: openingUrl(f.name) },
    });
  }
  const strong = families.filter((f) => f.score >= results.score + 10).sort((a, b) => b.score - a.score)[0];
  if (strong) tips.push({ title: `Your ${strong.name} games as ${strong.side} go well`, detail: `${strong.score}% in ${strong.games} games (overall ${results.score}%). Keep steering toward it.`, priority: "strength" });

  // Color balance
  if (byColor.w.games >= 5 && byColor.b.games >= 5 && Math.abs(byColor.w.score - byColor.b.score) >= 15) {
    const weaker = byColor.w.score < byColor.b.score ? "White" : "Black";
    tips.push({
      title: `Your results with ${weaker} lag behind`,
      detail: `You score ${byColor.w.score}% with White and ${byColor.b.score}% with Black. Your ${weaker} repertoire needs work.`,
      priority: "medium",
    });
  }

  // King safety and development
  if (m.castledRate < 0.7) {
    tips.push({
      title: "Castle more often",
      detail: `You castle in only ${pct(m.castledRate)} of games that last 15+ moves. A king left in the center is the most common reason games collapse early.`,
      priority: "medium",
    });
  }
  if (m.earlyQueenRate > 0.15) {
    tips.push({
      title: "Bring the queen out later",
      detail: `Your queen moves within the first 5 moves in ${pct(m.earlyQueenRate)} of games. Develop knights and bishops first; an early queen gets chased and loses time.`,
      priority: "low",
    });
  }

  // Endgames and risk
  if (m.endgameScore !== null && m.endgameRate * results.games >= 5 && m.endgameScore <= results.score - 10) {
    tips.push({
      title: "Study endgames",
      detail: `You score ${m.endgameScore}% in games that reach an endgame, vs ${results.score}% overall.`,
      priority: "medium",
      resource: { label: "Endgame practice on Lichess", url: "https://lichess.org/practice" },
    });
  }
  if (m.deficitRate >= 0.25 && m.deficitScore !== null && m.deficitScore < 40) {
    tips.push({
      title: "Your material gambles don't pay off",
      detail: `You play on down material in ${pct(m.deficitRate)} of games and score just ${m.deficitScore}% in them. Make sure a sacrifice gives concrete compensation before you make it.`,
      priority: "low",
    });
  }

  const order = { high: 0, medium: 1, low: 2, strength: 3 };
  return tips.sort((a, b) => order[a.priority] - order[b.priority]);
}
