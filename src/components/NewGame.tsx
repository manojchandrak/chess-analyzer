/** Start a game against Stockfish from the standard starting position, as White or Black. */
export function NewGame({ onStart }: { onStart: (mode: "w" | "b") => void }) {
  return (
    <div className="card new-game">
      <div>
        <h3>Play a game</h3>
        <p className="muted small">Play against Stockfish right here (Beginner, Club or Strong), take moves back, and download the game as a PGN to analyze.</p>
      </div>
      <div className="new-game-actions">
        <button className="btn btn-primary" onClick={() => onStart("w")}>
          Play as White
        </button>
        <button className="btn btn-ghost" onClick={() => onStart("b")}>
          Play as Black
        </button>
      </div>
    </div>
  );
}
