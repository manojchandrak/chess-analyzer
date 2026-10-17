import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fenFor, guessBoardRect, PIECE_KEYS, readBoard, refineRect, sampleBoard, suggestWhiteAtBottom, type PieceKey, type Rect, type Rgba, type TemplateSet } from "../lib/boardImage";
import { themeOf, useBoardPrefs } from "../lib/boardPrefs";
import { fenProblem } from "../lib/explore";
import { loadTemplates, pixelsOf, type LoadedImage } from "../lib/imageFile";

interface Props {
  image: LoadedImage;
  onAnalyze: (fen: string) => void;
  disabled: boolean;
}

const FILES = "abcdefgh";
const NAME: Record<string, string> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
const label = (key: PieceKey) => `${key[0] === "w" ? "White" : "Black"} ${NAME[key[1]]}`;
const VIEW_WIDTH = 560;
const MIN_SIZE = 40;

/** Name of the square at position `i` of the picture (row by row from the top-left). */
function squareName(i: number, whiteAtBottom: boolean) {
  const row = Math.floor(i / 8);
  const col = i % 8;
  return whiteAtBottom ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`;
}

export function BoardImage({ image, onAnalyze, disabled }: Props) {
  const prefs = useBoardPrefs();
  const colors = themeOf(prefs.theme);
  const pieceSet = prefs.pieces === "unicode" ? "cburnett" : prefs.pieces;
  const pieceUrl = (key: PieceKey) => `${import.meta.env.BASE_URL}pieces/${pieceSet}/${key}.svg`;

  const pixels = useMemo<Rgba>(() => pixelsOf(image.source, image.width, image.height, 1600), [image]);
  const [templates, setTemplates] = useState<Record<string, TemplateSet> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rect, setRect] = useState<Rect>(() => guessBoardRect(pixels));
  const [whiteAtBottom, setWhiteAtBottom] = useState(true);
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [squares, setSquares] = useState<(PieceKey | null)[]>(() => Array(64).fill(null));
  const [confidence, setConfidence] = useState<number[]>(() => Array(64).fill(1));
  const [matchedSet, setMatchedSet] = useState<string | null>(null);
  const [fitError, setFitError] = useState(0);
  const [tool, setTool] = useState<PieceKey | "empty" | null>(null);
  const firstRead = useRef(true);
  // After an automatic guess at the board, the box is snapped onto the pieces once. Until that settles, the reading is rough,
  // so warnings and outlines are held back rather than flashing up and disappearing.
  const phase = useRef<"first" | "refining" | "done">("first");
  const [settling, setSettling] = useState(true);

  useEffect(() => {
    let live = true;
    loadTemplates().then(
      (t) => live && setTemplates(t),
      () => live && setLoadError(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // Read the board whenever the crop moves (after a short pause, so dragging stays smooth).
  useEffect(() => {
    if (!templates) return;
    const timer = window.setTimeout(() => {
      const reading = readBoard(sampleBoard(pixels, rect), templates);
      setSquares(reading.squares);
      setConfidence(reading.confidence);
      setMatchedSet(reading.set);
      setFitError(reading.pieceError);
      if (phase.current === "first") {
        // Show this reading now, then fine-tune the box in a moment so the page stays responsive.
        phase.current = "refining";
        window.setTimeout(() => {
          const better = refineRect(pixels, rect, templates[reading.set]);
          phase.current = "done";
          if (better.x !== rect.x || better.y !== rect.y || better.size !== rect.size) setRect(better);
          else setSettling(false);
        }, 30);
      } else if (phase.current === "done") {
        setSettling(false);
      }
      if (firstRead.current) {
        firstRead.current = false;
        setWhiteAtBottom(suggestWhiteAtBottom(reading.squares));
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [templates, pixels, rect]);

  // ---- The crop box over the picture ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = Math.min(1, VIEW_WIDTH / pixels.width);
  const viewW = Math.round(pixels.width * view);
  const viewH = Math.round(pixels.height * view);
  const drag = useRef<{ mode: "move" | "resize" | "new"; ox: number; oy: number; start: Rect } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.drawImage(image.source, 0, 0, viewW, viewH);
    const x = rect.x * view, y = rect.y * view, s = rect.size * view;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, viewW, y);
    ctx.fillRect(0, y + s, viewW, viewH - y - s);
    ctx.fillRect(0, y, x, s);
    ctx.fillRect(x + s, y, viewW - x - s, s);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      ctx.moveTo(x + (s * i) / 8, y);
      ctx.lineTo(x + (s * i) / 8, y + s);
      ctx.moveTo(x, y + (s * i) / 8);
      ctx.lineTo(x + s, y + (s * i) / 8);
    }
    ctx.stroke();
    ctx.strokeStyle = "#2f81f7";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = "#2f81f7";
    ctx.fillRect(x + s - 8, y + s - 8, 16, 16);
  }, [image, rect, view, viewW, viewH]);

  const clamp = (r: Rect): Rect => {
    const size = Math.max(MIN_SIZE, Math.min(r.size, Math.min(pixels.width, pixels.height)));
    return { size, x: Math.max(0, Math.min(r.x, pixels.width - size)), y: Math.max(0, Math.min(r.y, pixels.height - size)) };
  };
  const at = (e: PointerEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * pixels.width, y: ((e.clientY - box.top) / box.height) * pixels.height };
  };
  const onDown = (e: PointerEvent) => {
    const p = at(e);
    const corner = { x: rect.x + rect.size, y: rect.y + rect.size };
    const grab = 16 / view;
    let mode: "move" | "resize" | "new";
    if (Math.abs(p.x - corner.x) < grab && Math.abs(p.y - corner.y) < grab) mode = "resize";
    else if (p.x > rect.x && p.x < rect.x + rect.size && p.y > rect.y && p.y < rect.y + rect.size) mode = "move";
    else mode = "new";
    drag.current = { mode, ox: p.x, oy: p.y, start: mode === "new" ? { x: p.x, y: p.y, size: MIN_SIZE } : rect };
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    if (d.mode === "move") setRect(clamp({ ...d.start, x: d.start.x + p.x - d.ox, y: d.start.y + p.y - d.oy }));
    else if (d.mode === "resize") setRect(clamp({ ...d.start, size: Math.max(p.x - d.start.x, p.y - d.start.y) }));
    else setRect(clamp({ x: d.start.x, y: d.start.y, size: Math.max(p.x - d.start.x, p.y - d.start.y) }));
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setRect((r) => clamp({ ...r, x: r.x + moves[e.key][0], y: r.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      setRect((r) => clamp({ ...r, size: r.size + (e.key === "-" ? -step : step) }));
    }
  };

  // ---- The result: a board the person can correct ----
  const fen = fenFor(squares, whiteAtBottom, turn);
  const problem = fenProblem(fen);
  const unsure = confidence.filter((c) => c < 0.5).length;

  function paint(i: number) {
    if (!tool) return;
    setSquares((old) => old.map((p, k) => (k === i ? (tool === "empty" ? null : tool) : p)));
    setConfidence((old) => old.map((c, k) => (k === i ? 1 : c)));
  }

  return (
    <div className="image-result">
      <p className="image-label">Drag the box over the board, and drag its corner to resize it. Arrow keys nudge it and + / − resize it.</p>
      <canvas
        ref={canvasRef}
        className="crop-canvas"
        width={viewW}
        height={viewH}
        style={{ aspectRatio: `${viewW} / ${viewH}` }}
        tabIndex={0}
        role="img"
        aria-label="Your picture with a box to place over the board"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      />
      <div className="pgn-controls">
        <button
          className="btn btn-ghost"
          onClick={() => {
            phase.current = "first";
            setSettling(true);
            setRect(guessBoardRect(pixels));
          }}
        >
          Find the board again
        </button>
        <label>
          White is at the
          <select value={whiteAtBottom ? "bottom" : "top"} onChange={(e) => setWhiteAtBottom(e.target.value === "bottom")} aria-label="Which side is at the bottom of the picture">
            <option value="bottom">bottom</option>
            <option value="top">top (Black at the bottom)</option>
          </select>
        </label>
        <label>
          To move
          <select value={turn} onChange={(e) => setTurn(e.target.value as "w" | "b")}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
      </div>

      {loadError && <p className="error-message">The piece images couldn't be loaded, so the board can't be read. Check your connection and try again.</p>}
      {!templates && !loadError && <p className="muted small" role="status">Loading the piece images...</p>}

      {templates && (
        <>
          <p className="image-label" aria-live="polite">
            {settling
              ? "Reading the board... "
              : unsure > 0
                ? `${unsure} square${unsure === 1 ? " is" : "s are"} outlined because they were hard to read. `
                : "Every square was read clearly. "}
            To fix a square, pick a piece below and click the square.
            {!settling && matchedSet && fitError <= 9 && <span className="muted small"> Matched the “{matchedSet}” piece style.</span>}
          </p>
          {!settling && fitError > 9 && (
            <p className="error-message" role="status">
              This doesn't look like one of the piece styles on this site, so the guesses may be wrong. Check every square, and fix any that are off.
            </p>
          )}
          <div className="edit-board" role="grid" aria-label="The position that was read" style={{ "--light": colors.light, "--dark": colors.dark } as React.CSSProperties}>
            {squares.map((piece, i) => {
              const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
              return (
                <button
                  key={i}
                  role="gridcell"
                  className={`edit-cell${dark ? " edit-dark" : ""}${!settling && confidence[i] < 0.5 ? " edit-unsure" : ""}${tool ? " edit-painting" : ""}`}
                  onClick={() => paint(i)}
                  aria-label={`${squareName(i, whiteAtBottom)}: ${piece ? label(piece) : "empty"}`}
                >
                  {piece && <img src={pieceUrl(piece)} alt="" draggable={false} />}
                </button>
              );
            })}
          </div>

          <div className="palette" role="group" aria-label="Pieces to place">
            {[...PIECE_KEYS, "empty" as const].map((key) => (
              <button key={key} className={`palette-item${tool === key ? " palette-on" : ""}`} aria-pressed={tool === key} title={key === "empty" ? "Empty square" : label(key)} aria-label={key === "empty" ? "Empty square" : label(key)} onClick={() => setTool(tool === key ? null : key)}>
                {key === "empty" ? <span aria-hidden="true">✕</span> : <img src={pieceUrl(key)} alt="" draggable={false} />}
              </button>
            ))}
          </div>

          <label className="image-label" htmlFor="read-fen">
            Position (FEN)
          </label>
          <input id="read-fen" className="fen-readout" value={fen} readOnly onFocus={(e) => e.currentTarget.select()} />
          {problem && (
            <p className="error-message" role="alert">
              {problem} Fix the pieces above (a position needs one king of each colour).
            </p>
          )}
          <div className="pgn-controls">
            <button className="btn btn-primary" disabled={disabled || settling || !!problem} onClick={() => onAnalyze(fen)}>
              Analyze this position
            </button>
          </div>
        </>
      )}
    </div>
  );
}
