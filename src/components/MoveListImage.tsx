import { useMemo, useState } from "react";
import { prepareForOcr, type LoadedImage } from "../lib/imageFile";
import { recoverMoves } from "../lib/moveText";
import { readText } from "../lib/ocr";

interface Props {
  image: LoadedImage;
  onAnalyze: (pgn: string) => void;
  disabled: boolean;
}

/** "e4" is move 1 for White, "e5" is move 1 for Black... */
const moveLabel = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? "." : "..."}`;

export function MoveListImage({ image, onAnalyze, disabled }: Props) {
  const [stage, setStage] = useState<"idle" | "reading" | "done">("idle");
  const [progress, setProgress] = useState({ fraction: 0, label: "" });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The text is checked against the rules of chess every time it changes, so a fix shows its effect at once.
  const game = useMemo(() => recoverMoves(text), [text]);

  async function read() {
    setStage("reading");
    setError(null);
    setProgress({ fraction: 0, label: "Preparing the picture" });
    try {
      const canvas = prepareForOcr(image.source, image.width, image.height);
      const raw = await readText(canvas, (fraction, label) => setProgress({ fraction, label }));
      setText(raw.replace(/\n{3,}/g, "\n\n").trim());
      setStage("done");
    } catch (e) {
      setStage("idle");
      setError(`The text reader couldn't run${e instanceof Error && e.message ? ` (${e.message})` : ""}. You can type the moves into the box below instead.`);
      setText((t) => t);
    }
  }

  const showEditor = stage === "done" || text.length > 0;

  return (
    <div className="image-result">
      <img className="image-preview" src={image.url} alt="The picture you chose" />
      <div className="pgn-controls">
        <button className="btn btn-primary" onClick={read} disabled={stage === "reading"}>
          {stage === "reading" ? "Reading..." : showEditor ? "Read the picture again" : "Read the moves"}
        </button>
        {!showEditor && (
          <button className="btn btn-ghost" onClick={() => setStage("done")}>
            Type the moves instead
          </button>
        )}
      </div>

      {stage === "reading" && (
        <div className="progress" role="status">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
          <p className="progress-label">
            {progress.label}
            {progress.fraction > 0 ? ` (${Math.round(progress.fraction * 100)}%)` : "..."}
            {" "}
            <span className="muted small">The first time also downloads the reader (about 7 MB).</span>
          </p>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {showEditor && stage !== "reading" && (
        <>
          <label className="image-label" htmlFor="ocr-text">
            What was read. Fix anything that's wrong; it's checked as you type.
          </label>
          <textarea id="ocr-text" className="pgn-textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="1. e4 e5 2. Nf3 Nc6 ..." />

          <div aria-live="polite" className="image-status">
            {game.sans.length > 0 && !game.problem && (
              <p className="image-ok">
                ✓ {game.sans.length} move{game.sans.length === 1 ? "" : "s"} read and all legal.
              </p>
            )}
            {game.problem && (
              <p className="error-message">
                Couldn't make sense of {moveLabel(game.problem.ply)} “{game.problem.text}”{game.sans.length ? ` (${game.sans.length} move${game.sans.length === 1 ? "" : "s"} before it are fine)` : ""}. Correct it in the box above.
              </p>
            )}
            {game.fixes.length > 0 && (
              <details className="image-fixes">
                <summary>
                  {game.fixes.length} move{game.fixes.length === 1 ? " was" : "s were"} corrected. Check them against the picture.
                </summary>
                <ul>
                  {game.fixes.map((f) => (
                    <li key={f.ply}>
                      {moveLabel(f.ply)} “{f.from}” → {f.to}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {text.trim() && game.sans.length === 0 && !game.problem && <p className="muted small">No moves found in that text yet.</p>}
          </div>

          <div className="pgn-controls">
            <button className="btn btn-primary" onClick={() => onAnalyze(game.pgn)} disabled={disabled || game.sans.length === 0}>
              {game.problem ? `Analyze the ${game.sans.length} moves read` : "Analyze this game"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
