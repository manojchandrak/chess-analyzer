import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { themeOf, useBoardPrefs } from "../lib/boardPrefs";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const FILES = "abcdefgh";
const preloaded = new Set<string>();

/** Loads all 12 pieces of a set up front so pieces don't flash in as they move. */
function preload(set: string) {
  if (set === "unicode" || preloaded.has(set)) return;
  preloaded.add(set);
  for (const c of "wb") for (const p of "KQRBNP") new Image().src = `${import.meta.env.BASE_URL}pieces/${set}/${c}${p}.svg`;
}

interface Props {
  fen: string;
  flipped?: boolean;
  lastMove?: { from: string; to: string } | null;
  /** Classification badge drawn on a square (the last move's destination). */
  badge?: { square: string; symbol: string; color: string; label: string } | null;
  /** Makes the board playable: called with the square that was clicked or
   * tapped. Dragging a piece calls it with the start square, then the drop square. */
  onSquareClick?: (square: string) => void;
  /** The square of the piece picked up for a move. */
  selected?: string | null;
  /** Squares the picked-up piece can move to. */
  targets?: string[];
  /** Squares to draw attention to (a hint). */
  hints?: string[];
}

/** A board rendered from a FEN, with the last move highlighted, drawn in the
 * viewer's chosen piece set and board colors. Static unless `onSquareClick` is set. */
export function Board({ fen, flipped = false, lastMove, badge, onSquareClick, selected, targets, hints }: Props) {
  const { pieces, theme } = useBoardPrefs();
  const boardRef = useRef<HTMLDivElement>(null);
  // A piece being dragged: where it came from and the pointer's position on the board.
  const [drag, setDrag] = useState<{ from: string; piece: string; x: number; y: number; moved: boolean; wasSelected: boolean } | null>(null);
  useEffect(() => preload(pieces), [pieces]);
  const colors = themeOf(theme);
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

  const pointAt = (e: PointerEvent) => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, size: r.width };
  };
  const squareAt = (x: number, y: number, size: number): string | null => {
    const col = Math.floor((x / size) * 8);
    const row = Math.floor((y / size) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return ordered[row * 8 + col].name;
  };

  function onPointerDown(e: PointerEvent) {
    if (!onSquareClick || e.button !== 0) return;
    const { x, y, size } = pointAt(e);
    const name = squareAt(x, y, size);
    if (!name) return;
    // Pressing the selected piece again only deselects it if it isn't dragged.
    if (name !== selected) onSquareClick(name);
    const piece = squares.find((q) => q.name === name)?.piece;
    if (piece) {
      boardRef.current!.setPointerCapture(e.pointerId);
      setDrag({ from: name, piece, x, y, moved: false, wasSelected: name === selected });
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const { x, y } = pointAt(e);
    const moved = drag.moved || Math.hypot(x - drag.x, y - drag.y) > 4;
    setDrag({ ...drag, x, y, moved });
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || !onSquareClick) return;
    setDrag(null);
    if (!drag.moved) {
      if (drag.wasSelected) onSquareClick(drag.from);
      return;
    }
    const { x, y, size } = pointAt(e);
    const to = squareAt(x, y, size);
    // Dropping back on the start square keeps the piece selected, like a click.
    if (to && to !== drag.from) onSquareClick(to);
  }

  const pieceImage = (piece: string, className: string, style?: CSSProperties) => {
    const white = piece === piece.toUpperCase();
    const kind = piece.toLowerCase();
    return pieces === "unicode" ? (
      <span className={`piece ${white ? "piece-w" : "piece-b"} ${className}`} style={style}>
        {GLYPH[kind]}
      </span>
    ) : (
      <img className={`piece-img ${className}`} style={style} src={`${import.meta.env.BASE_URL}pieces/${pieces}/${white ? "w" : "b"}${kind.toUpperCase()}.svg`} alt={`${white ? "white" : "black"} ${NAME[kind]}`} draggable={false} />
    );
  };

  return (
    <div
      ref={boardRef}
      className={`board${onSquareClick ? " board-play" : ""}`}
      role={onSquareClick ? "grid" : "img"}
      aria-label={`Chess position ${fen}`}
      style={{ "--sq-light": colors.light, "--sq-dark": colors.dark } as CSSProperties}
      onPointerDown={onSquareClick ? onPointerDown : undefined}
      onPointerMove={onSquareClick ? onPointerMove : undefined}
      onPointerUp={onSquareClick ? onPointerUp : undefined}
      onPointerCancel={onSquareClick ? () => setDrag(null) : undefined}
    >
      {ordered.map((sq, i) => {
        const highlight = lastMove && (sq.name === lastMove.from || sq.name === lastMove.to);
        const white = sq.piece !== null && sq.piece === sq.piece.toUpperCase();
        const kind = sq.piece?.toLowerCase() ?? "";
        const state = `${sq.name === selected ? " sq-selected" : ""}${targets?.includes(sq.name) ? (sq.piece ? " sq-capture" : " sq-target") : ""}${hints?.includes(sq.name) ? " sq-hint" : ""}`;
        return (
          <div
            key={sq.name}
            className={`sq ${sq.dark ? "sq-dark" : "sq-light"}${highlight ? " sq-last" : ""}${state}`}
            role={onSquareClick ? "gridcell" : undefined}
            aria-label={onSquareClick ? `${sq.name}${sq.piece ? ` ${white ? "white" : "black"} ${NAME[kind]}` : ""}` : undefined}
          >
            {i % 8 === 0 && <span className="coord coord-rank">{sq.name[1]}</span>}
            {i >= 56 && <span className="coord coord-file">{sq.name[0]}</span>}
            {badge && badge.square === sq.name && (
              <span className="sq-badge" style={{ background: badge.color }} title={badge.label}>
                {badge.symbol}
              </span>
            )}
            {sq.piece && pieceImage(sq.piece, drag?.moved && drag.from === sq.name ? "piece-lifted" : "")}
          </div>
        );
      })}
      {drag?.moved && pieceImage(drag.piece, "piece-drag", { left: drag.x, top: drag.y })}
    </div>
  );
}
