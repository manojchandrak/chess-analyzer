import { useCallback, useEffect, useRef, useState } from "react";
import { autoReview } from "../lib/autoReview";
import type { StockfishEngine } from "../lib/engine";
import type { GameRecord } from "../lib/games";
import { hasGameStats } from "../lib/gameStats";
import { reviewGame } from "../lib/review";

/** Reviews the listed games in the background while `enabled`, so their numbers fill in without opening them.
 * Games already reviewed (saved in this browser) or analyzed by Lichess are used as they are. */
export function useAutoReview(games: GameRecord[] | null, engine: StockfishEngine | null, enabled: boolean, depth = 10) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumping this restarts a run that was stopped or failed.
  const [attempt, setAttempt] = useState(0);
  const stopped = useRef(false);
  // True after the user pressed Stop, until they ask for the rest to be filled in.
  const [stoppedByUser, setStoppedByUser] = useState(false);

  useEffect(() => {
    if (!enabled || !games || games.length === 0) return;
    let cancelled = false;
    stopped.current = false;
    void autoReview(games, {
      hasStats: hasGameStats,
      cancelled: () => cancelled || stopped.current,
      review: (g) => reviewGame(g, engine, depth),
      onProgress: (done, total) => {
        if (!cancelled) setProgress(done >= total ? null : { done, total });
      },
    }).then((r) => {
      if (cancelled) return;
      setError(r.error);
      if (r.stopped || r.error) setProgress(null);
    });
    return () => {
      cancelled = true;
    };
  }, [games, engine, enabled, depth, attempt]);

  const stop = useCallback(() => {
    stopped.current = true;
    setStoppedByUser(true);
    setProgress(null);
  }, []);
  /** Starts again: after a failure, or to fill in the rest after Stop. */
  const retry = useCallback(() => {
    setError(null);
    setStoppedByUser(false);
    setAttempt((a) => a + 1);
  }, []);

  return { progress, error, stoppedByUser, stop, retry };
}
