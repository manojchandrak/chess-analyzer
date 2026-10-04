import { useEffect, useState } from "react";

/** Steps `ply` forward every `intervalMs` until the end of the game. */
export function useAutoplay(ply: number, total: number, setPly: (update: (p: number) => number) => void, intervalMs = 1600) {
  const [wanted, setWanted] = useState(false);
  // Playing stops by itself at the end of the game, without a state update in an effect.
  const playing = wanted && ply < total;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPly((p) => p + 1), intervalMs);
    return () => clearTimeout(t);
  }, [playing, ply, setPly, intervalMs]);

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
