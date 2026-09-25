import { useEffect, useState } from "react";
import { BOARD_THEMES, PIECE_SETS, setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";
import { englishVoices, onVoicesChanged, say, speechSupported } from "../lib/speech";

export function BoardSettings() {
  const { pieces, theme, voice } = useBoardPrefs();
  const [voices, setVoices] = useState(englishVoices);

  // Browsers load their voice list asynchronously.
  useEffect(() => onVoicesChanged(() => setVoices(englishVoices())), []);

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
      {speechSupported() && voices.length > 0 && (
        <label className="voice-picker">
          Voice
          <select value={voice ?? ""} onChange={(e) => setBoardPrefs({ voice: e.target.value || null })}>
            <option value="">Automatic ({voices[0].name.replace(/^Microsoft /, "").replace(/ Online \(Natural\)/, "")})</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => say("Knight takes E 5, check")} title="Hear this voice">
            ▶ Test
          </button>
        </label>
      )}
    </div>
  );
}
