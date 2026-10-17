// Reads a chess position from a picture of a board (a screenshot, or a clean photo).
//
// How it works, with no server and no machine-learning model:
//   1. The board's square region is cut out and shrunk to 8x8 small tiles.
//   2. For each tile, the colour of the square itself is measured from the tile's border, so highlights and
//      different board colours don't matter.
//   3. Every piece image from this app's own piece sets is laid over that square colour and compared with the tile.
//      The closest of "empty + 12 pieces" wins, and the piece set with the lowest total difference is the one used.
// This reads screenshots drawn with one of the piece sets listed in boardPrefs (the Lichess sets) very reliably.
// A different piece style, or a photo of a real board at an angle, will make mistakes, so the person always gets
// to check and fix the result before it is analysed.

export interface Rgba {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** A square area of the picture, in pixels. */
export interface Rect {
  x: number;
  y: number;
  size: number;
}

export type PieceKey = "wK" | "wQ" | "wR" | "wB" | "wN" | "wP" | "bK" | "bQ" | "bR" | "bB" | "bN" | "bP";
export const PIECE_KEYS: PieceKey[] = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];

/** Size of one square when the board is shrunk for comparing (pixels). */
export const TILE = 16;

/** A piece image shrunk to TILE x TILE: r,g,b (0-255) and alpha (0-1) for every pixel, as 4 numbers each. */
export type PieceTemplate = Float32Array;
export type TemplateSet = Record<PieceKey, PieceTemplate>;

/** Averages the picture's pixels over the area each output pixel covers (so thin lines and text blur in, not alias). */
export function resample(img: Rgba, rect: Rect, out: number): Float32Array {
  const result = new Float32Array(out * out * 3);
  const scale = rect.size / out;
  for (let oy = 0; oy < out; oy++) {
    for (let ox = 0; ox < out; ox++) {
      const x0 = rect.x + ox * scale;
      const y0 = rect.y + oy * scale;
      const xs = Math.max(0, Math.floor(x0));
      const ys = Math.max(0, Math.floor(y0));
      const xe = Math.min(img.width, Math.max(xs + 1, Math.ceil(x0 + scale)));
      const ye = Math.min(img.height, Math.max(ys + 1, Math.ceil(y0 + scale)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (oy * out + ox) * 3;
      if (n) {
        result[o] = r / n;
        result[o + 1] = g / n;
        result[o + 2] = b / n;
      }
    }
  }
  return result;
}

/** The 64 tiles of a board, left to right, top to bottom, each TILE*TILE*3 numbers. */
export function sampleBoard(img: Rgba, rect: Rect): Float32Array[] {
  const flat = resample(img, rect, TILE * 8);
  const width = TILE * 8;
  const tiles: Float32Array[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const tile = new Float32Array(TILE * TILE * 3);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const from = ((row * TILE + y) * width + col * TILE + x) * 3;
          const to = (y * TILE + x) * 3;
          tile[to] = flat[from];
          tile[to + 1] = flat[from + 1];
          tile[to + 2] = flat[from + 2];
        }
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** The colour of the square itself: the middle colour of the tile's outer border (pieces rarely touch it). */
export function squareColor(tile: Float32Array): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (x > 1 && x < TILE - 2 && y > 1 && y < TILE - 2) continue;
      const i = (y * TILE + x) * 3;
      rs.push(tile[i]);
      gs.push(tile[i + 1]);
      bs.push(tile[i + 2]);
    }
  }
  return [median(rs), median(gs), median(bs)];
}

/** A piece image blurred a little, kept as opacity and opacity-weighted colour so it can be laid over any square colour. */
interface SoftPiece {
  /** Opacity, one number per pixel. */
  a: Float32Array;
  /** Colour times opacity, three numbers per pixel. */
  p: Float32Array;
}

const softCache = new WeakMap<PieceTemplate, SoftPiece>();

/** Averages each pixel with its 8 neighbours. A crop that is a pixel or two off then costs a little, not a lot. */
function blur3(data: Float32Array, channels: number): Float32Array {
  const out = new Float32Array(data.length);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(TILE - 1, Math.max(0, x + dx));
            const yy = Math.min(TILE - 1, Math.max(0, y + dy));
            sum += data[(yy * TILE + xx) * channels + c];
          }
        }
        out[(y * TILE + x) * channels + c] = sum / 9;
      }
    }
  }
  return out;
}

function soften(template: PieceTemplate): SoftPiece {
  let soft = softCache.get(template);
  if (!soft) {
    const a = new Float32Array(TILE * TILE);
    const p = new Float32Array(TILE * TILE * 3);
    for (let i = 0; i < TILE * TILE; i++) {
      const alpha = template[i * 4 + 3];
      a[i] = alpha;
      for (let c = 0; c < 3; c++) p[i * 3 + c] = template[i * 4 + c] * alpha;
    }
    soft = { a: blur3(a, 1), p: blur3(p, 3) };
    softCache.set(template, soft);
  }
  return soft;
}

