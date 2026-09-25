import type { GameRecord } from "./games";
import type { LegendGameRow, LegendIndexEntry } from "./legends";

const base = import.meta.env.BASE_URL;
let indexPromise: Promise<LegendIndexEntry[]> | null = null;
const gamesCache = new Map<string, Promise<GameRecord[]>>();

export function loadLegendIndex(): Promise<LegendIndexEntry[]> {
  indexPromise ??= fetch(`${base}legends/index.json`).then((r) => {
    if (!r.ok) throw new Error(`Couldn't load the legends (HTTP ${r.status}).`);
    return r.json();
  });
  return indexPromise;
}

export function loadLegendGames(entry: LegendIndexEntry): Promise<GameRecord[]> {
  let p = gamesCache.get(entry.id);
  if (!p) {
    p = fetch(`${base}legends/${entry.id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${entry.name}'s games (HTTP ${r.status}).`);
        return r.json() as Promise<LegendGameRow[]>;
      })
      .then((rows) =>
        rows.map(([white, black, result, date, event, eco, whiteElo, blackElo, moves, fast, color], i) => {
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
            moves,
            playerColor: color,
          };
        }),
      );
    gamesCache.set(entry.id, p);
  }
  return p;
}
