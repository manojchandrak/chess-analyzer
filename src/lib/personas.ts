// Commentator personas: a personality for the commentary (its wording) and a voice style (which kind of
// voice, how fast, what pitch). These are character types, not impersonations of real people.

export type PersonaId = "analyst" | "coach" | "commentator" | "master";

/** Wording for each kind of move verdict. {before} {after} {best} {opp} {fix} are filled in by the commentary. */
export interface PhraseSet {
  brilliant: string[];
  great: string[];
  best: string[];
  excellent: string[];
  good: string;
  /** A good move where the engine had something slightly better. */
  goodBest: string;
  book: string;
  inaccuracy: string;
  mistake: string;
  miss: string;
  blunder: string;
}

export interface Persona {
  id: PersonaId;
  label: string;
  description: string;
  /** A short line used to preview the voice. */
  sample: string;
  /** The accent this persona uses when none is chosen (an accent id from speech.ts). */
  accent: string;
  /** Voice names that suit the persona, tried in order within the chosen accent. */
  voiceNames: RegExp[];
  rate: number;
  pitch: number;
  phrases: PhraseSet;
}

export const PERSONAS: Persona[] = [
  {
    id: "analyst",
    label: "Calm analyst",
    description: "Measured and precise, like a good annotator.",
    sample: "Black stakes a claim in the center. A standard book move.",
    accent: "gb",
    voiceNames: [/\b(libby|sonia|serena|moira|tessa|karen|aria|jenny|samantha)\b/i],
    rate: 0.95,
    pitch: 1,
    phrases: {
      brilliant: ["A brilliant move! The material it gives up is more than repaid by the position.", "Brilliant! A sacrifice that the engine confirms is the strongest continuation."],
      great: ["A great move: the only one that keeps the position under control.", "Great find. Most other moves here would let the advantage slip."],
      best: ["The engine's top choice.", "Best by the engine.", "Exactly what the engine would play."],
      excellent: ["An excellent move, almost as good as the engine's first choice.", "Excellent: very close to the best move."],
      good: "A good, sound move.",
      goodBest: "A good move, though {best} was a little more precise.",
      book: "A standard book move.",
      inaccuracy: "A small inaccuracy.{fix}",
      mistake: "A mistake: the evaluation drops from {before} to {after}.{fix}",
      miss: "A missed chance: {opp}'s last move was a mistake, and this does not make the most of it.{fix}",
      blunder: "A blunder! The evaluation swings from {before} to {after}.{fix}",
    },
  },
  {
    id: "coach",
    label: "Friendly coach",
    description: "Encouraging, and points out what to learn from each move.",
    sample: "Nicely done! That's the engine's top choice, and a good habit to keep.",
    accent: "us",
    voiceNames: [/\b(ava|allison|jenny|samantha|susan|emma|aria|joanna|kendra)\b/i],
    rate: 1,
    pitch: 1.05,
    phrases: {
      brilliant: ["Wow, what a move! Giving up material here takes courage, and it pays off.", "Fantastic! A real brilliancy, and a lovely idea to remember."],
      great: ["Great find! Spotting the only move is exactly the skill to practice.", "Well spotted! Most players would miss that one."],
      best: ["Nicely done, that's the engine's top choice.", "That's the best move. Well played!", "Spot on, a good habit to keep."],
      excellent: ["Excellent move, nearly perfect.", "Very good, almost the engine's first choice."],
      good: "A good move.",
      goodBest: "A good move, though {best} was a bit stronger. Worth remembering.",
      book: "A standard book move, and a good habit.",
      inaccuracy: "A small slip, nothing to worry about.{fix}",
      mistake: "That's a mistake: the evaluation drops from {before} to {after}. It happens to everyone.{fix}",
      miss: "A missed chance. {opp}'s last move gave you something, so look for it next time.{fix}",
      blunder: "Ouch, that one's a blunder: the evaluation swings from {before} to {after}. Before each move, pause and check what your opponent threatens.{fix}",
    },
  },
  {
    id: "commentator",
    label: "Excited commentator",
    description: "High energy, like a live broadcast.",
    sample: "What a move! Absolutely brilliant, a sacrifice that works!",
    accent: "us",
    voiceNames: [/\b(guy|davis|tony|christopher|matthew|aaron|brian|alex|daniel)\b/i],
    rate: 1.08,
    pitch: 1.05,
    phrases: {
      brilliant: ["Brilliant! Absolutely brilliant! A sacrifice that works!", "What a move! Gives up material and the position backs it up!"],
      great: ["What a find! The only move, and it's played!", "Superb! The only move that holds, and it's found!"],
      best: ["Spot on! The engine's top choice.", "Perfect, that's the best move!", "Exactly right!"],
      excellent: ["Excellent! Almost perfect.", "Very sharp, nearly the best move!"],
      good: "Solid move.",
      goodBest: "Good, but {best} was even sharper.",
      book: "Straight out of the book.",
      inaccuracy: "Oh, a small inaccuracy.{fix}",
      mistake: "That's a mistake! The evaluation tumbles from {before} to {after}.{fix}",
      miss: "A missed opportunity! {opp}'s last move was a mistake, and this lets it slip.{fix}",
      blunder: "A blunder! Wow, the evaluation swings from {before} to {after}!{fix}",
    },
  },
  {
    id: "master",
    label: "Old-school master",
    description: "Formal and classical, like an annotator from the golden age.",
    sample: "A fine move, and the only one. The position demanded precision.",
    accent: "gb",
    voiceNames: [/\b(ryan|arthur|oliver|george|thomas|daniel|james|rishi|william)\b/i],
    rate: 0.88,
    pitch: 0.92,
    phrases: {
      brilliant: ["A magnificent stroke. The sacrifice is sound, and the position rewards it.", "Brilliant indeed. The sacrifice is justified by what follows."],
      great: ["A fine move, and the only one. The position demanded precision.", "The only move, and a fine one."],
      best: ["The correct move.", "Entirely correct.", "Just so."],
      excellent: ["An excellent move, very nearly the best.", "Excellent, and almost exact."],
      good: "A sound move.",
      goodBest: "A sound move, though {best} was more exact.",
      book: "Theory, as one would expect.",
      inaccuracy: "A slight imprecision.{fix}",
      mistake: "An error: the evaluation falls from {before} to {after}.{fix}",
      miss: "A missed chance: {opp}'s last move was an error, and this does not exploit it.{fix}",
      blunder: "A serious blunder. The evaluation collapses from {before} to {after}.{fix}",
    },
  },
];

export const DEFAULT_PERSONA: PersonaId = "analyst";

export const personaOf = (id: string | null | undefined): Persona => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
export const isPersona = (id: unknown): id is PersonaId => PERSONAS.some((p) => p.id === id);
