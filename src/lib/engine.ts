export interface EngineEval {
  /** Centipawn score from the side-to-move's perspective, or null if `mate` is set. */
  cp: number | null;
  /** Mate in N (positive: side to move mates, negative: side to move gets mated), or null. */
  mate: number | null;
}

/** Thin wrapper around the Stockfish WASM Web Worker (UCI protocol). One evaluation
 * runs at a time; queue callers serially via `evaluate`. */
export class StockfishEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl);
    this.ready = new Promise((resolve) => {
      const onReady = (e: MessageEvent<string>) => {
        if (e.data === "uciok") {
          this.worker.removeEventListener("message", onReady);
          resolve();
        }
      };
      this.worker.addEventListener("message", onReady);
      this.worker.postMessage("uci");
    });
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  /** Evaluates a FEN position to the given depth, returning the best move's score
   * from the perspective of the side to move. Calls are serialized. */
  evaluate(fen: string, depth: number): Promise<EngineEval> {
    const run = async (): Promise<EngineEval> => {
      await this.ready;
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);

      let best: EngineEval = { cp: null, mate: null };

      const result = await new Promise<EngineEval>((resolve) => {
        const onMessage = (e: MessageEvent<string>) => {
          const line = e.data;
          const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
          if (scoreMatch) {
            const [, kind, value] = scoreMatch;
            const n = Number(value);
            best = kind === "cp" ? { cp: n, mate: null } : { cp: null, mate: n };
          }
          if (line.startsWith("bestmove")) {
            this.worker.removeEventListener("message", onMessage);
            resolve(best);
          }
        };
        this.worker.addEventListener("message", onMessage);
        this.send(`go depth ${depth}`);
      });

      return result;
    };

    this.queue = this.queue.then(run, run);
    return this.queue as Promise<EngineEval>;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
