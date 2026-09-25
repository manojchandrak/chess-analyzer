import { BOARD_THEMES, PIECE_SETS, setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";

export function BoardSettings() {
  const { pieces, theme } = useBoardPrefs();
  return (
    <div className="board-settings">
      <label>
        Pieces
        <select value={pieces} onChange={(e) => setBoardPrefs({ pieces: e.target.value })}>
          {PIECE_SETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="swatches" role="radiogroup" aria-label="Board colors">
        {BOARD_THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={theme === t.id}
            aria-label={t.label}
            title={t.label}
            className={`swatch${theme === t.id ? " swatch-on" : ""}`}
            style={{ background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)` }}
            onClick={() => setBoardPrefs({ theme: t.id })}
          />
        ))}
      </div>
    </div>
  );
}
