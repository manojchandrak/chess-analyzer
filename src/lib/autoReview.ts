// Background review of a list of games: games that already have numbers (from an earlier visit, or from
// Lichess's own analysis) are skipped or answered from the cache, and the rest are reviewed one after
// another, newest first, so the table's accuracy, brilliant and performance columns fill in without the
// games having to be opened.
import { EngineError } from "./engine.ts";
import type { GameRecord } from "./games.ts";

/** Games that still need a review: the player is known and no numbers are saved for the game yet. */
export function gamesToReview(games: GameRecord[], hasStats: (gameId: string) => boolean): GameRecord[] {
  return games.filter((g) => g.playerColor !== null && !hasStats(g.id));
}

export interface AutoReviewOptions {
  /** Reviews (or loads from the cache) one game; throws EngineError if Stockfish itself fails. */
  review: (game: GameRecord) => Promise<unknown>;
  hasStats: (gameId: string) => boolean;
  /** Checked between games, so the run can be stopped. */
  cancelled?: () => boolean;
  /** Called before each game with how many are done and how many there are in total. */
  onProgress?: (done: number, total: number) => void;
}

export interface AutoReviewResult {
  total: number;
  reviewed: number;
  /** Set when Stockfish failed and the run stopped early; later games weren't tried. */
  error: string | null;
  stopped: boolean;
}

export async function autoReview(games: GameRecord[], { review, hasStats, cancelled = () => false, onProgress }: AutoReviewOptions): Promise<AutoReviewResult> {
  const todo = gamesToReview(games, hasStats);
  const result: AutoReviewResult = { total: todo.length, reviewed: 0, error: null, stopped: false };
  for (let i = 0; i < todo.length; i++) {
    if (cancelled()) {
      result.stopped = true;
      break;
    }
    onProgress?.(i, todo.length);
    try {
      await review(todo[i]);
      result.reviewed++;
    } catch (e) {
      if (e instanceof EngineError) {
        result.error = e.message;
        break;
      }
      // A game that can't be reviewed (bad moves, say) is skipped; the others carry on.
    }
  }
  if (!result.error && !result.stopped) onProgress?.(todo.length, todo.length);
  return result;
}
