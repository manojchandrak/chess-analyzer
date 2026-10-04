import type { GameRecord } from "./games";
import { MOVES_CHUNK, type LegendGameRow, type LegendIndexEntry } from "./legends";

const base = import.meta.env.BASE_URL;
let indexPromise: Promise<LegendIndexEntry[]> | null = null;
const gamesCache = new Map<string, Promise<GameRecord[]>>();
const chunkCache = new Map<string, Promise<string[]>>();

export function loadLegendIndex(): Promise<LegendIndexEntry[]> {
  indexPromise ??= fetch(`${base}legends/index.json`).then((r) => {
    if (!r.ok) throw new Error(`Couldn't load the legends (HTTP ${r.status}).`);
    return r.json();
  });
  return indexPromise;
}

/** A legend's games for lists and filters. Moves are NOT included (see `withMoves`), which keeps
 * the download small: the biggest collection is about a fifth of its former size. */
export function loadLegendGames(entry: LegendIndexEntry): Promise<GameRecord[]> {
  let p = gamesCache.get(entry.id);
  if (!p) {
    p = fetch(`${base}legends/${entry.id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${entry.name}'s games (HTTP ${r.status}).`);
        return r.json() as Promise<LegendGameRow[]>;
      })
      .then((rows) =>
        rows.map(([white, black, result, date, event, eco, whiteElo, blackElo, plies, fast, color], i): GameRecord => {
          return {
            id: `${entry.id}-${i}`,
            source: "legend" as const,
            url: null,
            white,
            black,
            whiteElo,
            blackElo,
            result,
            date,
            event,
            eco,
            opening: null,
            timeClass: fast ? ("blitz" as const) : ("classical" as const),
            termination: null,
            clockInitial: null,
            clocks: null,
            evals: null,
            moves: "",
            plies,
            playerColor: color,
          };
        }),
      );
    // Don't cache a failure: a retry should hit the network again.
    p.catch(() => gamesCache.delete(entry.id));
    gamesCache.set(entry.id, p);
  }
  return p;
}

function loadChunk(legendId: string, chunk: number): Promise<string[]> {
  const key = `${legendId}.${chunk}`;
  let p = chunkCache.get(key);
  if (!p) {
    p = fetch(`${base}legends/${legendId}.m${chunk}.json`).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load the moves for this game (HTTP ${r.status}).`);
      return r.json() as Promise<string[]>;
    });
    p.catch(() => chunkCache.delete(key));
    chunkCache.set(key, p);
  }
  return p;
}

/** Splits a legend game id ("morphy-12") into the legend and the game's row number. */
export function parseLegendGameId(id: string): { legendId: string; index: number } | null {
  const m = id.match(/^([a-z]+)-(\d+)$/);
  return m ? { legendId: m[1], index: Number(m[2]) } : null;
}

/** The game with its moves filled in. Games from other sources already have theirs. */
export async function withMoves(game: GameRecord): Promise<GameRecord> {
  if (game.moves || game.source !== "legend") return game;
  const ref = parseLegendGameId(game.id);
  if (!ref) return game;
  const chunk = await loadChunk(ref.legendId, Math.floor(ref.index / MOVES_CHUNK));
  const moves = chunk[ref.index % MOVES_CHUNK];
  if (moves === undefined) throw new Error("The moves for this game weren't found.");
  return { ...game, moves };
}
