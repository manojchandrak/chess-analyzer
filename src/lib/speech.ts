// Reads moves aloud with the browser's built-in speech synthesis.

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

export function say(text: string): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
