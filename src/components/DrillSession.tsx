import { Chess, type Move } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Drill, LineDrill, PositionDrill } from "../lib/drillData";
import { bareKingWin, DRILL_DEPTH, judgeMove, recordResult, solutionMove, type Result } from "../lib/drills";
import { getDrillEngine, type EngineEval } from "../lib/engine";
import { loadOpenings, type OpeningName } from "../lib/openings";
import { openingKey } from "../lib/openingKey";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";

interface Props {
  drill: Drill;
  onBack: () => void;
  onNext: () => void;
  /** Start this drill over (the parent remounts the session). */
  onRetry: () => void;
}

type Tone = "info" | "good" | "bad";
type Phase = "your-move" | "thinking" | "done";

const START_FEN = new Chess().fen();
const REPLY_DELAY = 450;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uciMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sideName = (c: "w" | "b") => (c === "w" ? "White" : "Black");

/** Plays one drill: an opening line from memory, or a position against Stockfish. */
export function DrillSession({ drill, onBack, onNext, onRetry }: Props) {
  const startFen = drill.kind === "position" ? drill.fen : START_FEN;
  const chess = useRef(new Chess(startFen));
  const [fen, setFen] = useState(startFen);
  const [played, setPlayed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // You move first only in a White opening line or a position with your side to move.
  const [phase, setPhase] = useState<Phase>(() => (new Chess(startFen).turn() === drill.side ? (drill.kind === "line" ? "your-move" : "thinking") : "thinking"));
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>({
    tone: "info",
    text: drill.kind === "line" ? `Play the ${sideName(drill.side)} moves of this line from memory.` : drill.prompt,
  });
  const [note, setNote] = useState<string | null>(null);
  const [hint, setHint] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [helped, setHelped] = useState(false);
  const [used, setUsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [opening, setOpening] = useState<OpeningName | null>(null);
  // Engine eval with you to move: grades your move and supplies hints.
  const before = useRef<EngineEval | null>(null);
  // Bumped on restart/unmount so stale engine replies are ignored.
  const session = useRef(0);

  const sync = useCallback((move?: Move) => {
    const c = chess.current;
    setFen(c.fen());
    setPlayed(c.history());
    setLastMove(move ? { from: move.from, to: move.to } : null);
    setSelected(null);
    setHint([]);
  }, []);

  const finish = useCallback((r: Result, text: string, tone: Tone) => {
    setResult(r);
    setPhase("done");
    setMessage({ tone, text });
    recordResult(drill.id, r);
  }, [drill.id]);

  // ---------- Opening lines ----------

  const playLineReply = useCallback(async (d: LineDrill, token: number) => {
    const c = chess.current;
    const i = c.history().length;
    if (i >= d.moves.length) return;
    await wait(REPLY_DELAY);
    if (token !== session.current) return;
    const move = c.move(d.moves[i]);
    sync(move);
    if (d.notes[i]) setNote(d.notes[i]);
    setPhase("your-move");
  }, [sync]);

  // ---------- Positions ----------

  /** Evaluates the position for your turn (for grading and hints). */
  const prepareTurn = useCallback(async (d: PositionDrill, token: number) => {
    const e = await getDrillEngine().evaluate(chess.current.fen(), DRILL_DEPTH);
    if (token !== session.current) return;
    before.current = e;
    setPhase("your-move");
    if (d.moves > 0) setMessage((m) => m ?? { tone: "info", text: d.prompt });
  }, []);

  const opponentMoves = useCallback(async (d: PositionDrill, best: string | null, token: number): Promise<boolean> => {
    const c = chess.current;
    if (!best) return false;
    await wait(REPLY_DELAY);
    if (token !== session.current) return false;
    const move = c.move(uciMove(best));
    sync(move);
    if (c.isCheckmate()) {
      finish("failed", "You got mated. Try again.", "bad");
      return false;
    }
    if (c.isDraw()) {
      if (d.goal === "hold") finish("clean", "Draw! You held the position.", "good");
      else finish("failed", "The game ended in a draw.", "bad");
      return false;
    }
    return true;
  }, [finish, sync]);

  // Kick off the drill: the opponent's first move, or the engine's look at
  // the position before your first move. State starts fresh on each mount.
  useEffect(() => {
    const ref = session;
    const token = ++ref.current;
    void (async () => {
      if (drill.kind === "line") {
        if (drill.side === "b") await playLineReply(drill, token);
        return;
      }
      if (chess.current.turn() !== drill.side) {
        const e = await getDrillEngine().evaluate(chess.current.fen(), DRILL_DEPTH);
        if (token !== ref.current) return;
        if (!(await opponentMoves(drill, e.best ?? null, token))) return;
      }
      await prepareTurn(drill, token);
    })();
    return () => {
      ref.current++;
    };
  }, [drill, opponentMoves, playLineReply, prepareTurn]);

  // Name the opening as the line is played.
  useEffect(() => {
    if (drill.kind !== "line") return;
    let live = true;
    void loadOpenings().then((db) => {
      if (!live) return;
      const replay = new Chess();
      let name: OpeningName | null = null;
      for (const san of played) {
        replay.move(san);
        name = db.get(openingKey(replay.fen())) ?? name;
      }
      setOpening(name);
    });
    return () => {
      live = false;
    };
  }, [drill.kind, played]);

  const reject = useCallback((text: string) => {
    setMistakes((n) => n + 1);
    setMessage({ tone: "bad", text });
    setPhase("your-move");
  }, []);

  /** Applies your move (already legal). `shown` = played by "Show move". */
  const tryMove = useCallback(async (from: string, to: string, promotion: string | undefined, shown: boolean) => {
    const c = chess.current;
    const token = session.current;
    setSelected(null);
    const move = c.move({ from, to, promotion });

    if (drill.kind === "line") {
      const i = c.history().length - 1;
      if (move.san !== drill.moves[i]) {
        c.undo();
        sync(lastMoveOf(c));
        reject(`${move.san} isn't the move in this line. ${mistakes >= 1 ? "Try the hint if you're stuck." : "Try again."}`);
        return;
      }
      sync(move);
      setNote(drill.notes[i] ?? null);
      const complete = () => {
        const r: Result = helped || shown || mistakes > 0 ? "solved" : "clean";
        finish(r, r === "clean" ? "Line complete, no mistakes!" : "Line complete. Run it again to lock it in.", "good");
      };
      if (i + 1 >= drill.moves.length) return complete();
      setMessage({ tone: "good", text: `${move.san} ✓` });
      setPhase("thinking");
      await playLineReply(drill, token);
      if (token === session.current && c.history().length >= drill.moves.length) complete();
      return;
    }

    // Position drill: judge the move with the engine.
    const left = drill.moves - used;
    const clean = !helped && !shown && mistakes === 0;
    const succeed = (text: string) => finish(clean ? "clean" : "solved", text, "good");
    if (c.isCheckmate()) {
      sync(move);
      if (drill.goal === "hold") finish("clean", "Checkmate! Even better than a draw.", "good");
      else succeed("Checkmate!");
      return;
    }
    if (c.isDraw()) {
      if (drill.goal === "hold") {
        sync(move);
        succeed("Draw! You held the position.");
      } else {
        const stalemate = c.isStalemate();
        c.undo();
        sync(lastMoveOf(c));
        reject(`${move.san} ${stalemate ? "is stalemate" : "draws the game"}, throwing the win away!`);
      }
      return;
    }
    sync(move);
    setPhase("thinking");
    setMessage({ tone: "info", text: "Checking your move…" });
    const after = await getDrillEngine().evaluate(c.fen(), DRILL_DEPTH);
    if (token !== session.current) return;
    const verdict = shown || !before.current ? { ok: true as const } : judgeMove(drill, before.current, after, left);
    if (!verdict.ok) {
      c.undo();
      sync(lastMoveOf(c));
      reject(`${move.san}: ${verdict.reason}`);
      return;
    }
    const nowUsed = used + 1;
    setUsed(nowUsed);
    if (drill.goal === "promote" && (move.promotion || bareKingWin(c.board(), drill.side))) {
      succeed(move.promotion ? "Promoted!" : "All the defender's pieces are gone. Won!");
      return;
    }
    if ((drill.goal === "win" || drill.goal === "hold") && nowUsed >= drill.moves) {
      succeed(drill.goal === "win" ? "Solved!" : "You held it!");
      return;
    }
    if (nowUsed >= drill.moves) {
      finish("failed", drill.goal === "mate" ? "Out of moves before mate." : "Out of moves.", "bad");
      return;
    }
    setMessage({ tone: "good", text: `${move.san} ✓` });
    if (await opponentMoves(drill, after.best ?? null, token)) {
      setPhase("thinking");
      await prepareTurn(drill, token);
    }
  }, [drill, finish, helped, mistakes, opponentMoves, playLineReply, prepareTurn, reject, sync, used]);

  /** The move a hint points to. */
  function hintMove(): { from: string; to: string; promotion?: string } | null {
    const c = chess.current;
    if (drill.kind === "line") {
      const san = drill.moves[c.history().length];
      if (!san) return null;
      const m = new Chess(c.fen()).move(san);
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    const sol = solutionMove(drill, played);
    if (sol) {
      const m = new Chess(c.fen()).move(sol);
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    return before.current?.best ? uciMove(before.current.best) : null;
  }

  function showHint() {
    const m = hintMove();
    if (!m) return;
    setHelped(true);
    setHint([m.from]);
    setMessage({ tone: "info", text: "Hint: move the highlighted piece." });
  }

  function showMove() {
    const m = hintMove();
    if (!m) return;
    setHelped(true);
    void tryMove(m.from, m.to, m.promotion, true);
  }

  function giveUp() {
    session.current++;
    finish("failed", "Here's the idea — try it again later.", "bad");
  }

  function onSquareClick(sq: string) {
    if (phase !== "your-move") return;
    const c = chess.current;
    const piece = c.get(sq as Parameters<typeof c.get>[0]);
    if (selected) {
      const legal = c.moves({ square: selected as Parameters<typeof c.get>[0], verbose: true }).filter((m) => m.to === sq);
      if (legal.length) {
        // Promote to a queen (drills don't need underpromotion).
        const m = legal.find((x) => !x.promotion || x.promotion === "q") ?? legal[0];
        void tryMove(m.from, m.to, m.promotion, false);
        return;
      }
    }
    if (piece && piece.color === c.turn() && piece.color === drill.side) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  }

  const view = new Chess(fen);
  const targets = selected ? view.moves({ square: selected as Parameters<typeof view.get>[0], verbose: true }).map((m) => m.to) : [];
  const flipped = drill.side === "b";
  const pairs: { no: number; w?: string; b?: string }[] = [];
  const startBlack = drill.kind === "position" && new Chess(drill.fen).turn() === "b";
  const firstNo = drill.kind === "position" ? Number(drill.fen.split(" ")[5] ?? 1) : 1;
  played.forEach((san, i) => {
    const ply = i + (startBlack ? 1 : 0);
    const no = firstNo + Math.floor(ply / 2);
    if (ply % 2 === 0) pairs.push({ no, w: san });
    else if (pairs.length && pairs[pairs.length - 1].no === no) pairs[pairs.length - 1].b = san;
    else pairs.push({ no, b: san });
  });
  const total = drill.kind === "line" ? drill.moves.filter((_, i) => (i % 2 === 0) === (drill.side === "w")).length : drill.moves;
  const done = drill.kind === "line" ? played.filter((_, i) => (i % 2 === 0) === (drill.side === "w")).length : used;

  return (
    <section className="viewer drill-session">
      <div className="viewer-head">
        <div>
          <button className="btn btn-ghost" onClick={onBack}>
            ← All drills
          </button>
        </div>
        <div>
          <p className="eyebrow">
            {drill.phase} · {drill.theme}
          </p>
          <h2 className="drill-title">{drill.title}</h2>
          <p className="muted small">You play {sideName(drill.side)}.</p>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-board">
          <div className="board-wrap">
            <Board fen={fen} flipped={flipped} lastMove={lastMove} onSquareClick={onSquareClick} selected={selected} targets={targets} hints={hint} />
          </div>
          <BoardSettings />
        </div>

        <div className="viewer-moves">
          {message && (
            <div className={`drill-message drill-${message.tone}`} aria-live="polite">
              {phase === "thinking" && <span className="drill-spinner" aria-hidden />}
              {message.text}
            </div>
          )}
          <div className="drill-meter">
            <span className="muted small">
              {drill.kind === "line" ? "Moves" : drill.goal === "mate" || drill.goal === "promote" ? "Moves used" : "Moves"}: {done} / {total}
            </span>
            <span className="muted small">
              {mistakes > 0 && `${mistakes} miss${mistakes > 1 ? "es" : ""}`}
              {helped && `${mistakes > 0 ? " · " : ""}hint used`}
            </span>
          </div>
          {drill.kind === "line" && (
            <div className="opening-line">
              {opening ? (
                <>
                  <span className="eco">{opening.eco}</span> {opening.name}
                </>
              ) : (
                <span className="muted">Starting position</span>
              )}
            </div>
          )}
          {note && <p className="drill-note">{note}</p>}
          {phase === "done" && drill.kind === "position" && (
            <div className="drill-note">
              <strong>The idea: </strong>
              {drill.lesson}
            </div>
          )}

          <div className="move-list drill-moves">
            {pairs.length === 0 && <p className="muted small drill-empty">No moves yet.</p>}
            {pairs.map((p) => (
              <div className="move-row" key={p.no}>
                <span className="move-no">{p.no}.</span>
                <span className="mv">{p.w ?? "…"}</span>
                <span className="mv">{p.b ?? ""}</span>
              </div>
            ))}
          </div>

          <div className="viewer-actions drill-actions">
            {phase !== "done" ? (
              <>
                <button className="btn btn-ghost" onClick={showHint} disabled={phase !== "your-move"}>
                  Hint
                </button>
                <button className="btn btn-ghost" onClick={showMove} disabled={phase !== "your-move"}>
                  Show move
                </button>
                <button className="btn btn-ghost" onClick={giveUp} disabled={played.length === 0 && phase === "thinking"}>
                  Give up
                </button>
              </>
            ) : (
              <>
                <span className={`drill-result drill-result-${result}`}>{result === "clean" ? "★ Clean solve" : result === "solved" ? "Solved with help" : "Not solved"}</span>
                <button className="btn btn-ghost" onClick={onRetry}>
                  Try again
                </button>
                <button className="btn btn-primary" onClick={onNext}>
                  Next drill →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The last move on a board, for highlighting after a take-back. */
function lastMoveOf(c: Chess): Move | undefined {
  const h = c.history({ verbose: true });
  return h[h.length - 1];
}
