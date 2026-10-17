// Reads text from a picture on this device with Tesseract (WebAssembly). The picture is never uploaded:
// the reader's files (public/engine/ocr/) are served from this site, like the chess engine's.

import type { PSM, Worker as TesseractWorker } from "tesseract.js";

export type OcrProgress = (fraction: number, status: string) => void;

let workerPromise: Promise<TesseractWorker> | null = null;
let onProgress: OcrProgress | null = null;

const STATUS_TEXT: Record<string, string> = {
  "loading tesseract core": "Loading the text reader",
  "initializing tesseract": "Starting the text reader",
  "loading language traineddata": "Loading the text reader",
  "initializing api": "Starting the text reader",
  "recognizing text": "Reading the picture",
};

async function getWorker(): Promise<TesseractWorker> {
  workerPromise ??= (async () => {
    // Loaded on demand so the reader's code only downloads for people who use this feature.
    const { createWorker } = await import("tesseract.js");
    const base = `${import.meta.env.BASE_URL}engine/ocr/`;
    const worker = await createWorker("eng", 1, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}tesseract-core-simd-lstm.wasm.js`,
      langPath: base,
      gzip: true,
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => onProgress?.(m.progress, STATUS_TEXT[m.status] ?? "Working"),
    });
    return worker;
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Tesseract page-segmentation modes worth trying: 3 = automatic, 4 = a single column, 6 = one block, 11 = scattered text. */
export interface OcrOptions {
  psm?: "3" | "4" | "6" | "11";
  /** Restrict to these characters; null reads anything (used to compare). */
  whitelist?: string | null;
}

export const CHESS_CHARS = "KQRBNabcdefgh0123456789OoxX=+-#./ ";

export async function readText(image: HTMLCanvasElement, progress?: OcrProgress, options: OcrOptions = {}): Promise<string> {
  onProgress = progress ?? null;
  try {
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: (options.psm ?? "6") as PSM,
      tessedit_char_whitelist: options.whitelist === undefined ? CHESS_CHARS : (options.whitelist ?? ""),
    });
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    onProgress = null;
  }
}

export async function stopOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await (await pending).terminate().catch(() => {});
}
