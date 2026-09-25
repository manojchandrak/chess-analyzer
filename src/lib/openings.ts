// Names the opening and variation at each point of a game, from Lichess's
// opening dataset (public/openings.json, built by scripts/build-openings.ts).
import { openingKey } from "./openingKey";
import type { ParsedMove } from "./pgn";

export interface OpeningName {
  eco: string;
  name: string;
}

let promise: Promise<Map<string, OpeningName>> | null = null;

export function loadOpenings(): Promise<Map<string, OpeningName>> {
  promise ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r): Promise<Record<string, [string, string]>> => (r.ok ? r.json() : Promise.resolve({})))
    .then((raw) => new Map(Object.entries(raw).map(([k, [eco, name]]): [string, OpeningName] => [k, { eco, name }])))
    .catch(() => new Map());
  return promise;
}

/** For each ply (0 = start), the most specific opening reached so far, plus the
 * ply of the last named position ("book" moves). The dataset only names some
 * positions along a line, so unnamed moves between named ones still count as book. */
export function openingsAlong(moves: ParsedMove[], db: Map<string, OpeningName>): { perPly: (OpeningName | null)[]; bookPlies: number } {
  const perPly: (OpeningName | null)[] = [null];
  let bookPlies = 0;
  moves.forEach((m, i) => {
    const hit = db.get(openingKey(m.fenAfter));
    if (hit) bookPlies = i + 1;
    perPly.push(hit ?? perPly[perPly.length - 1]);
  });
  return { perPly, bookPlies };
}
