import type { PlayerStats } from "../lib/analyze";

function cell(accuracy: number | null): string {
  return accuracy === null ? "—" : `${accuracy}%`;
}

export function PhaseTable({ white, black }: { white: PlayerStats; black: PlayerStats }) {
  return (
    <table className="phase-table">
      <thead>
        <tr>
          <th>Phase</th>
          <th>{white.name} (White)</th>
          <th>{black.name} (Black)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Opening</td>
          <td>{cell(white.opening.accuracy)}</td>
          <td>{cell(black.opening.accuracy)}</td>
        </tr>
        <tr>
          <td>Middlegame</td>
          <td>{cell(white.middlegame.accuracy)}</td>
          <td>{cell(black.middlegame.accuracy)}</td>
        </tr>
        <tr>
          <td>Endgame</td>
          <td>{cell(white.endgame.accuracy)}</td>
          <td>{cell(black.endgame.accuracy)}</td>
        </tr>
        <tr className="phase-table-overall">
          <td>Overall</td>
          <td>{cell(white.overall.accuracy)}</td>
          <td>{cell(black.overall.accuracy)}</td>
        </tr>
      </tbody>
    </table>
  );
}
