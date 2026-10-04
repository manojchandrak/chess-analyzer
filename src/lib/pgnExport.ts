// Annotated PGN: the game's moves with Lichess-style [%eval] comments and move NAGs,
// so a reviewed game can be opened in any chess program.
import type { AnalysisResult } from "./analyze";
import type { MoveClass } from "./classify";
import type { GameRecord } from "./games";
import type { ParsedGame } from "./pgn";

const MATE_CP = 90000;

/** Numeric annotation glyphs: $1 good (!), $2 mistake (?), $3 brilliant (!!), $4 blunder (??), $6 dubious (?!). */
const NAG: Partial<Record<MoveClass, number>> = { brilliant: 3, great: 1, inaccuracy: 6, mistake: 2, miss: 2, blunder: 4 };

/** "0.34", "-1.20" or "#3" from an eval in centipawns (White's point of view). */
export function evalComment(evalWhite: number): string {
  if (Math.abs(evalWhite) >= MATE_CP) {
    const n = Math.max(1, Math.round((100000 - Math.abs(evalWhite)) / 100));
    return `#${evalWhite > 0 ? n : -n}`;
  }
  return (evalWhite / 100).toFixed(2);
}

const tag = (k: string, v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : `[${k} "${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);

/** Comment text safe to put inside { }: no braces, one line. */
const cleanComment = (text: string) => text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

export function annotatedPgn(game: ParsedGame, record: GameRecord | null | undefined, analysis: AnalysisResult | null, commentary?: string[]): string {
  const tags = [
    tag("Event", record?.event ?? "Analysis"),
    tag("Site", record?.url ?? "?"),
    tag("Date", record?.date ? record.date.replace(/-/g, ".") : "????.??.??"),
    tag("White", game.white),
    tag("Black", game.black),
    tag("Result", game.result),
    tag("WhiteElo", game.whiteElo),
    tag("BlackElo", game.blackElo),
    tag("ECO", record?.eco),
    tag("Opening", record?.opening),
    tag("Annotator", "Chess Game Analyzer (Stockfish)"),
  ].filter(Boolean);

  const parts: string[] = [];
  game.moves.forEach((m, i) => {
    const a = analysis?.moves[i];
    const nag = a ? NAG[a.cls] : undefined;
    const white = m.color === "w";
    let text = white ? `${m.moveNumber}. ${m.san}` : parts.length === 0 || parts[parts.length - 1].endsWith("}") ? `${m.moveNumber}... ${m.san}` : m.san;
    if (nag) text += ` $${nag}`;
    if (a) {
      const best = a.bestSan && a.cls !== "best" && a.cls !== "great" && a.cls !== "brilliant" ? ` Best was ${a.bestSan}.` : "";
      const words = commentary?.[m.ply] ? ` ${cleanComment(commentary[m.ply])}` : best;
      text += ` {[%eval ${evalComment(a.evalAfterWhite)}]${words}}`;
    } else if (commentary?.[m.ply]) {
      text += ` {${cleanComment(commentary[m.ply])}}`;
    }
    parts.push(text);
  });
  return `${tags.join("\n")}\n\n${parts.join(" ")} ${game.result}\n`;
}

/** Downloads text as a file in the browser. */
export function downloadText(filename: string, text: string, type = "application/x-chess-pgn"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pgnFilename(game: ParsedGame): string {
  const clean = (s: string) => s.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "player";
  return `${clean(game.white)}_vs_${clean(game.black)}.pgn`;
}
