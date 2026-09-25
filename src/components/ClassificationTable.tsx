import type { PlayerStats } from "../lib/analyze";
import { CLASS_META, CLASS_ORDER } from "../lib/classify";

/** Chess.com-style game review table: how many moves of each kind each side played. */
export function ClassificationTable({ white, black }: { white: PlayerStats; black: PlayerStats }) {
  return (
    <table className="class-table">
      <thead>
        <tr>
          <th className="num">{white.name}</th>
          <th />
          <th className="num">{black.name}</th>
        </tr>
      </thead>
      <tbody>
        {CLASS_ORDER.map((c) => (
          <tr key={c} className={white.classCounts[c] + black.classCounts[c] === 0 ? "class-zero" : undefined}>
            <td className="num" style={{ color: CLASS_META[c].color }}>
              {white.classCounts[c]}
            </td>
            <td className="class-name">
              <span className="class-icon" style={{ background: CLASS_META[c].color }}>
                {CLASS_META[c].symbol}
              </span>
              {CLASS_META[c].label}
            </td>
            <td className="num" style={{ color: CLASS_META[c].color }}>
              {black.classCounts[c]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
