// The drills: opening lines to play from memory, middlegame tactics and
// endgame technique against Stockfish. Positions are checked by
// scripts/check-drills.ts, which replays every line and plays every position
// through with the engine at the depth the app grades at.

export type DrillPhase = "opening" | "middlegame" | "endgame";

interface DrillBase {
  id: string;
  phase: DrillPhase;
  title: string;
  /** Short label for the pattern or idea being practised. */
  theme: string;
  /** Which side you play. */
  side: "w" | "b";
}

/** An opening line to reproduce move by move; the other side's moves are played for you. */
export interface LineDrill extends DrillBase {
  kind: "line";
  /** SAN moves from the starting position. */
  moves: string[];
  /** Explanations shown once the move at that index (0 = White's first) is on the board. */
  notes: Record<number, string>;
}

/** What finishes a position drill successfully. */
export type Goal =
  /** Deliver checkmate within the move budget. */
  | "mate"
  /** Promote a pawn within the move budget (and stay winning), or win all the
   * opponent's pieces while keeping a rook or queen. */
  | "promote"
  /** Play the budgeted number of moves without letting the advantage slip. */
  | "win"
  /** Survive the budgeted number of moves without losing (or reach a draw). */
  | "hold";

/** A position played out against Stockfish. Each of your moves is graded by
 * the engine and taken back if it spoils the position. */
export interface PositionDrill extends DrillBase {
  kind: "position";
  fen: string;
  goal: Goal;
  /** How many of your moves you get. */
  moves: number;
  /**
   * How a move is judged:
   * - "best": must stay within `tol` centipawns of the engine's best move, or
   *   keep a forced mate that still fits in the move budget;
   * - "keep": your eval must stay at least `min` centipawns (negative for a
   *   defence that must just not lose).
   */
  grade: { mode: "best"; tol: number } | { mode: "keep"; min: number };
  /** What to find, shown before you move. */
  prompt: string;
  /** The idea, shown once the drill is over. */
  lesson: string;
  /** The intended line (SAN, both sides), used for hints while the game
   * follows it. Needed where the engine prefers a different route. */
  solution?: string[];
}

export type Drill = LineDrill | PositionDrill;

const line = (d: Omit<LineDrill, "kind" | "phase" | "moves"> & { moves: string }): LineDrill => ({ ...d, kind: "line", phase: "opening", moves: d.moves.split(" ") });

