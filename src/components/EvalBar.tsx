import { formatScore, winPercent } from "../lib/accuracy";

interface Props {
  /** Evaluation from White's perspective. */
  cp: number | null;
  mate: number | null;
  flipped: boolean;
  depth?: number | null;
  /** The game ended in checkmate: the side that delivered it. */
  mated?: "w" | "b" | null;
  /** No evaluation yet: an even, unlabeled bar (keeps the board from resizing). */
  empty?: boolean;
}

/** Vertical bar showing White's share of the winning chances. */
export function EvalBar({ cp, mate, flipped, depth, mated, empty }: Props) {
  const whitePct = mated ? (mated === "w" ? 100 : 0) : mate !== null ? (mate > 0 ? 100 : mate < 0 ? 0 : 50) : winPercent(cp ?? 0);
  const whiteAhead = mated ? mated === "w" : mate !== null ? mate > 0 : (cp ?? 0) >= 0;
  const label = empty ? "" : mated ? "#" : formatScore(cp, mate);
  return (
    <div className={`eval-bar${flipped ? " eval-bar-flipped" : ""}`} title={`Evaluation ${label}${depth ? ` (depth ${depth})` : ""}`} aria-label={`Evaluation ${label}`}>
      <div className="eval-bar-white" style={{ height: `${whitePct}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? "eval-bar-label-white" : "eval-bar-label-black"}`}>{label.replace("+", "")}</span>
    </div>
  );
}
