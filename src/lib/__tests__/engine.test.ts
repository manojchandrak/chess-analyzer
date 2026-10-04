import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineError, parseScore, StockfishEngine } from "../engine";

type Handler = (e: { data: unknown }) => void;

/** A stand-in for the Stockfish worker that answers the UCI commands the engine sends. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static mode: "ok" | "load-error" | "silent" | "crash-on-go" = "ok";
  handlers = new Map<string, Set<Handler>>();
  sent: string[] = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
    if (FakeWorker.mode === "load-error") queueMicrotask(() => this.emit("error", {}));
  }
  addEventListener(type: string, h: Handler) {
    (this.handlers.get(type) ?? this.handlers.set(type, new Set()).get(type)!).add(h);
  }
  removeEventListener(type: string, h: Handler) {
    this.handlers.get(type)?.delete(h);
  }
  emit(type: string, data: unknown) {
    for (const h of [...(this.handlers.get(type) ?? [])]) h({ data });
  }
  postMessage(cmd: string) {
    this.sent.push(cmd);
    if (FakeWorker.mode === "silent") return;
    if (cmd === "uci") queueMicrotask(() => this.emit("message", "uciok"));
    if (cmd.startsWith("go")) {
      if (FakeWorker.mode === "crash-on-go") return void queueMicrotask(() => this.emit("error", {}));
      queueMicrotask(() => {
        this.emit("message", "info depth 10 multipv 1 score cp 34 pv e2e4 e7e5");
        this.emit("message", "info depth 10 multipv 2 score cp -12 pv d2d4 d7d5");
        this.emit("message", "info depth 10 multipv 3 score cp -40 pv g1f3");
        this.emit("message", "bestmove e2e4 ponder e7e5");
      });
    }
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.mode = "ok";
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
});
afterEach(() => {
  delete (globalThis as unknown as { Worker?: unknown }).Worker;
});

describe("parseScore", () => {
  it("reads centipawn and mate scores", () => {
    expect(parseScore("info depth 5 score cp -23 pv e2e4")).toEqual({ cp: -23, mate: null });
    expect(parseScore("info depth 9 score mate 3 pv d1h5")).toEqual({ cp: null, mate: 3 });
    expect(parseScore("info string hello")).toBeNull();
  });
});

describe("StockfishEngine", () => {
  it("returns the best move and score, and the second line with MultiPV 2", async () => {
    const engine = new StockfishEngine(1);
    const e = await engine.evaluate("startpos-fen", 10, { multiPv: 2 });
    expect(e).toMatchObject({ cp: 34, mate: null, best: "e2e4", second: { cp: -12, mate: null } });
    expect(e.alternatives).toEqual([
      { uci: "e2e4", cp: 34, mate: null },
      { uci: "d2d4", cp: -12, mate: null },
    ]);
    expect(FakeWorker.instances[0].sent).toContain("setoption name MultiPV value 2");
    engine.terminate();
  });

  it("returns up to three candidate moves with MultiPV 3, and one without it", async () => {
    const engine = new StockfishEngine(1);
    const three = await engine.evaluate("a", 10, { multiPv: 3 });
    expect(three.alternatives?.map((a) => a.uci)).toEqual(["e2e4", "d2d4", "g1f3"]);
    expect(FakeWorker.instances[0].sent).toContain("setoption name MultiPV value 3");
    const one = await engine.evaluate("b", 10);
    expect(one.alternatives?.map((a) => a.uci)).toEqual(["e2e4"]);
    expect(one.second).toBeNull();
    engine.terminate();
  });

  it("runs positions in parallel across the pool but never exceeds its size", async () => {
    const engine = new StockfishEngine(2);
    await Promise.all(Array.from({ length: 6 }, (_, i) => engine.evaluate(`fen ${i}`, 8)));
    expect(FakeWorker.instances).toHaveLength(2);
    engine.terminate();
  });

  it("sends ucinewgame once per game, not before every position", async () => {
    const engine = new StockfishEngine(1);
    engine.newGame();
    await engine.evaluate("a", 8);
    await engine.evaluate("b", 8);
    await engine.evaluate("c", 8);
    expect(FakeWorker.instances[0].sent.filter((c) => c === "ucinewgame")).toHaveLength(1);
    engine.newGame();
    await engine.evaluate("d", 8);
    expect(FakeWorker.instances[0].sent.filter((c) => c === "ucinewgame")).toHaveLength(2);
    engine.terminate();
  });

  it("rejects with an EngineError, instead of hanging, when the worker fails to load", async () => {
    FakeWorker.mode = "load-error";
    const engine = new StockfishEngine(1);
    await expect(engine.evaluate("x", 8)).rejects.toBeInstanceOf(EngineError);
    engine.terminate();
  });

  it("replaces a crashed worker so later positions still work", async () => {
    FakeWorker.mode = "crash-on-go";
    const engine = new StockfishEngine(1);
    await expect(engine.evaluate("x", 8)).rejects.toThrow(/stopped unexpectedly/);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    FakeWorker.mode = "ok";
    await expect(engine.evaluate("y", 8)).resolves.toMatchObject({ best: "e2e4" });
    expect(FakeWorker.instances).toHaveLength(2);
    engine.terminate();
  });

  it("rejects queued work once terminated", async () => {
    const engine = new StockfishEngine(1);
    engine.terminate();
    await expect(engine.evaluate("x", 8)).rejects.toBeInstanceOf(EngineError);
  });
});