export const OPENING_DRILLS: LineDrill[] = [
  line({
    id: "italian-pianissimo",
    title: "Italian Game: Giuoco Pianissimo",
    theme: "1.e4 e5 for White",
    side: "w",
    moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 Nbd2",
    notes: {
      2: "Develop with a threat: the knight attacks e5.",
      4: "The bishop eyes f7, the weakest square in Black's camp.",
      6: "c3 prepares d4 and gives the bishop a retreat square.",
      8: "The modern, slow approach: keep the centre solid and manoeuvre behind it.",
      12: "The rook supports e4 and makes room for the knight's trip to f1.",
      14: "Tucks the bishop away before ...b5 or ...d5 can hit it.",
      16: "Heading for f1 and g3: the typical Italian regrouping.",
    },
  }),
  line({
    id: "ruy-lopez-closed",
    title: "Ruy Lopez: Closed",
    theme: "1.e4 e5 for White",
    side: "w",
    moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
    notes: {
      4: "Pressure on the knight that defends e5.",
      6: "Keep the pin going; Bxc6 is always an option later.",
      8: "Castling first: ...Nxe4 would run into Re1 and the pin on the e-file.",
      10: "Now e4 is protected, and Bxc6 followed by Nxe5 is a real threat.",
      14: "Makes room for the bishop on c2 and prepares d4.",
      16: "Stops ...Bg4 pinning the knight before White plays d4.",
    },
  }),
  line({
    id: "scotch",
    title: "Scotch Game",
    theme: "1.e4 e5 for White",
    side: "w",
    moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4",
    notes: {
      4: "Open the centre straight away.",
      6: "White has a knight in the centre and free development.",
      8: "Meet the bishop's pressure on d4 by defending with a developing move.",
      10: "c3 holds d4 solidly, so the knight isn't pinned against f2 by tactics.",
      12: "Every piece heads for a useful square; the bishop hits f7.",
    },
  }),
  line({
    id: "qgd-capablanca",
    title: "Queen's Gambit Declined: Orthodox",
    theme: "1.d4 for White",
    side: "w",
    moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5",
    notes: {
      2: "The Queen's Gambit: c4 challenges d5 to win the centre.",
      6: "Pins the knight that defends d5.",
      12: "The rook on the c-file supports pressure once the c-file opens.",
      16: "White recaptures having kept a lead in development.",
      17: "Capablanca's freeing idea: Black trades pieces to relieve the cramp.",
    },
  }),
  line({
    id: "london",
    title: "London System",
    theme: "1.d4 for White",
    side: "w",
    moves: "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3",
    notes: {
      2: "The London bishop gets outside the pawn chain before e3 shuts it in.",
      8: "The d4/e3/c3 pyramid keeps the centre rock-solid against ...c5.",
      12: "Keep the good bishop. If ...Bxg3, hxg3 opens the h-file for the rook.",
      14: "Both bishops aim at Black's king; Ne5 is a typical follow-up.",
    },
  }),
  line({
    id: "najdorf-english",
    title: "Sicilian Najdorf: English Attack",
    theme: "Against 1.e4 as Black",
    side: "b",
    moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5",
    notes: {
      1: "The Sicilian: an unbalanced fight for d4 from the flank.",
      5: "Trade a flank pawn for White's centre pawn: the point of the Sicilian.",
      9: "The Najdorf move: controls b5 and prepares ...e5 and ...b5.",
      11: "Kicks the knight away and grabs space; d5 becomes the key square.",
      13: "The bishop fights for d5.",
      21: "Castled on opposite sides, both players race their pawns at the enemy king.",
    },
  }),
  line({
    id: "caro-kann-classical",
    title: "Caro-Kann: Classical",
    theme: "Against 1.e4 as Black",
    side: "b",
    moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6",
    notes: {
      1: "Prepares ...d5 with the c-pawn backing it up.",
      7: "The light-squared bishop comes out before ...e6 locks it in.",
      11: "When h5 comes, the bishop will have h7 to retreat to instead of being trapped.",
      17: "Trade off the bishop rather than let it be hunted.",
      19: "A solid, compact structure that is famously hard to break down.",
    },
  }),
  line({
    id: "french-advance",
    title: "French Defence: Advance",
    theme: "Against 1.e4 as Black",
    side: "b",
    moves: "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5",
    notes: {
      5: "Strike at the base of White's pawn chain on d4.",
      9: "Pile up on d4 and hit b2 at the same time.",
      11: "White wanted b4; ...c4 fixes the queenside and hands the knight b3.",
      13: "The knight heads for b3.",
    },
  }),
  line({
    id: "scandinavian",
    title: "Scandinavian Defence",
    theme: "Against 1.e4 as Black",
    side: "b",
    moves: "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6",
    notes: {
      1: "Challenge e4 immediately.",
      5: "The queen steps aside to a5, where it pins down the c3 knight's diagonal.",
      9: "Gives the queen a retreat and controls d5.",
      11: "The bishop develops before ...e6 locks it in.",
    },
  }),
  line({
    id: "kings-indian",
    title: "King's Indian: Classical",
    theme: "Against 1.d4 as Black",
    side: "b",
    moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
    notes: {
      3: "Fianchetto: let White build a centre, then attack it.",
      11: "The key King's Indian break.",
      15: "With the centre closed, the knight reroutes to support ...f5 and a kingside attack.",
    },
  }),
  line({
    id: "qgd-tartakower",
    title: "Queen's Gambit Declined: Tartakower",
    theme: "Against 1.d4 as Black",
    side: "b",
    moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6",
    notes: {
      3: "Declining the gambit: d5 stays supported.",
      11: "Ask the bishop a question before committing.",
      13: "The Tartakower: the light-squared bishop will come to b7.",
    },
  }),
];

