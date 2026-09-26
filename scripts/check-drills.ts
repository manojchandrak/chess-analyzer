// Checks the drills in src/lib/drillData.ts: every opening line must be legal,
// and every position drill must be solvable the way the app grades it. The
// bundled Stockfish plays both sides at the app's grading depth; each of the
// solver's moves must pass judgeMove and the goal must be reached in budget.
//
//   node scripts/check-drills.ts
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { MIDDLEGAME_DRILLS, ENDGAME_DRILLS, OPENING_DRILLS, type PositionDrill } from "../src/lib/drillData.ts";
import { bareKingWin, DRILL_DEPTH, judgeMove, solutionMove } from "../src/lib/drills.ts";
import type { EngineEval } from "../src/lib/engine.ts";

// The engine build runs under Node when loaded as CommonJS with its .wasm
// beside it under the same name (this package is "type": "module").
const dir = mkdtempSync(join(tmpdir(), "sf-"));
copyFileSync("public/engine/stockfish-19-lite-single.js", join(dir, "sf.cjs"));
copyFileSync("public/engine/stockfish-19-lite-single.wasm", join(dir, "sf.wasm"));
const proc = spawn(process.execPath, [join(dir, "sf.cjs")]);
const lines = createInterface({ input: proc.stdout });
let waiting: { re: RegExp; resolve: (ls: string[]) => void } | null = null;
let buffer: string[] = [];
lines.on("line", (l) => {
  buffer.push(l);
  if (waiting?.re.test(l)) {
    const w = waiting;
    waiting = null;
    w.resolve(buffer.splice(0));
  }
});
const send = (cmd: string) => proc.stdin.write(cmd + "\n");
const until = (re: RegExp) => new Promise<string[]>((resolve) => (waiting = { re, resolve }));

async function evaluate(fen: string, depth: number): Promise<EngineEval> {
  send("ucinewgame");
  send(`position fen ${fen}`);
  const done = until(/^bestmove/);
  send(`go depth ${depth}`);
  const out = await done;
  let score: { cp: number | null; mate: number | null } = { cp: 0, mate: null };
  for (const l of out) {
    const m = l.match(/score (cp|mate) (-?\d+)/);
    if (l.startsWith("info") && m && !l.includes("bound")) score = m[1] === "cp" ? { cp: +m[2], mate: null } : { cp: null, mate: +m[2] };
  }
  const best = out.at(-1)!.split(" ")[1];
  return { ...score, best: best === "(none)" ? null : best };
}

const uci = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
let failures = 0;
const fail = (id: string, msg: string) => {
  failures++;
  console.log(`✗ ${id}: ${msg}`);
};

for (const d of OPENING_DRILLS) {
  const chess = new Chess();
  try {
    for (const san of d.moves) {
      const m = chess.move(san);
      if (m.san !== san) throw new Error(`${san} is written ${m.san}`);
    }
    for (const k of Object.keys(d.notes)) if (Number(k) >= d.moves.length) throw new Error(`note ${k} is past the end`);
    console.log(`✓ ${d.id}`);
  } catch (e) {
    fail(d.id, String(e));
  }
}

async function solve(d: PositionDrill): Promise<string> {
  const chess = new Chess(d.fen);
  const played: string[] = [];
  const reply = async () => {
    const e = await evaluate(chess.fen(), DRILL_DEPTH);
    played.push(chess.move(uci(e.best!)).san);
  };
  if (chess.turn() !== d.side) await reply();
  for (let used = 0; used < d.moves; used++) {
    const before = await evaluate(chess.fen(), DRILL_DEPTH);
    const move = chess.move(solutionMove(d, played) ?? uci(before.best!));
    played.push(move.san);
    if (chess.isCheckmate()) {
      if (d.goal === "hold") throw new Error(`mated the opponent in a hold drill: ${played.join(" ")}`);
      return played.join(" ");
    }
    if (chess.isDraw()) {
      if (d.goal === "hold") return played.join(" ");
      throw new Error(`drew: ${played.join(" ")}`);
    }
    const after = await evaluate(chess.fen(), DRILL_DEPTH);
    const verdict = judgeMove(d, before, after, d.moves - used);
    if (!verdict.ok) throw new Error(`engine's own move ${move.san} was rejected (${verdict.reason}) after ${played.join(" ")}`);
    if (d.goal === "promote" && (move.promotion || bareKingWin(chess.board(), d.side))) return played.join(" ");
    if ((d.goal === "win" || d.goal === "hold") && used + 1 === d.moves) return played.join(" ");
    played.push(chess.move(uci(after.best!)).san);
    if (chess.isGameOver()) {
      if (d.goal === "hold" && chess.isDraw()) return played.join(" ");
      throw new Error(`game ended on the opponent's move: ${played.join(" ")}`);
    }
  }
  throw new Error(`goal not reached in ${d.moves} moves: ${played.join(" ")}`);
}

send("uci");
await until(/^uciok/);
for (const d of [...MIDDLEGAME_DRILLS, ...ENDGAME_DRILLS]) {
  try {
    const c = new Chess(d.fen);
    if (!c.isGameOver()) console.log(`✓ ${d.id}: ${await solve(d)}`);
    else fail(d.id, "position is already over");
  } catch (e) {
    fail(d.id, e instanceof Error ? e.message : String(e));
  }
}
proc.kill();
console.log(failures ? `${failures} drill(s) failed` : "All drills OK");
process.exit(failures ? 1 : 0);
