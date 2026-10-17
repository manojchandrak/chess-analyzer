import { describe, expect, it } from "vitest";
import {
  castlingFor,
  fenFor,
  guessBoardRect,
  PIECE_KEYS,
  placementOf,
  readBoard,
  refineRect,
  sampleBoard,
  TILE,
  type PieceKey,
  type Rgba,
  type TemplateSet,
} from "../boardImage";

// Stand-in "piece images": each piece type gets its own shape, white pieces are light and black pieces dark.
// (The real app compares against its Lichess piece sets; the matching maths is the same.)
type Shape = (x: number, y: number) => boolean; // x, y in 0..1
const SHAPES: Record<string, Shape> = {
  K: (x, y) => (x > 0.4 && x < 0.6 && y > 0.1 && y < 0.9) || (y > 0.25 && y < 0.4 && x > 0.2 && x < 0.8),
  Q: (x, y) => (y < 0.25 && x > 0.15 && x < 0.85) || (x > 0.4 && x < 0.6 && y > 0.25 && y < 0.9),
  R: (x, y) => x > 0.2 && x < 0.8 && y > 0.2 && y < 0.85,
  B: (x, y) => Math.abs(x - y) < 0.12 && x > 0.15 && x < 0.85,
  N: (x, y) => (x > 0.2 && x < 0.45 && y > 0.15 && y < 0.85) || (y > 0.65 && y < 0.85 && x > 0.2 && x < 0.8),
  P: (x, y) => (x - 0.5) ** 2 + (y - 0.7) ** 2 < 0.07,
};
// A second, different style, so the right set has to be recognised.
const ALT: Record<string, Shape> = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, (x: number, y: number) => f(y, x)]));

function templates(shapes: Record<string, Shape>): TemplateSet {
  const set = {} as TemplateSet;
  for (const key of PIECE_KEYS) {
    const t = new Float32Array(TILE * TILE * 4);
    const white = key[0] === "w";
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const o = (y * TILE + x) * 4;
        const inside = shapes[key[1]]((x + 0.5) / TILE, (y + 0.5) / TILE);
        const v = white ? 245 : 25;
        t[o] = v;
        t[o + 1] = v;
        t[o + 2] = v;
        t[o + 3] = inside ? 1 : 0;
      }
    }
    set[key] = t;
  }
  return set;
}

const SETS = { classic: templates(SHAPES), alt: templates(ALT) };

function parseFen(fen: string): (PieceKey | null)[] {
  const out: (PieceKey | null)[] = [];
  for (const ch of fen.split(" ")[0]) {
    if (ch === "/") continue;
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
    else out.push((ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase() as PieceKey);
  }
  return out;
}

interface Style {
  light: [number, number, number];
  dark: [number, number, number];
  shapes: Record<string, Shape>;
  /** Squares (0-63 in picture order) painted a highlight colour, like a last-move marker. */
  highlight?: number[];
  margin?: number;
  cell?: number;
  rotate?: boolean;
}

/** Draws a board picture the way a website would. Returns the picture and where the board sits in it. */
function draw(fen: string, style: Style): { img: Rgba; board: { x: number; y: number; size: number } } {
  const cell = style.cell ?? 40;
  const margin = style.margin ?? 0;
  const size = cell * 8;
  const width = size + margin * 2 + 30;
  const height = size + margin * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  let squares = parseFen(fen);
  if (style.rotate) squares = [...squares].reverse();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idx = r * 8 + c;
      const base = (r + c) % 2 === 0 ? style.light : style.dark;
      const bg: [number, number, number] = style.highlight?.includes(idx) ? [base[0] * 0.7 + 200 * 0.3, base[1] * 0.7 + 200 * 0.3, base[2] * 0.3] : base;
      const piece = squares[idx];
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          let color = bg;
          if (piece && style.shapes[piece[1]]((x + 0.5) / cell, (y + 0.5) / cell)) {
            const v = piece[0] === "w" ? 245 : 25;
            color = [v, v, v];
          }
          const o = ((margin + r * cell + y) * width + margin + c * cell + x) * 4;
          data[o] = color[0];
          data[o + 1] = color[1];
          data[o + 2] = color[2];
          data[o + 3] = 255;
        }
      }
    }
  }
  return { img: { data, width, height }, board: { x: margin, y: margin, size } };
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLE = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7";
const placement = (fen: string) => fen.split(" ")[0];

function read(fen: string, style: Style, whiteAtBottom = true, rectShift = { x: 0, y: 0 }) {
  const { img, board } = draw(fen, style);
  const reading = readBoard(sampleBoard(img, { x: board.x + rectShift.x, y: board.y + rectShift.y, size: board.size }), SETS);
  return { reading, placement: placementOf(reading.squares, whiteAtBottom) };
}

const BROWN: Pick<Style, "light" | "dark"> = { light: [240, 217, 181], dark: [181, 136, 99] };
const GREEN: Pick<Style, "light" | "dark"> = { light: [238, 238, 210], dark: [118, 150, 86] };