export const MIDDLEGAME_DRILLS: PositionDrill[] = [
  {
    id: "back-rank",
    kind: "position",
    phase: "middlegame",
    title: "Back-rank mate",
    theme: "Mate",
    side: "w",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    goal: "mate",
    moves: 1,
    grade: { mode: "best", tol: 0 },
    prompt: "White to move and mate in 1.",
    lesson: "Black's own pawns box the king in. Always give your king an escape square (luft) and watch for this against your opponent.",
  },
  {
    id: "arabian-mate",
    kind: "position",
    phase: "middlegame",
    title: "Arabian mate",
    theme: "Mate",
    side: "w",
    fen: "7k/7p/5N2/8/8/8/8/6RK w - - 0 1",
    goal: "mate",
    moves: 1,
    grade: { mode: "best", tol: 0 },
    prompt: "White to move and mate in 1.",
    lesson: "The knight on f6 guards both g8 and h7, so a rook check on the back rank is mate. One of the oldest mating patterns.",
  },
  {
    id: "anastasia-mate",
    kind: "position",
    phase: "middlegame",
    title: "Anastasia's mate",
    theme: "Mate",
    side: "w",
    fen: "5r2/4Nppk/8/8/8/8/8/K2R4 w - - 0 1",
    goal: "mate",
    moves: 1,
    grade: { mode: "best", tol: 0 },
    prompt: "White to move and mate in 1.",
    lesson: "The knight on e7 takes g6 and g8, the king's own pawn blocks g7, and a rook on the h-file finishes it.",
  },
  {
    id: "smothered-mate",
    kind: "position",
    phase: "middlegame",
    title: "Smothered mate (Philidor's legacy)",
    theme: "Mate",
    side: "w",
    fen: "5r1k/6pp/8/6N1/8/1Q6/8/6K1 w - - 0 1",
    goal: "mate",
    moves: 4,
    grade: { mode: "best", tol: 0 },
    solution: ["Nf7+", "Kg8", "Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"],
    prompt: "White to move and mate in 4.",
    lesson: "Nf7+, Nh6+ (double check), Qg8+! and Rxg8 blocks the king's last square: Nf7 mates a king smothered by its own pieces.",
  },
  {
    id: "royal-fork",
    kind: "position",
    phase: "middlegame",
    title: "Knight fork",
    theme: "Fork",
    side: "w",
    fen: "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win material.",
    lesson: "Nxc7+ hits the king and the a8 rook at once. Look for knight checks that land on squares attacking two targets.",
  },
  {
    id: "queen-fork",
    kind: "position",
    phase: "middlegame",
    title: "Queen fork",
    theme: "Fork",
    side: "w",
    fen: "4k3/8/8/7r/8/8/5PPP/3Q2K1 w - - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win the rook.",
    lesson: "Qe2+ checks along the e-file and hits the loose rook on h5 along the diagonal. Loose pieces drop off.",
  },
  {
    id: "skewer",
    kind: "position",
    phase: "middlegame",
    title: "Skewer",
    theme: "Skewer",
    side: "w",
    fen: "8/8/8/4k2q/8/8/8/R3K3 w - - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win the queen.",
    lesson: "Ra5+ checks the king, which has to step off the fifth rank, exposing the queen behind it.",
  },
  {
    id: "discovered-check",
    kind: "position",
    phase: "middlegame",
    title: "Discovered check",
    theme: "Discovered attack",
    side: "w",
    fen: "q3k3/1p6/8/8/4B3/8/8/4RK2 w - - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win the queen.",
    lesson: "Moving the bishop off the e-file uncovers check from the rook, so the bishop can go wherever it likes: Bxb7+ and Bxa8.",
  },
  {
    id: "pin",
    kind: "position",
    phase: "middlegame",
    title: "Attack the pinned piece",
    theme: "Pin",
    side: "w",
    fen: "4k3/8/3p4/4n3/8/8/5P2/4R1K1 w - - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win the knight.",
    lesson: "The knight is pinned to the king and can't move. Attack it with a pawn: f4 and fxe5 wins a piece for a pawn.",
  },
  {
    id: "deflection",
    kind: "position",
    phase: "middlegame",
    title: "Deflection on the back rank",
    theme: "Deflection",
    side: "w",
    fen: "6k1/4qppp/8/8/8/8/1Q3PPP/3R2K1 w - - 0 1",
    goal: "win",
    moves: 2,
    grade: { mode: "best", tol: 100 },
    prompt: "White to move and win decisive material.",
    lesson: "Qb8+ forces the queen back to f8, where it has to guard the back rank. Rd8 then pins and wins it.",
  },
];

