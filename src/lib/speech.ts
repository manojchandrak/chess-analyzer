// Reads moves and commentary aloud with the browser's built-in speech synthesis, using the most
// natural-sounding voice the device offers for the chosen persona and accent (see voices.ts).

const PIECE: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" };

// Letters on their own get read as words ("a" as "uh"), so squares are spelled out.
const square = (sq: string) => `${sq[0].toUpperCase()} ${sq[1]}`;

/** "Nxe5+" → "Knight takes E 5, check"; "O-O" → "Castles kingside". */
export function sanToSpeech(san: string): string {
  const suffix = san.includes("#") ? ", checkmate" : san.includes("+") ? ", check" : "";
  const clean = san.replace(/[+#!?]/g, "");
  if (clean === "O-O-O") return `Castles queenside${suffix}`;
  if (clean === "O-O") return `Castles kingside${suffix}`;
  const m = clean.match(/^([KQRBN])?([a-h]?[1-8]?)?(x)?([a-h][1-8])(?:=([QRBN]))?$/);
  if (!m) return san;
  const [, piece, from, capture, to, promo] = m;
  const who = piece ? PIECE[piece] : from ? from.toUpperCase() : "";
  const disambiguation = piece && from ? ` ${from.split("").map((c) => c.toUpperCase()).join(" ")}` : "";
  const action = capture ? " takes " : piece ? " " : "";
  const promotion = promo ? `, promotes to ${PIECE[promo]}` : "";
  return `${who}${disambiguation}${action}${square(to)}${promotion}${suffix}`.trim();
}

/** "+1.3" → "plus 1 point 3", "-0.4" → "minus 0 point 4", "+6.0" → "plus 6". */
function evalToSpeech(sign: string, whole: string, frac: string): string {
  const word = sign === "-" ? "minus" : "plus";
  return frac && frac !== "0" ? `${word} ${whole} point ${frac}` : `${word} ${whole}`;
}

// A move written in algebraic notation inside a sentence: "Qf6", "exd5", "Nxe5+", "O-O", "e8=Q".
const SAN_IN_TEXT = /(?<![\w-])(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w-])/g;

/** Makes the commentary sound right when spoken: moves read like moves ("Qf6" → "Queen F 6"),
 * evaluations as numbers ("(+1.3)" → "plus 1 point 3"), and the opening code is left out. */
export function commentaryToSpeech(text: string): string {
  return text
    .replace(/\s*\([A-E]\d{2}\)/g, "") // "(B20)" opening codes aren't worth reading
    .replace(/\(?([+-])(\d+)\.(\d)\)?/g, (_, sign: string, whole: string, frac: string) => evalToSpeech(sign, whole, frac))
    .replace(SAN_IN_TEXT, (san) => sanToSpeech(san))
    .replace(/\s+/g, " ")
    .trim();
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Neural/"natural" voices sound far more human than the classic system ones.
import { chooseVoice, englishVoices as pickEnglish, type AccentChoice, type VoiceChoice } from "./voices.ts";
import { personaOf, type PersonaId } from "./personas.ts";

let cachedVoices: SpeechSynthesisVoice[] = [];

/** Every voice the device offers. The same array is returned until the list changes, so it can be
 * used as a React snapshot. */
export function allVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return cachedVoices;
  const list = window.speechSynthesis.getVoices();
  if (list.length !== cachedVoices.length || list.some((v, i) => v !== cachedVoices[i])) cachedVoices = list;
  return cachedVoices;
}

/** English voices, best-sounding first. */
export function englishVoices(): SpeechSynthesisVoice[] {
  return pickEnglish(allVoices());
}

/** Calls back whenever the browser's voice list changes (it loads asynchronously). */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

// How the commentary should sound: a specific voice if the viewer picked one, otherwise the accent and
// the persona decide (see chooseVoice).
let style: { voiceURI: string | null; accent: AccentChoice; persona: PersonaId } = { voiceURI: null, accent: "auto", persona: "analyst" };

export function setSpeechStyle(next: Partial<typeof style>): void {
  style = { ...style, ...next };
}

/** The voice that would be used right now, and whether the requested accent was unavailable. */
export function currentVoice(): VoiceChoice<SpeechSynthesisVoice> {
  return chooseVoice(allVoices(), style);
}

// Whether something is being spoken right now, so autoplay can wait for the end of a comment.
let speaking = false;
let utteranceId = 0;
const speakingListeners = new Set<() => void>();
function setSpeaking(value: boolean) {
  if (speaking === value) return;
  speaking = value;
  speakingListeners.forEach((l) => l());
}
export const subscribeSpeaking = (listener: () => void) => {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
};
export const isSpeaking = () => speaking;

export function say(text: string): void {
  if (!speechSupported()) return;
  const { voice } = currentVoice();
  const persona = personaOf(style.persona);
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    // A multilingual voice (listed as German, French…) reads English best when told it is English.
    u.lang = /^en/i.test(voice.lang) ? voice.lang : "en-US";
  }
  u.rate = persona.rate;
  u.pitch = persona.pitch;
  // A newer utterance replaces this one, so only the latest one may clear the "speaking" flag.
  const id = ++utteranceId;
  const done = () => {
    if (id === utteranceId) setSpeaking(false);
  };
  u.onend = done;
  u.onerror = done;
  setSpeaking(true);
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  utteranceId++;
  window.speechSynthesis.cancel();
  setSpeaking(false);
}
