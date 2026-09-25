// Builds public/legends/index.json (profiles) and public/legends/<id>.json
// (games) from PGN Mentor's player collections in data-source/.
// Run: node scripts/build-legends.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pgnDate, pgnHeaders, pgnMoveText, parseElo, splitPgn, type GameRecord } from "../src/lib/games.ts";
import { FAST_EVENT, LEGENDS, type LegendGameRow, type LegendIndexEntry } from "../src/lib/legends.ts";
import { buildProfile } from "../src/lib/profile.ts";
import { extractFeatures, type GameFeatures } from "../src/lib/style.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data-source");
const OUT = path.join(ROOT, "public", "legends");
const MIN_CLASSICAL = 200;

fs.mkdirSync(OUT, { recursive: true });
const index: LegendIndexEntry[] = [];

for (const legend of LEGENDS) {
  const file = path.join(SRC, `${legend.name.split(" ").pop()!.normalize("NFD").replace(/[̀-ͯ]/g, "")}.pgn`);
  const text = fs.readFileSync(file, "latin1");
  const rows: LegendGameRow[] = [];
  const features: { f: GameFeatures; fast: boolean }[] = [];
  let skipped = 0;

  for (const pgn of splitPgn(text)) {
    const h = pgnHeaders(pgn);
    const white = (h.White ?? "").trim();
    const black = (h.Black ?? "").trim();
    const color = legend.namePattern.test(white) ? "w" : legend.namePattern.test(black) ? "b" : null;
    if (!color || (h.FEN && h.SetUp === "1")) {
      skipped++;
      continue;
    }
    const game: GameRecord = {
      id: `${legend.id}-${rows.length}`,
      source: "legend",
      url: null,
      white,
      black,
      whiteElo: parseElo(h.WhiteElo),
      blackElo: parseElo(h.BlackElo),
      result: h.Result ?? "*",
      date: pgnDate(h.Date),
      event: h.Event && h.Event !== "?" ? h.Event : null,
      eco: h.ECO || null,
      opening: null,
      timeClass: null,
      termination: null,
      clockInitial: null,
      clocks: null,
      evals: null,
      moves: pgnMoveText(pgn).join(" "),
      playerColor: color,
    };
    const f = extractFeatures(game, color);
    if (!f) {
      skipped++;
      continue;
    }
    const fast = FAST_EVENT.test(game.event ?? "");
    features.push({ f, fast });
    rows.push([game.white, game.black, game.result, game.date, game.event, game.eco, game.whiteElo, game.blackElo, game.moves, fast ? 1 : 0, color]);
  }

  const classical = features.filter((x) => !x.fast).map((x) => x.f);
  const basis = classical.length >= MIN_CLASSICAL ? "classical" : "all";
  const profileGames = basis === "classical" ? classical : features.map((x) => x.f);
  const profile = buildProfile(profileGames);

  const famous: LegendIndexEntry["famous"] = [];
  for (const fam of legend.famous) {
    const i = rows.findIndex((r, k) => {
      const opp = features[k].f.color === "w" ? r[1] : r[0];
      return fam.opponent.test(opp) && (r[3] ?? "").startsWith(fam.year) && features[k].f.score === 1;
    });
    if (i >= 0) famous.push({ title: fam.title, index: i });
    else console.warn(`  ${legend.name}: famous game "${fam.title}" not found`);
  }

  fs.writeFileSync(path.join(OUT, `${legend.id}.json`), JSON.stringify(rows));
  index.push({ id: legend.id, name: legend.name, years: legend.years, title: legend.title, knownFor: legend.knownFor, blurb: legend.blurb, games: rows.length, profileGames: profileGames.length, profileBasis: basis, profile, famous });
  const t = profile.traits;
  console.log(
    `${legend.name.padEnd(22)} ${String(rows.length).padStart(5)} games (${skipped} skipped, profile: ${profileGames.length} ${basis}) ` +
      `agg ${t.aggression} risk ${t.risk} end ${t.endgame} solid ${t.solidity} simp ${t.simplification} → ${profile.archetype.label}`,
  );
}

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
if (process.argv.includes("--metrics")) {
  for (const e of index) {
    const m = e.profile.metrics;
    console.log(e.id.padEnd(11), Object.entries(m).map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(3) : v}`).join(" "));
  }
}