export const ENDGAME_DRILLS: PositionDrill[] = [
  {
    id: "kqk",
    kind: "position",
    phase: "endgame",
    title: "Queen mate",
    theme: "Basic mate",
    side: "w",
    fen: "8/8/8/4k3/8/8/8/3QK3 w - - 0 1",
    goal: "mate",
    moves: 12,
    grade: { mode: "keep", min: 500 },
    prompt: "Checkmate within 12 moves. Beware of stalemate!",
    lesson: "Use the queen a knight's move away from the king to shrink its box, then bring your own king up to help. Always check the king has a legal move before each queen move.",
  },
  {
    id: "krk",
    kind: "position",
    phase: "endgame",
    title: "Rook mate",
    theme: "Basic mate",
    side: "w",
    fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1",
    goal: "mate",
    moves: 20,
    grade: { mode: "keep", min: 400 },
    prompt: "Checkmate within 20 moves.",
    lesson: "Cut the king off with the rook, walk your king up to face it (opposition), then check along the edge. Use waiting moves with the rook to gain the opposition.",
  },
  {
    id: "king-sixth",
    kind: "position",
    phase: "endgame",
    title: "King in front of the pawn",
    theme: "King and pawn",
    side: "w",
    fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
    goal: "promote",
    moves: 6,
    grade: { mode: "keep", min: 400 },
    prompt: "Promote the pawn. Don't let it end in stalemate.",
    lesson: "With your king on the sixth rank in front of a (non-rook) pawn, you win no matter who moves. Lead with the king, not the pawn.",
  },
  {
    id: "opposition",
    kind: "position",
    phase: "endgame",
    title: "Taking the opposition",
    theme: "King and pawn",
    side: "w",
    fen: "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1",
    goal: "promote",
    moves: 14,
    grade: { mode: "keep", min: 300 },
    prompt: "Win by promoting the pawn. Get your king in front of it first.",
    lesson: "Kings first: reach the key squares in front of the pawn. The spare pawn move (e2-e3) lets you win the opposition when kings face each other.",
  },
  {
    id: "rule-of-square",
    kind: "position",
    phase: "endgame",
    title: "Rule of the square",
    theme: "King and pawn",
    side: "w",
    fen: "7k/8/8/8/1p6/8/8/5K2 w - - 0 1",
    goal: "hold",
    moves: 5,
    grade: { mode: "keep", min: -150 },
    prompt: "Stop the b-pawn from queening.",
    lesson: "Picture the square from the pawn to its queening rank (b4-b1-e1-e4). If your king can step into it, you catch the pawn.",
  },
  {
    id: "breakthrough",
    kind: "position",
    phase: "endgame",
    title: "Pawn breakthrough",
    theme: "Pawn endgame",
    side: "w",
    fen: "7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1",
    goal: "promote",
    moves: 6,
    grade: { mode: "best", tol: 100 },
    prompt: "The kings are far away. Make a queen.",
    lesson: "b6! If ...axb6 then c6, and if ...cxb6 then a6: one pawn always gets through. Count the kings' moves before trying it.",
  },
  {
    id: "lucena",
    kind: "position",
    phase: "endgame",
    title: "Lucena position: building a bridge",
    theme: "Rook endgame",
    side: "w",
    fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1",
    goal: "promote",
    moves: 12,
    grade: { mode: "keep", min: 200 },
    prompt: "Promote the pawn.",
    lesson: "Check the black king away (Rd1+), put the rook on the fourth rank (Rd4), then walk the king out: when the checks come, the rook blocks on the b-file.",
  },
  {
    id: "philidor",
    kind: "position",
    phase: "endgame",
    title: "Philidor position: the third-rank defence",
    theme: "Rook endgame",
    side: "b",
    fen: "4k3/R7/1r6/3KP3/8/8/8/8 w - - 0 1",
    goal: "hold",
    moves: 8,
    grade: { mode: "keep", min: -150 },
    prompt: "You're Black. Hold the draw.",
    lesson: "Keep your rook on your third rank so the white king can't come forward. Once the pawn advances to e6, swing the rook back and check from behind.",
  },
  {
    id: "hold-opposition",
    kind: "position",
    phase: "endgame",
    title: "Defending with the opposition",
    theme: "King and pawn",
    side: "b",
    fen: "8/8/4k3/8/4K3/4P3/8/8 w - - 0 1",
    goal: "hold",
    moves: 8,
    grade: { mode: "keep", min: -150 },
    prompt: "You're Black. Keep the white king out and hold the draw.",
    lesson: "Face the enemy king with one square between you (the opposition). When the pawn comes up, stay in front of it and retreat straight back.",
  },
];

export const DRILLS: Drill[] = [...OPENING_DRILLS, ...MIDDLEGAME_DRILLS, ...ENDGAME_DRILLS];
