// A game from any source (Lichess, Chess.com, a legend's collection), reduced to
// what the profile and the viewer need. Moves are SAN, space-separated.

export type Source = "lichess" | "chesscom" | "legend" | "pgn";
export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "daily";
/** How the game ended, normalized across sites. */
export type Termination = "mate" | "resign" | "timeout" | "draw" | "other";

export interface GameRecord {
  id: string;
  source: Source;
  url: string | null;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  /** "1-0", "0-1" or "1/2-1/2" */
  result: string;
  /** ISO date (YYYY-MM-DD, or YYYY when only the year is known) */
  date: string | null;
  event: string | null;
  eco: string | null;
  /** Detailed opening name when the site provides one. */
  opening: string | null;
  timeClass: TimeClass | null;
  termination: Termination | null;
  /** Starting clock in seconds, when known. */
  clockInitial: number | null;
  /** Clock left (seconds) after each ply, when the site records it. */
  clocks: number[] | null;
  /** Evaluations from White's perspective after each ply (Lichess server analysis). */
  evals: { cp: number | null; mate: number | null }[] | null;
  moves: string;
  /** Which side the profiled player had in this game, if known. */
  playerColor: "w" | "b" | null;
}

/** 1, 0.5 or 0 for the given color. */
export function scoreFor(result: string, color: "w" | "b"): number | null {
  if (result === "1-0") return color === "w" ? 1 : 0;
  if (result === "0-1") return color === "b" ? 1 : 0;
  if (result === "1/2-1/2") return 0.5;
  return null;
}

/** Splits a multi-game PGN file into one string per game. */
export function splitPgn(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n(?=\[Event\s)/)
    .map((g) => g.trim())
    .filter((g) => g.startsWith("["));
}

export function pgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) headers[m[1]] = m[2].replace(/\\"/g, '"');
  return headers;
}

/** The move text of a PGN with comments, variations, NAGs and move numbers removed. */
export function pgnMoveText(pgn: string): string[] {
  let body = pgn.replace(/^\[.*\]\s*$/gm, "");
  body = body.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  // strip nested variations
  let prev;
  do {
    prev = body;
    body = body.replace(/\([^()]*\)/g, " ");
  } while (body !== prev);
  return body
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
    .map((t) => t.replace(/[!?]+$/, ""));
}

/** Clock readings ([%clk h:mm:ss]) in move order, in seconds. */
export function pgnClocks(pgn: string): number[] | null {
  const out: number[] = [];
  for (const m of pgn.matchAll(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g)) {
    out.push(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
  }
  return out.length ? out : null;
}

export function parseElo(value: string | number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** PGN dates look like "1858.??.??" or "2023.05.14". */
export function pgnDate(value: string | undefined): string | null {
  const m = (value ?? "").match(/^(\d{4})(?:\.(\d\d)\.(\d\d))?/);
  if (!m) return null;
  return m[2] && m[3] && !m[2].includes("?") ? `${m[1]}-${m[2]}-${m[3]}` : m[1];
}

/** Time class from a PGN TimeControl header like "180+2" (estimated duration
 * in the Lichess way: base + 40 × increment). */
export function timeClassOf(timeControl: string | undefined): TimeClass | null {
  if (!timeControl || timeControl === "-") return null;
  if (timeControl.includes("/")) return "daily";
  const [base, inc] = timeControl.split("+").map(Number);
  if (!Number.isFinite(base)) return null;
  const est = base + 40 * (inc || 0);
  if (est < 180) return "bullet";
  if (est < 480) return "blitz";
  if (est < 1500) return "rapid";
  return "classical";
}

/** A standalone PGN for a record (used for export and for the single-game analyzer). */
export function toPgn(g: GameRecord): string {
  const tags: [string, string | null][] = [
    ["Event", g.event ?? "?"],
    ["Site", g.url ?? "?"],
    ["Date", g.date ? g.date.replace(/-/g, ".") : "????.??.??"],
    ["White", g.white],
    ["Black", g.black],
    ["Result", g.result],
    ["WhiteElo", g.whiteElo ? String(g.whiteElo) : null],
    ["BlackElo", g.blackElo ? String(g.blackElo) : null],
    ["ECO", g.eco],
  ];
  const head = tags.filter(([, v]) => v).map(([k, v]) => `[${k} "${String(v).replace(/"/g, '\\"')}"]`).join("\n");
  const sans = g.moves.split(" ").filter(Boolean);
  const body = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(" ");
  return `${head}\n\n${body} ${g.result}\n`;
}