/** Mean absolute colour difference between a (blurred) tile and a piece, or nothing, laid on a square colour.
 * With `shifts`, the piece may sit up to one pixel off in any direction, because a hand-drawn crop is never perfectly aligned. */
function difference(tile: Float32Array, bg: [number, number, number], piece: SoftPiece | null, shifts = true): number {
  if (!piece) {
    let total = 0;
    for (let p = 0; p < TILE * TILE; p++) for (let c = 0; c < 3; c++) total += Math.abs(tile[p * 3 + c] - bg[c]);
    return total / (TILE * TILE * 3);
  }
  let best = Infinity;
  const reach = shifts ? 1 : 0;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      let total = 0;
      for (let y = 0; y < TILE; y++) {
        const ty = y + dy;
        for (let x = 0; x < TILE; x++) {
          const tx = x + dx;
          const p = y * TILE + x;
          // Where the shifted piece falls outside the tile, the square is empty.
          const inside = tx >= 0 && tx < TILE && ty >= 0 && ty < TILE;
          const q = ty * TILE + tx;
          const a = inside ? piece.a[q] : 0;
          for (let c = 0; c < 3; c++) {
            const expected = inside ? piece.p[q * 3 + c] + (1 - a) * bg[c] : bg[c];
            total += Math.abs(tile[p * 3 + c] - expected);
          }
        }
      }
      best = Math.min(best, total / (TILE * TILE * 3));
    }
  }
  return best;
}

export interface Reading {
  /** Which piece set matched best. */
  set: string;
  /** Row by row from the top-left of the picture: a piece, or null for an empty square. */
  squares: (PieceKey | null)[];
  /** 0-1 for each square: how clearly the winner beat the runner-up. Low = worth a second look. */
  confidence: number[];
  /** Average difference of the winning set over every square (lower = better fit). */
  error: number;
  /** The same, counting only squares that hold a piece: about 2-8 for a style on this site, 15 or more for one that isn't. */
  pieceError: number;
}

/** A square whose pixels are this close to its own colour (on average) is empty. */
const EMPTY_SQUARE = 1;

export function readBoard(tiles: Float32Array[], sets: Record<string, TemplateSet>): Reading {
  const colors = tiles.map(squareColor); // measured on the sharp tile; its border is plain square colour
  const soft = tiles.map((t) => blur3(t, 3));
  // How far each square is from being just its own colour: the same for every piece set.
  const emptyErr = soft.map((tile, i) => difference(tile, colors[i], null));
  let best: Reading | null = null;
  for (const [setId, templates] of Object.entries(sets)) {
    const squares: (PieceKey | null)[] = [];
    const confidence: number[] = [];
    const pieces = PIECE_KEYS.map((key) => soften(templates[key]));
    let total = 0;
    let pieceTotal = 0;
    let pieceCount = 0;
    soft.forEach((tile, i) => {
      // A square that is plainly just its own colour needs no further comparing.
      if (emptyErr[i] < EMPTY_SQUARE) {
        squares.push(null);
        confidence.push(1);
        total += emptyErr[i];
        return;
      }
      // First a quick look at every piece, then the careful shifted comparison for the closest few only.
      const quick = PIECE_KEYS.map((key, k) => ({ key, k, err: difference(tile, colors[i], pieces[k], false) })).sort((a, b) => a.err - b.err);
      const scores: { key: PieceKey | null; err: number }[] = [{ key: null, err: emptyErr[i] }];
      for (const q of quick.slice(0, 4)) scores.push({ key: q.key, err: difference(tile, colors[i], pieces[q.k]) });
      scores.sort((a, b) => a.err - b.err);
      squares.push(scores[0].key);
      confidence.push(Math.min(1, (scores[1].err - scores[0].err) / (scores[1].err + 1e-6) / 0.35));
      total += scores[0].err;
      if (scores[0].key) {
        pieceTotal += scores[0].err;
        pieceCount++;
      }
    });
    const reading: Reading = { set: setId, squares, confidence, error: total / tiles.length, pieceError: pieceCount ? pieceTotal / pieceCount : 0 };
    if (!best || reading.error < best.error) best = reading;
  }
  if (!best) throw new Error("No piece sets to compare with.");
  return best;
}

const CHAR: Record<PieceKey, string> = { wK: "K", wQ: "Q", wR: "R", wB: "B", wN: "N", wP: "P", bK: "k", bQ: "q", bR: "r", bB: "b", bN: "n", bP: "p" };

