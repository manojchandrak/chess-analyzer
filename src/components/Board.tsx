const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

interface Props {
  fen: string;
  flipped?: boolean;
  lastMove?: { from: string; to: string } | null;
}

/** A static board rendered from a FEN, with the last move highlighted. */
export function Board({ fen, flipped = false, lastMove }: Props) {
  const rows = fen.split(" ")[0].split("/");
  const squares: { name: string; piece: string | null; dark: boolean }[] = [];
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++, f++) squares.push({ name: `${FILES[f]}${8 - r}`, piece: null, dark: (r + f) % 2 === 1 });
      } else {
        squares.push({ name: `${FILES[f]}${8 - r}`, piece: ch, dark: (r + f) % 2 === 1 });
        f++;
      }
    }
  });
  const ordered = flipped ? [...squares].reverse() : squares;

  return (
    <div className="board" role="img" aria-label={`Chess position ${fen}`}>
      {ordered.map((sq, i) => {
        const highlight = lastMove && (sq.name === lastMove.from || sq.name === lastMove.to);
        const showRank = i % 8 === 0;
        const showFile = i >= 56;
        return (
          <div key={sq.name} className={`sq ${sq.dark ? "sq-dark" : "sq-light"}${highlight ? " sq-last" : ""}`}>
            {showRank && <span className="coord coord-rank">{sq.name[1]}</span>}
            {showFile && <span className="coord coord-file">{sq.name[0]}</span>}
            {sq.piece && <span className={`piece ${sq.piece === sq.piece.toUpperCase() ? "piece-w" : "piece-b"}`}>{GLYPH[sq.piece.toLowerCase()]}</span>}
          </div>
        );
      })}
    </div>
  );
}
