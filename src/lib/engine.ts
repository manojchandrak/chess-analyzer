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

function parseScore(line: string): { cp: number | null; mate: number | null } | null {
  const m = line.match(/score (cp|mate) (-?\d+)/);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === "cp" ? { cp: n, mate: null } : { cp: null, mate: n };
}

function startWorker(): { worker: Worker; ready: Promise<void> } {
  const worker = new Worker(SCRIPT());
  const ready = new Promise<void>((resolve) => {
    const onReady = (e: MessageEvent<string>) => {
      if (e.data === "uciok") {
        worker.removeEventListener("message", onReady);
        resolve();
      }
    };
    worker.addEventListener("message", onReady);
    worker.postMessage("uci");
  });
  return { worker, ready };
}

/** Thin wrapper around the Stockfish WASM Web Worker (UCI protocol). One evaluation
 * runs at a time; queue callers serially via `evaluate`. */
export class StockfishEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    ({ worker: this.worker, ready: this.ready } = startWorker());
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  /** Evaluates a FEN position to the given depth, returning the best move and its
   * score from the perspective of the side to move (plus the second-best move's
   * score with `multiPv: 2`). Calls are serialized. */
  evaluate(fen: string, depth: number, opts: { multiPv?: 1 | 2 } = {}): Promise<EngineEval> {
    const multiPv = opts.multiPv ?? 1;
    const run = async (): Promise<EngineEval> => {
      await this.ready;
      this.send("ucinewgame");
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.send(`position fen ${fen}`);

      const lines: ({ cp: number | null; mate: number | null } | null)[] = [null, null];
      return new Promise<EngineEval>((resolve) => {
        const onMessage = (e: MessageEvent<string>) => {
          const line = e.data;
          if (line.startsWith("info") && !line.includes("upperbound") && !line.includes("lowerbound")) {
            const score = parseScore(line);
            const pv = Number(line.match(/multipv (\d+)/)?.[1] ?? 1);
            if (score && pv <= 2) lines[pv - 1] = score;
          }
          if (line.startsWith("bestmove")) {
            this.worker.removeEventListener("message", onMessage);
            const best = line.split(" ")[1];
            // "bestmove (none)": no legal moves (mate or stalemate), keep the reported score
            const top = lines[0] ?? { cp: 0, mate: null };
            resolve({ ...top, best: best && best !== "(none)" ? best : null, second: multiPv > 1 ? lines[1] : null });
          }
        };
        this.worker.addEventListener("message", onMessage);
        this.send(`go depth ${depth}`);
      });
    };

    this.queue = this.queue.then(run, run);
    return this.queue as Promise<EngineEval>;
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export interface LiveInfo {
  fen: string;
  depth: number;
  cp: number | null;
  mate: number | null;
  /** Principal variation in UCI moves. */
  pv: string[];
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
  private depth: number;
  private generation = 0;

  constructor(depth = 22) {
    this.depth = depth;
    ({ worker: this.worker, ready: this.ready } = startWorker());
    this.worker.addEventListener("message", (e: MessageEvent<string>) => this.onLine(e.data));
  }

  onInfo(listener: ((info: LiveInfo) => void) | null): void {
    this.listener = listener;
  }

  async analyze(fen: string): Promise<void> {
    const gen = ++this.generation;
    await this.ready;
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
    this.worker.postMessage(`position fen ${this.current}`);
    this.worker.postMessage(`go depth ${this.depth}`);
  }

  private onLine(line: string): void {
    if (line.startsWith("bestmove")) {
      this.searching = false;
      this.startPending();
      return;
    }
    if (!line.startsWith("info") || !this.current || this.pending || line.includes("bound")) return;
    const score = parseScore(line);
    const depth = Number(line.match(/ depth (\d+)/)?.[1]);
    const pv = line.match(/ pv (.+)$/)?.[1].split(" ") ?? [];
    if (score && Number.isFinite(depth)) this.listener?.({ fen: this.current, depth, ...score, pv });
  }
}

let shared: StockfishEngine | null = null;
let live: LiveEngine | null = null;

/** The page's engine for whole-game analysis, created on first use. */
export function getEngine(): StockfishEngine {
  shared ??= new StockfishEngine();
  return shared;
}

/** The page's live engine (the eval bar), created the first time it's switched on. */
export function getLiveEngine(): LiveEngine {
  live ??= new LiveEngine();
  return live;
}

let drill: StockfishEngine | null = null;

/** A separate engine for drills, so a running review of your games doesn't
 * hold up the opponent's replies. Created the first time a drill needs it. */
export function getDrillEngine(): StockfishEngine {
  drill ??= new StockfishEngine();
  return drill;
}
