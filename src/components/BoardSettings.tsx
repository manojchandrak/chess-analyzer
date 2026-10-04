import { useSyncExternalStore } from "react";
import { BOARD_THEMES, PIECE_SETS, setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";
import { PERSONAS, personaOf } from "../lib/personas";
import { allVoices, currentVoice, onVoicesChanged, say, speechSupported } from "../lib/speech";
import { accentLabel, availableAccents, isNaturalVoice, shortVoiceName, voicesForAccent } from "../lib/voices";

export function BoardSettings() {
  const { pieces, theme, voice, persona, accent } = useBoardPrefs();
  // Browsers load their voice list asynchronously, so follow it as it arrives.
  const voices = useSyncExternalStore(onVoicesChanged, allVoices);

  const accents = availableAccents(voices);
  const { voice: using, accent: usedAccent, fellBack } = currentVoice();
  const accentVoices = usedAccent ? voicesForAccent(voices, usedAccent) : [];
  const chosen = personaOf(persona);

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
        <div className="voice-settings">
          <label>
            Commentator
            <select value={persona} onChange={(e) => setBoardPrefs({ persona: e.target.value as typeof persona })} title={chosen.description}>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Accent
            <select value={accent} onChange={(e) => setBoardPrefs({ accent: e.target.value as typeof accent, voice: null })}>
              <option value="auto">Automatic ({accentLabel(personaOf(persona).accent as never)})</option>
              {accents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.count > 1 ? ` (${a.count} voices)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="voice-picker">
            Voice
            <select value={voice ?? ""} onChange={(e) => setBoardPrefs({ voice: e.target.value || null })}>
              <option value="">Best for this commentator{using ? ` (${shortVoiceName(using.name)})` : ""}</option>
              {accentVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" onClick={() => say(chosen.sample)} title="Hear this commentator and voice">
              ▶ Hear
            </button>
          </label>
          <p className="muted small voice-note">
            {chosen.description}
            {using ? ` Speaking with ${shortVoiceName(using.name)}${usedAccent ? ` (${accentLabel(usedAccent)})` : ""}.` : ""}
            {fellBack ? " Your device has no voice for the accent you chose, so the best available one is used." : ""}
            {usedAccent === "eu" ? " European voices read the commentary in English with a European accent; quality varies." : ""}
            {using && !isNaturalVoice(using) ? " This voice may sound robotic: for more natural ones, install a premium or natural voice (macOS: System Settings, Accessibility, Spoken Content; Windows: use Microsoft Edge, which has Natural voices)." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
