import { useState, type FormEvent } from "react";
import { fenProblem } from "../lib/explore";

/** Paste a position (FEN) to play on from it, with or without a game. */
export function FenInput({ onStart }: { onStart: (fen: string) => void }) {
  const [fen, setFen] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = fenProblem(fen);
    setError(problem);
    if (!problem) onStart(fen.trim());
  }

  return (
    <form className="fen-form" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="fen-input">
        Position as FEN
      </label>
      <input id="fen-input" value={fen} onChange={(e) => setFen(e.target.value)} placeholder="Paste a FEN, e.g. 8/8/8/4k3/8/8/4P3/4K3 w - - 0 1" autoComplete="off" spellCheck={false} />
      <button className="btn btn-primary" disabled={!fen.trim()}>
        Play from this position
      </button>
      {error && <p className="error-message fen-error">{error}</p>}
    </form>
  );
}
