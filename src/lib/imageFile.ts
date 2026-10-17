// Browser-side helpers for pictures: loading a file, getting its pixels, preparing it for text reading,
// and drawing the app's piece images so they can be matched against a board picture.

import { PIECE_SETS } from "./boardPrefs";
import { PIECE_KEYS, shrinkPiece, type Rgba, type TemplateSet } from "./boardImage";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Is this file a picture the browser can show? (Photos from some phones are HEIC, which most browsers can't open.) */
export function imageProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "That file isn't a picture. Choose a PNG, JPG or WebP image.";
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return "HEIC photos can't be opened in the browser. Take a screenshot, or save the photo as JPG first.";
  if (file.size > MAX_IMAGE_BYTES) return "That picture is too large (over 15 MB). Try a smaller one.";
  return null;
}

export interface LoadedImage {
  source: HTMLImageElement;
  width: number;
  height: number;
  url: string;
}

export function loadImage(file: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => resolve({ source, width: source.naturalWidth, height: source.naturalHeight, url });
    source.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture couldn't be opened."));
    };
    source.src = url;
  });
}

/** The picture's pixels, optionally scaled down so the longest side is at most maxSide. */
export function pixelsOf(source: CanvasImageSource, width: number, height: number, maxSide = 2400): Rgba {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff"; // transparent areas read as white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Gets a picture of text ready for the text reader: big enough for small print, dark text on a light background
 * (dark-mode screenshots are inverted), and with the contrast stretched so faint pencil or a grey photo reads better.
 */
export function prepareForOcr(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const target = Math.min(3000, Math.max(1800, width)); // small screenshots are scaled up; huge photos down
  const scale = target / width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  let sum = 0;
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[p] = v;
    sum += v;
    histogram[v]++;
  }
  const invert = sum / gray.length < 110;
  // Stretch between the 2nd and 98th percentile of brightness.
  const cut = (share: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v];
      if (acc >= gray.length * share) return v;
    }
    return 255;
  };
  const lo = cut(0.02);
  const hi = Math.max(lo + 1, cut(0.98));
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = Math.max(0, Math.min(255, ((gray[p] - lo) * 255) / (hi - lo)));
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The app's piece images for each set, drawn small enough to compare with a board picture. Loaded once. */
let templateCache: Promise<Record<string, TemplateSet>> | null = null;

export function loadTemplates(): Promise<Record<string, TemplateSet>> {
  templateCache ??= (async () => {
    const SIZE = 64;
    const sets: Record<string, TemplateSet> = {};
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    for (const set of PIECE_SETS) {
      if (set.id === "unicode") continue;
      const templates = {} as TemplateSet;
      await Promise.all(
        PIECE_KEYS.map(async (key) => {
          const img = new Image();
          img.src = `${import.meta.env.BASE_URL}pieces/${set.id}/${key}.svg`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = c.height = SIZE;
          const cx = c.getContext("2d", { willReadFrequently: true })!;
          cx.drawImage(img, 0, 0, SIZE, SIZE);
          templates[key] = shrinkPiece(cx.getImageData(0, 0, SIZE, SIZE));
        }),
      );
      sets[set.id] = templates;
    }
    void ctx;
    return sets;
  })().catch((e) => {
    templateCache = null; // let a later try start over
    throw e;
  });
  return templateCache;
}
