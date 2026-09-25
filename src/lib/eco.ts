// Groups ECO codes into opening families ("Sicilian Defense", "Ruy Lopez").
// Lichess, Chess.com and the legends' PGNs all carry an ECO code, so grouping by
// family keeps repertoire stats comparable across sources. Ranges follow the
// standard ECO classification; a few codes span more than one opening, so the
// family is the most common one for that code.
const RANGES: [from: string, to: string, family: string][] = [
  ["A00", "A00", "Irregular Opening"],
  ["A01", "A01", "Nimzo-Larsen Attack"],
  ["A02", "A03", "Bird's Opening"],
  ["A04", "A09", "Réti Opening"],
  ["A10", "A39", "English Opening"],
  ["A40", "A41", "Queen's Pawn Game"],
  ["A42", "A42", "Modern Defense"],
  ["A43", "A44", "Old Benoni Defense"],
  ["A45", "A50", "Queen's Pawn Game"],
  ["A51", "A52", "Budapest Gambit"],
  ["A53", "A55", "Old Indian Defense"],
  ["A56", "A56", "Benoni Defense"],
  ["A57", "A59", "Benko Gambit"],
  ["A60", "A79", "Benoni Defense"],
  ["A80", "A99", "Dutch Defense"],
  ["B00", "B00", "King's Pawn Opening"],
  ["B01", "B01", "Scandinavian Defense"],
  ["B02", "B05", "Alekhine's Defense"],
  ["B06", "B06", "Modern Defense"],
  ["B07", "B09", "Pirc Defense"],
  ["B10", "B19", "Caro-Kann Defense"],
  ["B20", "B99", "Sicilian Defense"],
  ["C00", "C19", "French Defense"],
  ["C20", "C20", "King's Pawn Game"],
  ["C21", "C22", "Center Game"],
  ["C23", "C24", "Bishop's Opening"],
  ["C25", "C29", "Vienna Game"],
  ["C30", "C39", "King's Gambit"],
  ["C40", "C40", "King's Knight Opening"],
  ["C41", "C41", "Philidor Defense"],
  ["C42", "C43", "Petrov's Defense"],
  ["C44", "C45", "Scotch Game"],
  ["C46", "C49", "Four Knights Game"],
  ["C50", "C54", "Italian Game"],
  ["C55", "C59", "Two Knights Defense"],
  ["C60", "C99", "Ruy Lopez"],
  ["D00", "D05", "Queen's Pawn Game"],
  ["D06", "D06", "Queen's Gambit"],
  ["D07", "D07", "Chigorin Defense"],
  ["D08", "D09", "Albin Countergambit"],
  ["D10", "D19", "Slav Defense"],
  ["D20", "D29", "Queen's Gambit Accepted"],
  ["D30", "D42", "Queen's Gambit Declined"],
  ["D43", "D49", "Semi-Slav Defense"],
  ["D50", "D69", "Queen's Gambit Declined"],
  ["D70", "D99", "Grünfeld Defense"],
  ["E00", "E10", "Catalan / Queen's Pawn"],
  ["E11", "E11", "Bogo-Indian Defense"],
  ["E12", "E19", "Queen's Indian Defense"],
  ["E20", "E59", "Nimzo-Indian Defense"],
  ["E60", "E99", "King's Indian Defense"],
];

export function ecoFamily(eco: string | null | undefined): string | null {
  const code = (eco ?? "").trim().toUpperCase();
  if (!/^[A-E]\d\d$/.test(code)) return null;
  for (const [from, to, family] of RANGES) {
    if (code >= from && code <= to) return family;
  }
  return null;
}
