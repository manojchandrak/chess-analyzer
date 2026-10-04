// Choosing a speech voice: which voices count as natural-sounding, which accent each one has, and which
// voice suits the commentator persona. Pure functions over a list of voices, so they can be tested without a browser.
import { personaOf, type Persona } from "./personas.ts";

export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI: string;
  default?: boolean;
}

export type AccentId = "us" | "gb" | "au" | "ie" | "in" | "za" | "ca" | "nz" | "eu";
export type AccentChoice = AccentId | "auto";

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: "us", label: "American" },
  { id: "gb", label: "British" },
  { id: "au", label: "Australian" },
  { id: "ie", label: "Irish" },
  { id: "in", label: "Indian" },
  { id: "za", label: "South African" },
  { id: "ca", label: "Canadian" },
  { id: "nz", label: "New Zealand" },
  { id: "eu", label: "European" },
];

export const accentLabel = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.label ?? id;
export const isAccent = (id: unknown): id is AccentId => ACCENTS.some((a) => a.id === id);

// Languages whose voices, reading English, give a European accent.
const EUROPEAN_LANG = /^(de|fr|es|it|nl|sv|da|nb|no|fi|pl|pt|cs|el|hu|ro|ru|uk|sk|hr|bg)[-_]/i;

/** The accent a voice speaks English with, or null when it isn't usable for English commentary. */
export function accentOf(v: VoiceInfo): AccentId | null {
  const lang = v.lang.replace("_", "-");
  if (/^en-US/i.test(lang)) return "us";
  if (/^en-(GB|scotland)/i.test(lang)) return "gb";
  if (/^en-AU/i.test(lang)) return "au";
  if (/^en-IE/i.test(lang)) return "ie";
  if (/^en-IN/i.test(lang)) return "in";
  if (/^en-ZA/i.test(lang)) return "za";
  if (/^en-CA/i.test(lang)) return "ca";
  if (/^en-NZ/i.test(lang)) return "nz";
  if (/^en/i.test(lang)) return "us"; // other English variants (en-SG, en-PH…) read closest to American
  if (EUROPEAN_LANG.test(lang) && !NOVELTY.test(v.name)) return "eu";
  return null;
}

// Neural/"natural" voices sound far more human than the classic system ones.
const QUALITY: [RegExp, number][] = [
  [/natural|neural|online/i, 50], // Microsoft Edge "… Online (Natural)"
  [/premium|enhanced|siri/i, 40], // Apple downloadable voices
  [/google/i, 30], // Chrome's Google voices
  [/\b(ava|samantha|allison|susan|serena|karen|moira|tessa|daniel|aria|jenny|guy|libby|sonia|emma|brian|ryan|davis|tony|oliver)\b/i, 15],
  [/^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i, -20], // Apple's Eloquence voices sound synthetic
  [/compact|espeak|zira|david|mark/i, -40],
];

// Apple's novelty voices (a bleating sheep, a pipe organ…) aren't offered at all.
export const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|fred)\b/i;

/** How natural a voice is likely to sound (higher is better). */
export function voiceQuality(v: VoiceInfo): number {
  let s = 0;
  for (const [re, pts] of QUALITY) if (re.test(v.name)) s += pts;
  if (v.default) s += 2;
  // Multilingual voices read English well even though their language is listed as German, French…
  if (accentOf(v) === "eu" && /multilingual/i.test(v.name)) s += 40;
  return s;
}

/** A voice scored for plain English use: US/UK first, then other English, never other languages. */
export function englishScore(v: VoiceInfo): number {
  let s = voiceQuality(v);
  if (/^en[-_]US/i.test(v.lang)) s += 10;
  else if (/^en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 8;
  else if (/^en/i.test(v.lang)) s += 5;
  else s -= 100;
  return s;
}

const byQuality = (a: VoiceInfo, b: VoiceInfo) => voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name);
const usable = <T extends VoiceInfo>(voices: T[]): T[] => voices.filter((v) => !NOVELTY.test(v.name));

/** English voices, best-sounding first. */
export function englishVoices<T extends VoiceInfo>(voices: T[]): T[] {
  return usable(voices)
    .filter((v) => /^en/i.test(v.lang))
    .sort((a, b) => englishScore(b) - englishScore(a) || a.name.localeCompare(b.name));
}

/** The voices speaking with a given accent, best first. */
export function voicesForAccent<T extends VoiceInfo>(voices: T[], accent: AccentId): T[] {
  return usable(voices).filter((v) => accentOf(v) === accent).sort(byQuality);
}

/** The accents this device can speak, each with its best voice, in the usual order. */
export function availableAccents<T extends VoiceInfo>(voices: T[]): { id: AccentId; label: string; count: number; best: T }[] {
  return ACCENTS.flatMap((a) => {
    const list = voicesForAccent(voices, a.id);
    return list.length ? [{ id: a.id, label: a.label, count: list.length, best: list[0] }] : [];
  });
}

export interface VoiceChoice<T extends VoiceInfo> {
  voice: T | undefined;
  /** The accent actually used (may differ from the request when the device has no such voice). */
  accent: AccentId | null;
  /** True when the requested accent isn't available on this device. */
  fellBack: boolean;
}

/** Picks the voice: one chosen by name wins; otherwise the best voice in the wanted accent that suits the
 * persona (the persona's own accent when none is chosen); otherwise the best English voice. */
export function chooseVoice<T extends VoiceInfo>(voices: T[], opts: { voiceURI?: string | null; accent?: AccentChoice; persona?: Persona | string }): VoiceChoice<T> {
  const persona = typeof opts.persona === "string" || opts.persona === undefined ? personaOf(opts.persona) : opts.persona;
  const picked = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : undefined;
  if (picked) return { voice: picked, accent: accentOf(picked), fellBack: false };

  const wanted: AccentId = opts.accent && opts.accent !== "auto" ? opts.accent : (persona.accent as AccentId);
  const pool = voicesForAccent(voices, wanted);
  if (pool.length) {
    const suited = pool.find((v) => persona.voiceNames.some((re) => re.test(v.name)));
    return { voice: suited ?? pool[0], accent: wanted, fellBack: false };
  }
  const fallback = englishVoices(voices);
  const suited = fallback.find((v) => persona.voiceNames.some((re) => re.test(v.name)));
  const voice = suited ?? fallback[0];
  return { voice, accent: voice ? accentOf(voice) : null, fellBack: !!opts.accent && opts.accent !== "auto" };
}

/** A voice name without the vendor prefix and the "Online (Natural)" tail, for display. */
export function shortVoiceName(name: string): string {
  return name.replace(/^Microsoft /, "").replace(/ Online \(Natural\)/, "").replace(/ - .*$/, "");
}

/** Whether a voice is likely to sound natural (neural/premium) rather than robotic. */
export const isNaturalVoice = (v: VoiceInfo) => voiceQuality(v) >= 40;
