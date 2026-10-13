// A permanent bank of the positions where you went wrong in your own analysed games, to be practised again.
// Plain functions on plain data; mistakes.ts keeps the live copy in browser storage (and the account, when logged in).
import { Chess } from "chess.js";
import type { AnalysisResult } from "./analyze.ts";
import type { GameRecord } from "./games.ts";
import type { PuzzleItem } from "./puzzles.ts";

export interface MistakeItem extends PuzzleItem {
  /** When it was added to the bank, in ms. */
  addedAt: number;
}

export type MistakeMap = Record<string, MistakeItem>;

/** How many mistakes are kept; the oldest are dropped first beyond this. */
export const MAX_MISTAKES = 400;

const strip = (san: string) => san.replace(/[+#!?]/g, "");

/** The mistakes and blunders the player made in a Stockfish-reviewed game, as practice positions. */
export function mistakesFromAnalysis(analysis: AnalysisResult, game: Pick<GameRecord, "id" | "white" | "black" | "date">, color: "w" | "b"): PuzzleItem[] {
  const items: PuzzleItem[] = [];
  for (const m of analysis.moves) {
    if (m.color !== color || (m.quality !== "mistake" && m.quality !== "blunder") || !m.bestSan || strip(m.bestSan) === strip(m.san)) continue;
    items.push({
      id: `${game.id}#${m.ply}`,
      gameId: game.id,
      fen: m.fenBefore,
      color,
      played: m.san,
      best: m.bestSan,
      cpLoss: m.cpLoss,
      quality: m.quality,
      opponent: color === "w" ? game.black : game.white,
      date: game.date,
    });
  }
  return items;
}

const validFen = (fen: string): boolean => {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
};

/** Reads stored mistakes, ignoring anything that isn't a complete, legal practice position. */
export function parseMistakes(raw: unknown): MistakeMap {
  const out: MistakeMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const x = v as Partial<MistakeItem>;
    const ok =
      typeof x.gameId === "string" &&
      typeof x.fen === "string" &&
      (x.color === "w" || x.color === "b") &&
      typeof x.played === "string" &&
      typeof x.best === "string" &&
      typeof x.cpLoss === "number" &&
      (x.quality === "mistake" || x.quality === "blunder") &&
      typeof x.addedAt === "number" &&
      validFen(x.fen);
    if (ok) {
      out[id] = { id, gameId: x.gameId!, fen: x.fen!, color: x.color!, played: x.played!, best: x.best!, cpLoss: x.cpLoss!, quality: x.quality!, opponent: typeof x.opponent === "string" ? x.opponent : null, date: typeof x.date === "string" ? x.date : null, addedAt: x.addedAt! };
    }
  }
  return out;
}

/** Adds new mistakes (ones already in the bank are left as they are), dropping the oldest beyond the limit. */
export function addMistakes(map: MistakeMap, items: PuzzleItem[], now: number): MistakeMap {
  const fresh = items.filter((p) => !map[p.id]);
  if (fresh.length === 0) return map;
  const next: MistakeMap = { ...map };
  for (const p of fresh) next[p.id] = { ...p, addedAt: now };
  const all = Object.values(next);
  if (all.length <= MAX_MISTAKES) return next;
  const keep = all.sort((a, b) => b.addedAt - a.addedAt || b.cpLoss - a.cpLoss).slice(0, MAX_MISTAKES);
  return Object.fromEntries(keep.map((m) => [m.id, m]));
}

/** Combines two devices' banks: everything from both, this device's copy winning for the same position. */
export function mergeMistakes(local: MistakeMap, remote: MistakeMap): MistakeMap {
  return { ...remote, ...local };
}

/** The mistakes to practise, biggest losses first. */
export function listMistakes(map: MistakeMap): MistakeItem[] {
  return Object.values(map).sort((a, b) => (b.quality === "blunder" ? 1 : 0) - (a.quality === "blunder" ? 1 : 0) || b.cpLoss - a.cpLoss || b.addedAt - a.addedAt);
}
