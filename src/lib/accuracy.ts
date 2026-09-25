import type { EngineEval } from "./engine";

/** Converts an engine eval to a single centipawn-equivalent number from the
 * position's own side-to-move perspective. Mate scores are mapped to large
 * saturating values so the win% formula below still behaves sensibly. */
export function toCentipawns(e: EngineEval): number {
  if (e.mate !== null) {
    const sign = e.mate > 0 ? 1 : -1;
    return sign * (100000 - Math.abs(e.mate) * 100);
  }
  return e.cp ?? 0;
}

/** Lichess's win-probability model: maps a centipawn score (from one side's
 * perspective) to that side's estimated winning chances, 0-100. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Per-move accuracy from the drop in winning chances a move causes, using
 * lichess's published calibration (https://lichess.org/page/accuracy). */
export function moveAccuracy(winPercentBefore: number, winPercentAfter: number): number {
  const drop = Math.max(0, winPercentBefore - winPercentAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.min(100, Math.max(0, acc));
}

export type MoveQuality = "best" | "inaccuracy" | "mistake" | "blunder";

/** Lichess's thresholds: how much a move drops the mover's winning chances
 * (0-100 scale). Judging by win% rather than raw centipawns means dropping from
 * +8 to +6 in a won position isn't a "blunder", while +1 to -1 is. */
export function classifyMove(winPercentDrop: number): MoveQuality {
  if (winPercentDrop < 5) return "best";
  if (winPercentDrop < 10) return "inaccuracy";
  if (winPercentDrop < 15) return "mistake";
  return "blunder";
}
