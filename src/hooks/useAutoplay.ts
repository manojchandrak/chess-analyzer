import { useEffect, useState } from "react";

/** Steps `ply` forward every `intervalMs` until the end of the game. While `hold` is true (a comment
 * is being read aloud) it waits, and moves on shortly after the speech ends. */
export function useAutoplay(ply: number, total: number, setPly: (update: (p: number) => number) => void, intervalMs = 1600, hold = false) {
  const [wanted, setWanted] = useState(false);
  // Playing stops by itself at the end of the game, without a state update in an effect.
  const playing = wanted && ply < total;

  useEffect(() => {
    if (!playing || hold) return;
    const t = setTimeout(() => setPly((p) => p + 1), intervalMs);
    return () => clearTimeout(t);
  }, [playing, hold, ply, setPly, intervalMs]);

  const toggle = (restart: () => void) => {
    if (playing) {
      setWanted(false);
      return;
    }
    if (ply >= total) restart();
    setWanted(true);
  };

  return { playing, toggle };
}
