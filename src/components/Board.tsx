import { useEffect, type CSSProperties } from "react";
import { themeOf, useBoardPrefs } from "../lib/boardPrefs";
import { arrowGeometry, describePosition, type BoardArrow } from "../lib/boardText";

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
  /** Arrows drawn over the board (best moves, engine lines). */
  arrows?: BoardArrow[];
  /** Makes squares clickable (for entering moves); the clicked square's name is passed. */
  onSquareClick?: (square: string) => void;
  /** A square to outline as selected, and squares to mark as possible destinations. */
  selected?: string | null;
  targets?: string[];
}

/** A static board rendered from a FEN, with the last move highlighted, drawn in
 * the viewer's chosen piece set and board colors. */
export function Board({ fen, flipped = false, lastMove, badge, arrows, onSquareClick, selected, targets }: Props) {
  const { pieces, theme } = useBoardPrefs();
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

  return (
    <div className="board-frame">
    <div className="board" role="img" aria-label={describePosition(fen)} style={{ "--sq-light": colors.light, "--sq-dark": colors.dark } as CSSProperties}>
      {ordered.map((sq, i) => {
        const highlight = lastMove && (sq.name === lastMove.from || sq.name === lastMove.to);
        const white = sq.piece !== null && sq.piece === sq.piece.toUpperCase();
        const kind = sq.piece?.toLowerCase() ?? "";
        return (
          <div
            key={sq.name}
            className={`sq ${sq.dark ? "sq-dark" : "sq-light"}${highlight ? " sq-last" : ""}${selected === sq.name ? " sq-selected" : ""}${onSquareClick ? " sq-click" : ""}`}
            onClick={onSquareClick ? () => onSquareClick(sq.name) : undefined}
          >
            {targets?.includes(sq.name) && <span className={`sq-target${sq.piece ? " sq-target-capture" : ""}`} />}
            {i % 8 === 0 && <span className="coord coord-rank">{sq.name[1]}</span>}
            {i >= 56 && <span className="coord coord-file">{sq.name[0]}</span>}
            {badge && badge.square === sq.name && (
              <span className="sq-badge" style={{ background: badge.color }} title={badge.label}>
                {badge.symbol}
              </span>
            )}
            {sq.piece &&
              (pieces === "unicode" ? (
                <span className={`piece ${white ? "piece-w" : "piece-b"}`}>{GLYPH[kind]}</span>
              ) : (
                <img
                  className="piece-img"
                  src={`${import.meta.env.BASE_URL}pieces/${pieces}/${white ? "w" : "b"}${kind.toUpperCase()}.svg`}
                  alt={`${white ? "white" : "black"} ${NAME[kind]}`}
                  draggable={false}
                />
              ))}
          </div>
        );
      })}
    </div>
    {arrows && arrows.length > 0 && (
      <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true">
        {arrows.map((a, i) => {
          const g = arrowGeometry(a, flipped);
          const color = a.color ?? "#2e7d5b";
          return (
            <g key={`${a.from}${a.to}${i}`} opacity={a.opacity ?? 0.85}>
              <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={color} strokeWidth={0.17} strokeLinecap="round" />
              <polygon points={g.head} fill={color} />
            </g>
          );
        })}
      </svg>
    )}
    </div>
  );
}
