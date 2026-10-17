import { useEffect, useRef, useState } from "react";
import { imageProblem, loadImage, type LoadedImage } from "../lib/imageFile";
import { BoardImage } from "./BoardImage";
import { MoveListImage } from "./MoveListImage";

type Mode = "moves" | "board";

interface Props {
  /** Starts the analysis of a game written as PGN. */
  onAnalyzePgn: (pgn: string) => void;
  /** Opens a position (FEN) to analyze and play on from. */
  onAnalyzeFen: (fen: string) => void;
  disabled: boolean;
}

/** Analyze from a picture: a list of moves (a scoresheet or a screenshot), or a board. Everything is read on this device. */
export function ImageInput({ onAnalyzePgn, onAnalyzeFen, disabled }: Props) {
  const [mode, setMode] = useState<Mode>("moves");
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  async function open(file: File | Blob) {
    const problem = file instanceof File ? imageProblem(file) : null;
    if (problem) return setError(problem);
    try {
      const loaded = await loadImage(file);
      setImage((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return loaded;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture couldn't be opened.");
    }
  }

  // Pasting a screenshot (Ctrl/Cmd+V) works while this section is on screen, unless the person is typing in a box.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!root.current || root.current.offsetParent === null) return; // this tab isn't showing
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void open(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );

  return (
    <div className="image-input" ref={root}>
      <div className="chips" role="group" aria-label="What is in the picture" style={{ marginTop: 0 }}>
        <button className={`chip${mode === "moves" ? " chip-on" : ""}`} aria-pressed={mode === "moves"} onClick={() => setMode("moves")}>
          A list of moves
        </button>
        <button className={`chip${mode === "board" ? " chip-on" : ""}`} aria-pressed={mode === "board"} onClick={() => setMode("board")}>
          A board position
        </button>
      </div>
      <p className="muted small">
        {mode === "moves"
          ? "A screenshot or photo of written or printed moves, like 1. e4 e5 2. Nf3 Nc6. Typed or printed text reads best; handwriting often needs fixes."
          : "A screenshot of a board, or a clear photo from above. Boards drawn with the same pieces as this site read best."}{" "}
        The picture is read on your device and is never uploaded.
      </p>

      <div
        className={`dropzone${dragOver ? " dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void open(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <p>{image ? "Drop or choose a different picture" : "Drop a picture here, paste a screenshot, or click to browse"}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="image-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void open(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {image && mode === "moves" && <MoveListImage key={image.url} image={image} onAnalyze={onAnalyzePgn} disabled={disabled} />}
      {image && mode === "board" && <BoardImage key={image.url} image={image} onAnalyze={onAnalyzeFen} disabled={disabled} />}
    </div>
  );
}
