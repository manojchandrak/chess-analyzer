// Reads moves aloud with the browser's built-in speech synthesis, using the most
// natural-sounding English voice the device offers (or the one the viewer picked).

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

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Neural/"natural" voices sound far more human than the classic system ones.
const QUALITY: [RegExp, number][] = [
  [/natural|neural|online/i, 50], // Microsoft Edge "… Online (Natural)"
  [/premium|enhanced|siri/i, 40], // Apple downloadable voices
  [/google/i, 30], // Chrome's Google voices
  [/\b(ava|samantha|allison|susan|serena|karen|moira|tessa|daniel|aria|jenny|guy|libby|sonia|emma|brian)\b/i, 15],
  [/^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i, -20], // Apple's Eloquence voices sound synthetic
  [/compact|espeak|zira|david|mark/i, -40],
];

// Apple's novelty voices (a bleating sheep, a pipe organ…) aren't offered at all.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|fred)\b/i;

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/^en[-_]US/i.test(v.lang)) s += 10;
  else if (/^en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 8;
  else if (/^en/i.test(v.lang)) s += 5;
  else s -= 100;
  for (const [re, pts] of QUALITY) if (re.test(v.name)) s += pts;
  if (v.default) s += 2;
  return s;
}

/** English voices, best-sounding first. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^en/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** Calls back whenever the browser's voice list changes (it loads asynchronously). */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

let preferredVoice: string | null = null;

/** The voice to use (by voiceURI); null picks the best available automatically. */
export function setPreferredVoice(uri: string | null): void {
  preferredVoice = uri;
}

export function say(text: string): void {
  if (!speechSupported()) return;
  const voices = englishVoices();
  const voice = voices.find((v) => v.voiceURI === preferredVoice) ?? voices[0];
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = 0.95;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
