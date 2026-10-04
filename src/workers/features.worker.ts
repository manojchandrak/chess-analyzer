// Reads games' moves for the style profile off the main thread.
import type { GameRecord } from "../lib/games";
import { extractFeatures, type GameFeatures } from "../lib/style";

export interface FeaturesRequest {
  id: number;
  games: GameRecord[];
}
export interface FeaturesResponse {
  id: number;
  entries: [string, GameFeatures | null][];
}

self.onmessage = (e: MessageEvent<FeaturesRequest>) => {
  const { id, games } = e.data;
  const entries = games.map((g): [string, GameFeatures | null] => {
    try {
      return [g.id, g.playerColor ? extractFeatures(g, g.playerColor) : null];
    } catch {
      return [g.id, null]; // a game whose moves can't be replayed is skipped, not fatal
    }
  });
  (self as unknown as Worker).postMessage({ id, entries } satisfies FeaturesResponse);
};