describe("readBoard", () => {
  it("reads the starting position", () => {
    expect(read(START, { ...BROWN, shapes: SHAPES }).placement).toBe(placement(START));
  });

  it("reads a middlegame position on a different board colour", () => {
    expect(read(MIDDLE, { ...GREEN, shapes: SHAPES }).placement).toBe(placement(MIDDLE));
  });

  it("reads a board seen from Black's side", () => {
    const r = read(MIDDLE, { ...BROWN, shapes: SHAPES, rotate: true }, false);
    expect(r.placement).toBe(placement(MIDDLE));
  });

  it("is not thrown by highlighted squares (a last-move marker)", () => {
    const r = read(MIDDLE, { ...BROWN, shapes: SHAPES, highlight: [26, 34, 36, 45] });
    expect(r.placement).toBe(placement(MIDDLE));
  });

  it("works at a different picture size", () => {
    expect(read(MIDDLE, { ...BROWN, shapes: SHAPES, cell: 29 }).placement).toBe(placement(MIDDLE));
    expect(read(MIDDLE, { ...BROWN, shapes: SHAPES, cell: 71 }).placement).toBe(placement(MIDDLE));
  });

  it("tolerates a crop that is a couple of pixels off", () => {
    expect(read(MIDDLE, { ...BROWN, shapes: SHAPES }, true, { x: 3, y: -2 }).placement).toBe(placement(MIDDLE));
  });

  it("picks the piece set that matches the picture", () => {
    expect(read(MIDDLE, { ...BROWN, shapes: SHAPES }).reading.set).toBe("classic");
    const alt = read(MIDDLE, { ...BROWN, shapes: ALT });
    expect(alt.reading.set).toBe("alt");
    expect(alt.placement).toBe(placement(MIDDLE));
  });

  it("reads an empty board and a lone king pair", () => {
    expect(read("8/8/8/8/8/8/8/8 w - - 0 1", { ...BROWN, shapes: SHAPES }).placement).toBe("8/8/8/8/8/8/8/8");
    const kk = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1";
    expect(read(kk, { ...GREEN, shapes: SHAPES }).placement).toBe(placement(kk));
  });

  it("marks squares it is unsure about with a low confidence", () => {
    const { img, board } = draw(MIDDLE, { ...BROWN, shapes: SHAPES });
    // Smudge one square so a piece is partly hidden.
    const cell = board.size / 8;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell / 2; x++) {
        const o = ((board.y + 2 * cell + y) * img.width + board.x + 2 * cell + x) * 4; // c6, a knight
        (img.data as Uint8ClampedArray)[o] = 181;
        (img.data as Uint8ClampedArray)[o + 1] = 136;
        (img.data as Uint8ClampedArray)[o + 2] = 99;
      }
    }
    const reading = readBoard(sampleBoard(img, board), SETS);
    const clean = readBoard(sampleBoard(draw(MIDDLE, { ...BROWN, shapes: SHAPES }).img, board), SETS);
    expect(reading.confidence[18]).toBeLessThan(clean.confidence[18]);
  });
});

describe("FEN building", () => {
  it("writes the placement with empty-square counts", () => {
    expect(placementOf(parseFen(START), true)).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  });

  it("infers castling rights from where kings and rooks stand", () => {
    expect(castlingFor(placement(START))).toBe("KQkq");
    expect(castlingFor(placement(MIDDLE))).toBe("-");
    expect(castlingFor("4k2r/8/8/8/8/8/8/R3K3")).toBe("Qk");
  });

  it("builds a full FEN", () => {
    expect(fenFor(parseFen(START), true, "w")).toBe(START);
    expect(fenFor(parseFen(START), true, "b")).toBe(START.replace(" w ", " b "));
  });

  it("reverses the squares when Black is at the bottom", () => {
    const flipped = [...parseFen(START)].reverse();
    expect(placementOf(flipped, false)).toBe(placement(START));
  });
});

describe("refineRect", () => {
  it("pulls a slightly-off crop onto the board", () => {
    const { img, board } = draw(MIDDLE, { ...BROWN, shapes: SHAPES, margin: 30 });
    const off = { x: board.x + 7, y: board.y - 5, size: board.size - 10 };
    const fixed = refineRect(img, off, SETS.classic);
    const distance = (r: { x: number; y: number; size: number }) => Math.max(Math.abs(r.x - board.x), Math.abs(r.y - board.y), Math.abs(r.size - board.size));
    expect(distance(fixed)).toBeLessThan(distance(off));
    expect(distance(fixed)).toBeLessThanOrEqual(2);
  });

  it("leaves a crop that already fits alone", () => {
    const { img, board } = draw(MIDDLE, { ...BROWN, shapes: SHAPES, margin: 30 });
    expect(refineRect(img, board, SETS.classic)).toEqual(board);
  });
});

describe("guessBoardRect", () => {
  it("finds a board that has a margin around it", () => {
    const { img, board } = draw(START, { ...BROWN, shapes: SHAPES, margin: 50, cell: 40 });
    const guess = guessBoardRect(img);
    const tolerance = board.size * 0.06;
    expect(Math.abs(guess.x - board.x)).toBeLessThan(tolerance);
    expect(Math.abs(guess.y - board.y)).toBeLessThan(tolerance);
    expect(Math.abs(guess.size - board.size)).toBeLessThan(tolerance);
  });

  it("falls back to the biggest centred square when there is no board", () => {
    const data = new Uint8ClampedArray(200 * 120 * 4).fill(128);
    const g = guessBoardRect({ data, width: 200, height: 120 });
    expect(g.size).toBe(120);
    expect(g.x).toBe(40);
  });
});
