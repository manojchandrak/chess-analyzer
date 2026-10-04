import type { AltMove, MoveAnalysis } from "../lib/analyze";
import { evalText } from "../lib/commentary";

interface Props {
  move: MoveAnalysis;
  /** True when the board is showing the position before this move. */
  showingBefore: boolean;
  onToggleBefore: () => void;
  /** Continue from the position before the move, starting with this alternative. */
  onPlay: (alt: AltMove) => void;
  /** The analysis came from Stockfish (alternatives are only available then). */
  fromStockfish: boolean;
}

/** The engine's top choices in the position where the move was played, with their evaluations. */
export function Alternatives({ move, showingBefore, onToggleBefore, onPlay, fromStockfish }: Props) {
  const who = move.color === "w" ? "White" : "Black";
  if (move.alternatives.length === 0) {
    return (
      <div className="alternatives card">
        <p className="muted small">{fromStockfish ? "The engine found no alternatives for this move." : "Run the Stockfish review to see which other moves were possible here."}</p>
      </div>
    );
  }
  const bestEval = move.alternatives[0].evalWhite * (move.color === "w" ? 1 : -1);
  return (
    <div className="alternatives card">
      <div className="alt-head">
        <strong>What else could {who} play?</strong>
        <button className={`btn btn-ghost${showingBefore ? " btn-on" : ""}`} onClick={onToggleBefore} aria-pressed={showingBefore}>
          {showingBefore ? "Back to the position after the move" : "Show the position before the move"}
        </button>
      </div>
      <ol className="alt-list">
        {move.alternatives.map((a, i) => {
          const loss = Math.round(bestEval - a.evalWhite * (move.color === "w" ? 1 : -1));
          return (
            <li key={a.uci} className={a.played ? "alt-played" : undefined}>
              <span className="alt-rank">{i + 1}</span>
              <strong className="alt-san">{a.san}</strong>
              <span className="alt-eval">{evalText(a.evalWhite)}</span>
              <span className="muted small alt-note">{a.played ? "played in the game" : i === 0 ? "engine's first choice" : loss > 0 ? `${(loss / 100).toFixed(1)} pawns behind the best` : "just as good"}</span>
              {!a.played && (
                <button className="btn btn-ghost engine-play" onClick={() => onPlay(a)} title={`Play ${a.san} instead and continue from there`} aria-label={`Play ${a.san} instead and continue from there`}>
                  ▶
                </button>
              )}
            </li>
          );
        })}
        {!move.alternatives.some((a) => a.played) && (
          <li className="alt-played">
            <span className="alt-rank">·</span>
            <strong className="alt-san">{move.san}</strong>
            <span className="alt-eval">{evalText(move.evalAfterWhite)}</span>
            <span className="muted small alt-note">played in the game</span>
          </li>
        )}
      </ol>
    </div>
  );
}
