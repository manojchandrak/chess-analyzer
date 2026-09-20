// (average centipawn loss, approximate rating) anchor points, roughly calibrated
// against commonly-cited ACPL/rating correlations. Linear interpolation between
// anchors; clamped at the ends. This is a rough estimate, not an official rating.
const ANCHORS: [acpl: number, rating: number][] = [
  [0, 3000],
  [10, 2600],
  [20, 2300],
  [30, 2100],
  [40, 1950],
  [55, 1800],
  [70, 1650],
  [90, 1500],
  [115, 1350],
  [145, 1200],
  [180, 1050],
  [220, 900],
  [280, 750],
  [350, 550],
];

/** Rough estimated performance rating from average centipawn loss. Approximate —
 * a single game is a small sample, and this is not an official rating. */
export function estimateRating(averageCpLoss: number): number {
  if (averageCpLoss <= ANCHORS[0][0]) return ANCHORS[0][1];
  const last = ANCHORS[ANCHORS.length - 1];
  if (averageCpLoss >= last[0]) return last[1];

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [cpA, ratingA] = ANCHORS[i];
    const [cpB, ratingB] = ANCHORS[i + 1];
    if (averageCpLoss >= cpA && averageCpLoss <= cpB) {
      const t = (averageCpLoss - cpA) / (cpB - cpA);
      return Math.round(ratingA + t * (ratingB - ratingA));
    }
  }
  return last[1];
}
