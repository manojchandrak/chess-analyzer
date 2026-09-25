// Builds public/openings.json from Lichess's chess-openings dataset (CC0,
// https://github.com/lichess-org/chess-openings): a map from position (the first
// four FEN fields, so transpositions match) to [ECO, name].
// Run: node scripts/build-openings.ts   (expects data-source/openings/{a..e}.tsv)
import { Chess } from "chess.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openingKey } from "../src/lib/openingKey.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out: Record<string, [string, string]> = {};
let lines = 0;

for (const letter of ["a", "b", "c", "d", "e"]) {
  const text = fs.readFileSync(path.join(ROOT, "data-source", "openings", `${letter}.tsv`), "utf8");
  for (const line of text.split("\n").slice(1)) {
    const [eco, name, pgn] = line.split("\t");
    if (!pgn) continue;
    const chess = new Chess();
    chess.loadPgn(pgn);
    const key = openingKey(chess.fen());
    // Several lines can reach one position; keep the first (the dataset lists
    // the canonical name first within an ECO code).
    out[key] ??= [eco, name];
    lines++;
  }
}

fs.writeFileSync(path.join(ROOT, "public", "openings.json"), JSON.stringify(out));
console.log(`${lines} opening lines → ${Object.keys(out).length} positions in public/openings.json`);
