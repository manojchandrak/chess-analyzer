export interface EngineEval {
  /** Centipawn score from the side-to-move's perspective, or null if `mate` is set. */
  cp: number | null;
  /** Mate in N (positive: side to move mates, negative: side to move gets mated), or null. */
  mate: number | null;
  /** Engine's best move in UCI notation ("e2e4"), when known. */
  best?: string | null;
  /** Score of the second-best move (MultiPV 2), when requested and available. */
  second?: { cp: number | null; mate: number | null } | null;
}

const SCRIPT = () => `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

/** How long the engine gets to start, and to finish one position, before we give up on it. */
const READY_TIMEOUT_MS = 20_000;
const EVAL_TIMEOUT_MS = 90_000;

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export function parseScore(line: string): { cp: number | null; mate: number | null } | null {
  const m = line.match(/score (cp|mate) (-?\d+)/);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === "cp" ? { cp: n, mate: null } : { cp: null, mate: n };
}

/** Starts a Stockfish worker. `ready` rejects (instead of hanging forever) if the
 * script or WASM fails to load, or the engine doesn't answer in time. */
function startWorker(): { worker: Worker; ready: Promise<void> } {
  const worker = new Worker(SCRIPT());
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new EngineError("Stockfish didn't start in time.")), READY_TIMEOUT_MS);
    const onReady = (e: MessageEvent<string>) => {
      if (e.data === "uciok") done();
    };
    const onError = () => done(new EngineError("Stockfish failed to load. Check your connection and try again."));
    function done(err?: Error) {
      clearTimeout(timer);
      worker.removeEventListener("message", onReady);
      worker.removeEventListener("error", onError);
      if (err) reject(err);
      else resolve();
    }
    worker.addEventListener("message", onReady);
    worker.addEventListener("error", onError);
    worker.postMessage("uci");
  });
  ready.catch(() => {}); // callers handle it; avoid an unhandled-rejection warning for unused workers
  return { worker, ready };
}

interface Job {
  fen: string;
  depth: number;
  multiPv: 1 | 2;
  resolve: (e: EngineEval) => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  ready: Promise<void>;
  multiPv: number;
  busy: boolean;
  /** Needs `ucinewgame` before its next position (set when a new game starts). */
  fresh: boolean;
}

/** Number of engine workers to run side by side: leave a core for the page itself. */
export function defaultPoolSize(): number {
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 2) : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

/** A small pool of Stockfish WASM Web Workers (UCI protocol). Positions are
 * independent, so a game's evaluations run in parallel across the workers.
 * Every evaluation has a timeout, and a crashed or stuck worker is replaced, so
 * one failure rejects that call instead of blocking the queue forever. */
export class StockfishEngine {
  private slots: Slot[] = [];
  private jobs: Job[] = [];
  private readonly size: number;
  private terminated = false;

  constructor(size = defaultPoolSize()) {
    this.size = size;
  }

  /** Number of positions that can be evaluated at the same time. */
  get parallelism(): number {
    return this.size;
  }

  /** Call at the start of each game: clears each worker's search state before its
   * next position. Within a game the hash table is kept, so related positions search faster. */
  newGame(): void {
    for (const s of this.slots) s.fresh = true;
  }

  private spawn(): Slot {
    const { worker, ready } = startWorker();
    const slot: Slot = { worker, ready, multiPv: 1, busy: false, fresh: true };
    this.slots.push(slot);
    return slot;
  }

  private replace(slot: Slot): void {
    slot.worker.terminate();
    this.slots = this.slots.filter((s) => s !== slot);
  }

  /** Evaluates a FEN position to the given depth, returning the best move and its
   * score from the perspective of the side to move (plus the second-best move's
   * score with `multiPv: 2`). Rejects with an EngineError if Stockfish fails. */
  evaluate(fen: string, depth: number, opts: { multiPv?: 1 | 2 } = {}): Promise<EngineEval> {
    if (this.terminated) return Promise.reject(new EngineError("The engine was shut down."));
    return new Promise<EngineEval>((resolve, reject) => {
      this.jobs.push({ fen, depth, multiPv: opts.multiPv ?? 1, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.jobs.length > 0) {
      let slot = this.slots.find((s) => !s.busy);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const job = this.jobs.shift() as Job;
      slot.busy = true;
      void this.run(slot, job);
    }
  }

  private async run(slot: Slot, job: Job): Promise<void> {
    const finish = (settle: () => void, healthy: boolean) => {
      if (healthy) slot.busy = false;
      else this.replace(slot);
      settle();
      this.pump();
    };
    try {
      await slot.ready;
    } catch (e) {
      finish(() => job.reject(e instanceof Error ? e : new EngineError(String(e))), false);
      return;
    }

    const { worker } = slot;
    if (slot.fresh) {
      worker.postMessage("ucinewgame");
      slot.fresh = false;
    }
    if (slot.multiPv !== job.multiPv) {
      worker.postMessage(`setoption name MultiPV value ${job.multiPv}`);
      slot.multiPv = job.multiPv;
    }
    worker.postMessage(`position fen ${job.fen}`);

    const lines: ({ cp: number | null; mate: number | null } | null)[] = [null, null];
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (e: MessageEvent<string>) => {
      const line = e.data;
      if (typeof line !== "string") return;
      if (line.startsWith("info") && !line.includes("upperbound") && !line.includes("lowerbound")) {
        const score = parseScore(line);
        const pv = Number(line.match(/multipv (\d+)/)?.[1] ?? 1);
        if (score && pv <= 2) lines[pv - 1] = score;
      }
      if (line.startsWith("bestmove")) {
        cleanup();
        const best = line.split(" ")[1];
        // "bestmove (none)": no legal moves (mate or stalemate), keep the reported score
        const top = lines[0] ?? { cp: 0, mate: null };
        finish(() => job.resolve({ ...top, best: best && best !== "(none)" ? best : null, second: job.multiPv > 1 ? lines[1] : null }), true);
      }
    };
    const onError = () => {
      cleanup();
      finish(() => job.reject(new EngineError("Stockfish stopped unexpectedly.")), false);
    };
    timer = setTimeout(() => {
      cleanup();
      finish(() => job.reject(new EngineError("Stockfish took too long on one position.")), false);
    }, EVAL_TIMEOUT_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(`go depth ${job.depth}`);
  }

  terminate(): void {
    this.terminated = true;
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
    for (const j of this.jobs.splice(0)) j.reject(new EngineError("The engine was shut down."));
  }
}

export interface LiveLine {
  cp: number | null;
  mate: number | null;
  /** Principal variation in UCI moves. */
  pv: string[];
}

export interface LiveInfo {
  fen: string;
  depth: number;
  cp: number | null;
  mate: number | null;
  /** Principal variation of the best line in UCI moves. */
  pv: string[];
  /** The top lines (best first) when several are being analyzed. */
  lines: LiveLine[];
}

/** A second engine that analyzes whatever position is on screen and streams its
 * evaluation as the search deepens. Setting a new position stops the old search. */
export class LiveEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private searching = false;
  private pending: string | null = null;
  private current: string | null = null;
  private listener: ((info: LiveInfo) => void) | null = null;
  private errorListener: ((err: Error) => void) | null = null;
  private depth: number;
  private lineCount: number;
  private generation = 0;
  private lines: (LiveLine | null)[] = [];

  constructor(depth = 22, lines = 3) {
    this.depth = depth;
    this.lineCount = lines;
    ({ worker: this.worker, ready: this.ready } = startWorker());
    this.worker.addEventListener("message", (e: MessageEvent<string>) => this.onLine(e.data));
    this.ready.then(
      () => this.worker.postMessage(`setoption name MultiPV value ${this.lineCount}`),
      (err) => this.errorListener?.(err),
    );
  }

  onInfo(listener: ((info: LiveInfo) => void) | null): void {
    this.listener = listener;
  }

  onError(listener: ((err: Error) => void) | null): void {
    this.errorListener = listener;
  }

  async analyze(fen: string): Promise<void> {
    const gen = ++this.generation;
    try {
      await this.ready;
    } catch (e) {
      this.errorListener?.(e instanceof Error ? e : new EngineError(String(e)));
      return;
    }
    if (gen !== this.generation) return; // superseded or stopped while the engine loaded
    this.pending = fen;
    if (this.searching) this.worker.postMessage("stop");
    else this.startPending();
  }

  stop(): void {
    this.generation++;
    this.pending = null;
    if (this.searching) this.worker.postMessage("stop");
  }

  private startPending(): void {
    if (!this.pending) return;
    this.current = this.pending;
    this.pending = null;
    this.searching = true;
    this.lines = [];
    this.worker.postMessage(`position fen ${this.current}`);
    this.worker.postMessage(`go depth ${this.depth}`);
  }

  private onLine(line: string): void {
    if (typeof line !== "string") return;
    if (line.startsWith("bestmove")) {
      this.searching = false;
      this.startPending();
      return;
    }
    if (!line.startsWith("info") || !this.current || this.pending || line.includes("bound")) return;
    const score = parseScore(line);
    const depth = Number(line.match(/ depth (\d+)/)?.[1]);
    const pv = line.match(/ pv (.+)$/)?.[1].split(" ") ?? [];
    if (!score || !Number.isFinite(depth)) return;
    const index = Number(line.match(/multipv (\d+)/)?.[1] ?? 1) - 1;
    this.lines[index] = { ...score, pv };
    const best = this.lines[0];
    if (!best) return;
    this.listener?.({ fen: this.current, depth, cp: best.cp, mate: best.mate, pv: best.pv, lines: this.lines.filter((l): l is LiveLine => !!l) });
  }

  terminate(): void {
    this.worker.terminate();
  }
}

let shared: StockfishEngine | null = null;
let live: LiveEngine | null = null;

/** The page's engine for whole-game analysis, created on first use. */
export function getEngine(): StockfishEngine {
  shared ??= new StockfishEngine();
  return shared;
}

/** The page's live engine (the eval bar), created the first time it's switched on.
 * Pass `fresh` to replace one that failed to load. */
export function getLiveEngine(fresh = false): LiveEngine {
  if (fresh && live) {
    live.terminate();
    live = null;
  }
  live ??= new LiveEngine();
  return live;
}
