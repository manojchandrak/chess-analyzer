import { useEffect, useRef, useState } from "react";
import { getLiveEngine, type LiveInfo } from "../lib/engine";

/** Streams the live engine's evaluation of `fen` while `enabled`. The engine reports
 * many times a second, so the state updates at most every 200 ms. If Stockfish fails
 * to load, `error` says so and `retry` starts a fresh engine. */
export function useLiveEval(enabled: boolean, fen: string) {
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needFresh = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const engine = getLiveEngine(needFresh.current);
    needFresh.current = false;
    let latest: LiveInfo | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    engine.onInfo((info) => {
      latest = info;
      timer ??= setTimeout(() => {
        timer = null;
        setLive(latest);
      }, 200);
    });
    engine.onError((err) => setError(err.message));
    void engine.analyze(fen);
    return () => {
      if (timer) clearTimeout(timer);
      engine.onInfo(null);
      engine.onError(null);
      engine.stop();
    };
  }, [enabled, fen, attempt]);

  const retry = () => {
    needFresh.current = true;
    setError(null);
    setAttempt((a) => a + 1);
  };

  return { live, error: enabled ? error : null, retry };
}
