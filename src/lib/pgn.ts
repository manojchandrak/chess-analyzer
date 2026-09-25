import { Chess } from "chess.js";
import type { GameRecord } from "./games.ts";

export interface ParsedMove {
  ply: number; // 1-indexed, White's 1st move = 1, Black's 1st move = 2
  moveNumber: number; // full move number (both colors share one)
  color: "w" | "b";
  san: string;
  /** Piece moved and piece captured (chess.js letters), for tactical patterns. */
  piece: string;
  captured: string | null;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGame {
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  moves: ParsedMove[];
}

/** Parses a PGN string into headers plus a per-ply move list, each carrying the
 * FEN before and after the move (so the engine can evaluate every position). */
export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.header();
  const history = chess.history({ verbose: true });

  const replay = new Chess();
  const moves: ParsedMove[] = history.map((move, index) => {
    const fenBefore = replay.fen();
    replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    const fenAfter = replay.fen();
    return {
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color as "w" | "b",
      san: move.san,
      piece: move.piece,
      captured: move.captured ?? null,
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter,
    };
  });

  const parseElo = (value: string | null | undefined): number | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return {
    white: headers.White ?? "White",
    black: headers.Black ?? "Black",
    whiteElo: parseElo(headers.WhiteElo),
    blackElo: parseElo(headers.BlackElo),
    result: headers.Result ?? "*",
    moves,
  };
}

/** Replays a GameRecord's SAN moves into the same shape as parsePgn. */
export function parseRecord(g: GameRecord): ParsedGame {
  const chess = new Chess();
  const moves: ParsedMove[] = [];
  for (const san of g.moves.split(" ").filter(Boolean)) {
    const fenBefore = chess.fen();
    const move = chess.move(san);
    moves.push({
      ply: moves.length + 1,
      moveNumber: Math.floor(moves.length / 2) + 1,
      color: move.color as "w" | "b",
      san: move.san,
      piece: move.piece,
      captured: move.captured ?? null,
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter: chess.fen(),
    });
  }
  return { white: g.white, black: g.black, whiteElo: g.whiteElo, blackElo: g.blackElo, result: g.result, moves };
}
