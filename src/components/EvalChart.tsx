import type { MoveAnalysis } from "../lib/analyze";

const WIDTH = 640;
const HEIGHT = 160;
const CLAMP = 600; // centipawns shown at full chart height (+/-)

function clamp(cp: number): number {
  return Math.max(-CLAMP, Math.min(CLAMP, cp));
}

interface Props {
  moves: MoveAnalysis[];
  openingEndPly: number;
  endgameStartPly: number | null;
  /** Highlights this ply and lets clicks jump to a ply. */
  currentPly?: number;
  onSelect?: (ply: number) => void;
}

export function EvalChart({ moves, openingEndPly, endgameStartPly, currentPly, onSelect }: Props) {
  if (moves.length === 0) return null;

  const points = moves.map((m, i) => {
    const x = (i / (moves.length - 1 || 1)) * WIDTH;
    const y = HEIGHT / 2 - (clamp(m.evalAfterWhite) / CLAMP) * (HEIGHT / 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const plyToX = (ply: number) => ((ply - 1) / (moves.length - 1 || 1)) * WIDTH;

  return (
    <div className="eval-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        className={onSelect ? "eval-chart-clickable" : undefined}
        onClick={(e) => {
          if (!onSelect) return;
          const box = e.currentTarget.getBoundingClientRect();
          const ply = Math.round(((e.clientX - box.left) / box.width) * (moves.length - 1)) + 1;
          onSelect(Math.max(1, Math.min(moves.length, ply)));
        }}
      >
        <line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} className="eval-zero-line" />
        {openingEndPly < moves.length && (
          <line x1={plyToX(openingEndPly)} y1={0} x2={plyToX(openingEndPly)} y2={HEIGHT} className="eval-phase-line" />
        )}
        {endgameStartPly !== null && (
          <line x1={plyToX(endgameStartPly)} y1={0} x2={plyToX(endgameStartPly)} y2={HEIGHT} className="eval-phase-line" />
        )}
        <polyline points={points.join(" ")} className="eval-line" />
        {currentPly !== undefined && currentPly > 0 && <line x1={plyToX(currentPly)} y1={0} x2={plyToX(currentPly)} y2={HEIGHT} className="eval-current-line" />}
      </svg>
      <div className="eval-chart-labels">
        <span>White ahead ▲</span>
        <span>Black ahead ▼</span>
      </div>
    </div>
  );
}
