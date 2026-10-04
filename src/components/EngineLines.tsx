import { formatScore } from "../lib/accuracy";
import type { LiveInfo } from "../lib/engine";
import { pvToSan } from "../lib/uci";

interface Props {
  info: LiveInfo;
  /** True when the engine's reading is for the position on screen. */
  current: boolean;
  /** Which line's arrow is emphasized (null: the best line). */
  focus: number;
  onFocus: (index: number) => void;
}

/** The engine's top lines for the position, best first. Click a line to emphasize its arrow. */
export function EngineLines({ info, current, focus, onFocus }: Props) {
  const sign = info.fen.split(" ")[1] === "w" ? 1 : -1;
  return (
    <ol className={`engine-lines${current ? "" : " engine-line-stale"}`}>
      {info.lines.map((line, i) => (
        <li key={i}>
          <button className={`engine-line-row${focus === i ? " engine-line-row-on" : ""}`} onClick={() => onFocus(i)} aria-pressed={focus === i}>
            <strong className="engine-score">{formatScore(line.cp === null ? null : sign * line.cp, line.mate === null ? null : sign * line.mate)}</strong>
            <span className="pv">{pvToSan(info.fen, line.pv, 8)}</span>
          </button>
        </li>
      ))}
      <li className="muted small">depth {info.depth}</li>
    </ol>
  );
}