/** The piece-placement part of a FEN. `whiteAtBottom: false` reads the picture as seen from Black's side. */
export function placementOf(squares: (PieceKey | null)[], whiteAtBottom: boolean): string {
  const ordered = whiteAtBottom ? squares : [...squares].reverse();
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = ordered[r * 8 + f];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += CHAR[p];
      }
    }
    rows.push(row + (empty || ""));
  }
  return rows.join("/");
}

/** Castling rights that are still possible, judged from where the kings and rooks stand. */
export function castlingFor(placement: string): string {
  const ranks = placement.split("/");
  const expand = (row: string) => row.replace(/\d/g, (d) => ".".repeat(Number(d)));
  const r8 = expand(ranks[0] ?? "");
  const r1 = expand(ranks[7] ?? "");
  let rights = "";
  if (r1[4] === "K" && r1[7] === "R") rights += "K";
  if (r1[4] === "K" && r1[0] === "R") rights += "Q";
  if (r8[4] === "k" && r8[7] === "r") rights += "k";
  if (r8[4] === "k" && r8[0] === "r") rights += "q";
  return rights || "-";
}

export function fenFor(squares: (PieceKey | null)[], whiteAtBottom: boolean, turn: "w" | "b"): string {
  const placement = placementOf(squares, whiteAtBottom);
  return `${placement} ${turn} ${castlingFor(placement)} - 0 1`;
}

interface Grid {
  w: number;
  h: number;
  lum: Float32Array;
  /** Pixels in this grid per pixel in the original picture. */
  scale: number;
}

function lumaGrid(img: Rgba, maxSide: number): Grid {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * scale));
  const h = Math.max(8, Math.round(img.height * scale));
  const side = Math.max(w, h);
  const rgb = resample(img, { x: 0, y: 0, size: Math.max(img.width, img.height) }, side);
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * side + x) * 3;
      lum[y * w + x] = 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
    }
  }
  return { w, h, lum, scale };
}

const lightCells = new Float32Array(32);
const darkCells = new Float32Array(32);

/** How cleanly an 8x8 grid placed here alternates light and dark: the gap between the two colours over how much each varies.
 * Each cell is judged by its four corners (where a piece almost never reaches), ignoring the brightest and darkest of them
 * so a coordinate label or a stray edge does not count. */
function checkerScore(g: Grid, x0: number, y0: number, size: number): number {
  const cell = size / 8;
  let nl = 0;
  let nd = 0;
  const maxX = g.w - 1;
  const maxY = g.h - 1;
  for (let r = 0; r < 8; r++) {
    const ya = Math.min(maxY, Math.max(0, (y0 + (r + 0.12) * cell) | 0)) * g.w;
    const yb = Math.min(maxY, Math.max(0, (y0 + (r + 0.88) * cell) | 0)) * g.w;
    for (let c = 0; c < 8; c++) {
      const xa = Math.min(maxX, Math.max(0, (x0 + (c + 0.12) * cell) | 0));
      const xb = Math.min(maxX, Math.max(0, (x0 + (c + 0.88) * cell) | 0));
      const v1 = g.lum[ya + xa], v2 = g.lum[ya + xb], v3 = g.lum[yb + xa], v4 = g.lum[yb + xb];
      const mid = (v1 + v2 + v3 + v4 - Math.min(v1, v2, v3, v4) - Math.max(v1, v2, v3, v4)) / 2;
      if ((r + c) % 2 === 0) lightCells[nl++] = mid;
      else darkCells[nd++] = mid;
    }
  }
  let ml = 0, md = 0;
  for (let i = 0; i < 32; i++) {
    ml += lightCells[i];
    md += darkCells[i];
  }
  ml /= nl;
  md /= nd;
  let vl = 0, vd = 0;
  for (let i = 0; i < 32; i++) {
    vl += (lightCells[i] - ml) ** 2;
    vd += (darkCells[i] - md) ** 2;
  }
  return Math.abs(ml - md) / (Math.sqrt(vl / nl) + Math.sqrt(vd / nd) + 3);
}

/**
 * Looks for a checkerboard in the picture and returns its square area: a quick search of many positions and sizes
 * on a small copy, then a fine search around the best one on a bigger copy. Returns the biggest centred square
 * when nothing looks like a board.
 */
