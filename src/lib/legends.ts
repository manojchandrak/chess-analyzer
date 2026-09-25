// The legendary players bundled with the app. Games come from PGN Mentor's
// player collections (pgnmentor.com/players); scripts/build-legends.ts turns
// them into public/legends/*.json.

export interface LegendMeta {
  id: string;
  name: string;
  years: string;
  title: string;
  /** What the player is famous for, in a few words. */
  knownFor: string;
  blurb: string;
  /** Matches the player's name as written in the collection's White/Black tags. */
  namePattern: RegExp;
  /** Well-known games to feature, found by opponent and year. */
  famous: { title: string; opponent: RegExp; year: string }[];
}

export const LEGENDS: LegendMeta[] = [
  {
    id: "morphy",
    name: "Paul Morphy",
    years: "1837–1884",
    title: "Unofficial world's best player, 1858",
    knownFor: "Rapid development & open lines",
    blurb: "Decades ahead of his time on development and open lines: he brought pieces out fast, opened the position and punished opponents who didn't.",
    namePattern: /^Morphy,\s*Paul/i,
    famous: [{ title: "The Opera Game", opponent: /Brunswick|Isouard|Duke|Allies/i, year: "1858" }],
  },
  {
    id: "steinitz",
    name: "Wilhelm Steinitz",
    years: "1836–1900",
    title: "1st World Champion, 1886–1894",
    knownFor: "Positional theory & tenacious defense",
    blurb: "Founder of positional theory: accumulate small advantages, defend soundly, and attack only when the position justifies it.",
    namePattern: /^Steinitz,\s*W/i,
    famous: [{ title: "Hastings 1895 brilliancy", opponent: /Bardeleben/i, year: "1895" }],
  },
  {
    id: "lasker",
    name: "Emanuel Lasker",
    years: "1868–1941",
    title: "2nd World Champion, 1894–1921",
    knownFor: "Pragmatic fighting chess",
    blurb: "A pragmatic fighter who played the opponent as much as the board, famous for resourceful defense and choosing uncomfortable positions for the other side.",
    namePattern: /^Lasker,\s*Em(anuel)?\s*$/i,
    famous: [{ title: "The double bishop sacrifice", opponent: /Bauer/i, year: "1889" }],
  },
  {
    id: "capablanca",
    name: "José Raúl Capablanca",
    years: "1888–1942",
    title: "3rd World Champion, 1921–1927",
    knownFor: "Simplicity & endgame technique",
    blurb: "Crystal-clear simplicity: he traded into endgames he understood better than anyone and converted with almost no visible effort.",
    namePattern: /^Capablanca/i,
    famous: [{ title: "Refuting the Marshall Attack", opponent: /Marshall/i, year: "1918" }],
  },
  {
    id: "alekhine",
    name: "Alexander Alekhine",
    years: "1892–1946",
    title: "4th World Champion, 1927–1935, 1937–1946",
    knownFor: "Combinational attacks",
    blurb: "Combinational genius with deep preparation, building complex attacks where tactics flowed from positional pressure.",
    namePattern: /^Alekhine,\s*A/i,
    famous: [{ title: "Baden-Baden 1925 combination", opponent: /Reti/i, year: "1925" }],
  },
  {
    id: "botvinnik",
    name: "Mikhail Botvinnik",
    years: "1911–1995",
    title: "6th World Champion, 1948–1957, 1958–1960, 1961–1963",
    knownFor: "Scientific preparation",
    blurb: "The scientist of the Soviet school: rigorous preparation, strategic clarity and deep opening systems he knew inside out.",
    namePattern: /^Botvinnik/i,
    famous: [{ title: "AVRO 1938 masterpiece", opponent: /Capablanca/i, year: "1938" }],
  },
  {
    id: "tal",
    name: "Mikhail Tal",
    years: "1936–1992",
    title: "8th World Champion, 1960–1961",
    knownFor: "Sacrificial attacks",
    blurb: "The Magician from Riga: intuitive sacrifices that created chaos opponents couldn't calculate their way out of.",
    namePattern: /^Tal,\s*Mi/i,
    famous: [{ title: "Candidates 1965 knight sacrifice", opponent: /Larsen/i, year: "1965" }],
  },
  {
    id: "petrosian",
    name: "Tigran Petrosian",
    years: "1929–1984",
    title: "9th World Champion, 1963–1969",
    knownFor: "Prophylaxis",
    blurb: "Master of prophylaxis: he stopped the opponent's plans before they started and used positional exchange sacrifices to kill counterplay.",
    namePattern: /^Petrosian,\s*T/i,
    famous: [{ title: "1966 World Championship win", opponent: /Spassky/i, year: "1966" }],
  },
  {
    id: "fischer",
    name: "Bobby Fischer",
    years: "1943–2008",
    title: "11th World Champion, 1972–1975",
    knownFor: "Clarity & precision",
    blurb: "Uncompromising clarity and energy: 1.e4 'best by test', the Najdorf, and relentless play for a win in every game.",
    namePattern: /^Fischer,\s*R/i,
    famous: [{ title: "The Game of the Century", opponent: /Byrne,\s*D/i, year: "1956" }],
  },
  {
    id: "karpov",
    name: "Anatoly Karpov",
    years: "b. 1951",
    title: "12th World Champion, 1975–1985",
    knownFor: "Positional squeeze",
    blurb: "The boa constrictor: small, lasting advantages, restricted counterplay and a slow squeeze until the position collapses.",
    namePattern: /^Karpov,\s*An/i,
    famous: [{ title: "Nice Olympiad 1974 squeeze", opponent: /Unzicker/i, year: "1974" }],
  },
  {
    id: "kasparov",
    name: "Garry Kasparov",
    years: "b. 1963",
    title: "13th World Champion, 1985–2000",
    knownFor: "Dynamic initiative",
    blurb: "Dynamic initiative backed by the deepest opening preparation of his era: he fought for the initiative from the first moves.",
    namePattern: /^Kasparov,\s*(Gary|Garry|G\.?)\s*$/i,
    famous: [{ title: "Kasparov's Immortal", opponent: /Topalov/i, year: "1999" }],
  },
  {
    id: "carlsen",
    name: "Magnus Carlsen",
    years: "b. 1990",
    title: "16th World Champion, 2013–2023",
    knownFor: "Universal endgame grinding",
    blurb: "Universal and relentless: happy in any position, he grinds out tiny endgame edges that others would have agreed drawn.",
    namePattern: /^Carlsen,\s*M/i,
    famous: [{ title: "Beating Anand for the title", opponent: /Anand/i, year: "2013" }],
  },
];

/** Events that were blitz, bullet, rapid or online. Legend profiles use
 * over-the-board classical games when there are enough of them. */
export const FAST_EVENT = /blitz|bullet|speed|rapid|banter|titled|armageddon|online|chess\.com|lichess|chess24|960|fischer random|lightning|simul|blindfold|exhib|internet|icc|playchess|clock/i;

/** Row layout of public/legends/<id>.json games (arrays keep the file small). */
export type LegendGameRow = [
  white: string,
  black: string,
  result: string,
  date: string | null,
  event: string | null,
  eco: string | null,
  whiteElo: number | null,
  blackElo: number | null,
  moves: string,
  fast: 0 | 1,
  /** The legend's color in this game. */
  color: "w" | "b",
];

export interface LegendIndexEntry {
  id: string;
  name: string;
  years: string;
  title: string;
  knownFor: string;
  blurb: string;
  games: number;
  profileGames: number;
  profileBasis: "classical" | "all";
  profile: import("./profile.ts").Profile;
  famous: { title: string; index: number }[];
}
