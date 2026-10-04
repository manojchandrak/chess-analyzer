// Computes per-game style features for a list of games, in a Web Worker when the
// browser has one (so thousands of games don't freeze the page), and on the main
// thread in small batches otherwise.
import type { GameRecord } from "./games.ts";
import { extractFeatures, type GameFeatures } from "./style.ts";

const BATCH = 300;

export type FeatureMap = Map<string, GameFeatures | null>;

function inline(games: GameRecord[]): [string, GameFeatures | null][] {
  return games.map((g) => {
    try {
      return [g.id, g.playerColor ? extractFeatures(g, g.playerColor) : null];
    } catch {
      return [g.id, null];
    }
  });
}

/** Resolves with every game's features, or null if `cancelled()` became true meanwhile. */
export async function computeFeatures(games: GameRecord[], onProgress?: (done: number, total: number) => void, cancelled: () => boolean = () => false): Promise<FeatureMap | null> {
  const out: FeatureMap = new Map();
  let worker: Worker | null = null;
  try {
    if (typeof Worker !== "undefined") worker = new Worker(new URL("../workers/features.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }

  try {
    for (let i = 0; i < games.length; i += BATCH) {
      const chunk = games.slice(i, i + BATCH);
      let entries: [string, GameFeatures | null][];
      if (worker) {
        const w = worker;
        try {
          entries = await new Promise((resolve, reject) => {
            const onMessage = (e: MessageEvent<{ entries: [string, GameFeatures | null][] }>) => (cleanup(), resolve(e.data.entries));
            const onError = () => (cleanup(), reject(new Error("worker failed")));
            const cleanup = () => {
              w.removeEventListener("message", onMessage as EventListener);
              w.removeEventListener("error", onError);
            };
            w.addEventListener("message", onMessage as EventListener);
            w.addEventListener("error", onError);
            w.postMessage({ id: i, games: chunk });
          });
        } catch {
          // The worker is unavailable (or crashed): carry on without it.
          w.terminate();
          worker = null;
          entries = inline(chunk);
        }
      } else {
        entries = inline(chunk);
        await new Promise((r) => setTimeout(r, 0)); // let the page breathe between batches
      }
      for (const [id, f] of entries) out.set(id, f);
      onProgress?.(Math.min(i + BATCH, games.length), games.length);
      if (cancelled()) return null;
    }
  } finally {
    worker?.terminate();
  }
  return out;
}