export function guessBoardRect(img: Rgba): Rect {
  const side = Math.min(img.width, img.height);
  const fallback: Rect = { x: Math.floor((img.width - side) / 2), y: Math.floor((img.height - side) / 2), size: side };
  if (side < 64) return fallback;

  const coarse = lumaGrid(img, 96);
  let best = { score: 0, x: 0, y: 0, size: 0 };
  const maxSize = Math.min(coarse.w, coarse.h);
  for (let size = maxSize; size >= Math.max(24, Math.round(maxSize * 0.4)); size -= 1) {
    for (let y0 = 0; y0 + size <= coarse.h; y0++) {
      for (let x0 = 0; x0 + size <= coarse.w; x0++) {
        const score = checkerScore(coarse, x0, y0, size);
        if (score > best.score) best = { score, x: x0, y: y0, size };
      }
    }
  }
  if (best.size === 0 || best.score < 2) return fallback;

  const fine = lumaGrid(img, 288);
  const k = fine.scale / coarse.scale;
  let top = { score: 0, x: 0, y: 0, size: 0 };
  const cx = best.x * k, cy = best.y * k, cs = best.size * k;
  const reach = Math.ceil(k) + 1;
  for (let size = Math.round(cs) - reach; size <= Math.round(cs) + reach; size++) {
    for (let y0 = Math.round(cy) - reach; y0 <= Math.round(cy) + reach; y0++) {
      for (let x0 = Math.round(cx) - reach; x0 <= Math.round(cx) + reach; x0++) {
        if (size < 16 || x0 < 0 || y0 < 0 || x0 + size > fine.w || y0 + size > fine.h) continue;
        const score = checkerScore(fine, x0, y0, size);
        if (score > top.score) top = { score, x: x0, y: y0, size };
      }
    }
  }
  if (top.size === 0) return fallback;
  const back = 1 / fine.scale;
  return { x: Math.round(top.x * back), y: Math.round(top.y * back), size: Math.round(top.size * back) };
}

/** Shrinks a larger rendering of a piece (RGBA, transparent background) to a TILE x TILE template.
 * Colours are averaged weighted by opacity so the transparent background doesn't tint the piece. */
export function shrinkPiece(img: Rgba): PieceTemplate {
  const out = new Float32Array(TILE * TILE * 4);
  const scale = img.width / TILE;
  for (let oy = 0; oy < TILE; oy++) {
    for (let ox = 0; ox < TILE; ox++) {
      const xs = Math.floor(ox * scale), xe = Math.max(xs + 1, Math.floor((ox + 1) * scale));
      const ys = Math.floor(oy * scale), ye = Math.max(ys + 1, Math.floor((oy + 1) * scale));
      let a = 0, r = 0, g = 0, b = 0, n = 0;
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          const i = (y * img.width + x) * 4;
          const alpha = img.data[i + 3] / 255;
          a += alpha;
          r += img.data[i] * alpha;
          g += img.data[i + 1] * alpha;
          b += img.data[i + 2] * alpha;
          n++;
        }
      }
      const o = (oy * TILE + ox) * 4;
      out[o + 3] = a / n;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
    }
  }
  return out;
}

/** Guesses which side is at the bottom of the picture: the side with more of its pieces on the lower half. */
export function suggestWhiteAtBottom(squares: (PieceKey | null)[]): boolean {
  let whiteTop = 0;
  let whiteBottom = 0;
  squares.forEach((piece, i) => {
    if (piece?.[0] !== "w") return;
    if (i < 32) whiteTop++;
    else whiteBottom++;
  });
  return whiteBottom >= whiteTop;
}

/**
 * Nudges a rough crop to wherever the pieces match best. Moves the box and resizes it in ever smaller steps, keeping any
 * change that lowers the difference to the matched piece set. Only the winning set is compared, so this stays quick.
 */
export function refineRect(img: Rgba, start: Rect, templates: TemplateSet): Rect {
  const score = (r: Rect) => readBoard(sampleBoard(img, r), { only: templates }).error;
  const limit = Math.min(img.width, img.height);
  const drift = start.size * 0.08; // a rough crop is never this far off; going further means it is chasing noise
  const fits = (r: Rect) =>
    r.size >= 16 && r.size <= limit && r.x >= 0 && r.y >= 0 && r.x + r.size <= img.width && r.y + r.size <= img.height &&
    Math.abs(r.x - start.x) <= drift && Math.abs(r.y - start.y) <= drift && Math.abs(r.size - start.size) <= drift * 1.5;
  let best = start;
  let bestScore = score(start);
  for (const fraction of [0.02, 0.008, 0.003]) {
    const step = Math.max(1, Math.round(start.size * fraction));
    for (let round = 0; round < 6; round++) {
      let improved = false;
      const tries: Rect[] = [
        { ...best, x: best.x - step },
        { ...best, x: best.x + step },
        { ...best, y: best.y - step },
        { ...best, y: best.y + step },
        { x: best.x - step, y: best.y - step, size: best.size + step * 2 },
        { x: best.x + step, y: best.y + step, size: best.size - step * 2 },
      ];
      for (const candidate of tries) {
        if (!fits(candidate)) continue;
        const s = score(candidate);
        if (s < bestScore - 1e-6) {
          best = candidate;
          bestScore = s;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }
  return best;
}
