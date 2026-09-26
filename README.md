# Chess Game Analyzer

Load your games from Lichess and Chess.com to see your playing style and
where you can improve, compare yourself with 12 legendary players, and study
their games, upload any PGN for a Stockfish breakdown of accuracy by
opening/middlegame/endgame, or train each phase with drills. Everything runs
in your browser.

Live at: https://manojchandrak.github.io/chess-analyzer/

## Features

- **My games**: enter a Lichess and/or Chess.com username. Recent games load
  straight from each site's public API (no login, nothing sent anywhere else).
  - **Playing style**: five traits (aggression, sacrificial risk, endgame
    appetite, solidity, simplification) measured from the moves themselves,
    an overall archetype, and the legends whose style is closest to yours.
  - **Where to improve**: suggestions backed by your numbers, e.g. losses on
    time, weak openings, color imbalance, king safety, endgame results.
  - **Engine review**: Stockfish reviews your recent games (games Lichess
    already analyzed are used for free) to find your weakest phase, blunders
    that hang pieces, blunders under time pressure, and winning positions you
    didn't convert. Reviews are cached in your browser.
  - Filter everything by time control; open any game in the viewer.
- **Legends**: Morphy, Steinitz, Lasker, Capablanca, Alekhine, Botvinnik, Tal,
  Petrosian, Fischer, Karpov, Kasparov and Carlsen, with style profiles, repertoire,
  a featured famous game each, and a searchable list of ~23,000 games.
- **Game viewer**: step through any game on a board. Switch on Stockfish for a
  live eval bar and best line for the position on screen. A full review labels
  every move Chess.com-style (Brilliant !!, Great !, Best, Excellent, Good, Book,
  Inaccuracy ?!, Mistake ?, Miss, Blunder ??), shows the best move you missed, a
  per-player classification table, accuracy by phase and a clickable evaluation
  chart. Choose from 7 piece sets and 8 board color themes.
- **Opening names**: the viewer names the opening and variation as you step
  through moves (e.g. "B97 Sicilian Defense: Najdorf Variation, Poisoned Pawn
  Accepted") and shows where the game left theory; the same data marks Book
  moves in reviews for every game source.
- **Spoken moves and autoplay**: turn on 🔈 to hear each move read aloud
  ("Knight takes E 5, check") in the most natural English voice your device
  offers, or one you pick and test from the Voice menu; ⏯ plays through the game automatically. Uses your browser's built-in speech.
- **Sort games** (yours or a legend's) by most brilliant or great moves,
  accuracy, game performance (estimated rating), fewest/most blunders,
  strongest opponent, date or length. Every review, wherever it runs, records
  these numbers in your browser; legends' lists have a "Review next 10 games"
  button to rank more of them.
- **Drills**: learn the three phases of the game by playing on the board.
  - **Openings**: play the main line of 11 openings (5 as White, 6 as Black)
    from memory; the other side's moves are played for you, the opening is named
    as you go, and notes explain the idea behind key moves.
  - **Middlegame**: tactical patterns (back-rank, Arabian, Anastasia's and
    smothered mates, forks, pins, skewers, discovered checks, deflection).
  - **Endgame**: queen and rook mates, king-and-pawn technique (opposition,
    rule of the square, breakthrough), and the Lucena and Philidor positions.
  - Stockfish defends and grades every move: a move that spoils the position
    is taken back so you can try again. Hints and "Show move" help when stuck.
  - Spaced repetition: clean solves come back after 1, 3, 7, 16 and 35 days,
    misses come back sooner, and each phase shows how many drills you've
    mastered. Progress is saved in your browser.
- **Analyze a game**: pick one of your recent Lichess or Chess.com games for a
  full review, or paste/drop any PGN. Your own games are reviewed as soon as
  they open.

Move labels use expected points (win probability) lost by each move: Best is
Stockfish's top choice; Great is the only good move (the second-best loses
15%+); Brilliant is a best-or-near-best move that sacrifices material (by
static exchange on the destination square) without spoiling the position;
Excellent/Good/Inaccuracy/Mistake/Blunder lose up to 2/5/10/20/more than 20%;
a Miss fails to punish the opponent's mistake; Book uses the opening length
Lichess reports. Chess.com's exact rules aren't public, so labels are close
but won't always match theirs.

## How style is measured

Style traits come from replaying every game (no engine needed): checks per
move, flank pawn pushes toward the enemy king, opposite-side castling, quick
wins, playing on while down material, how often and how long games reach an
endgame, castling, early queen moves, draws, and early queen trades. Each metric
is scaled between the lowest and highest of the 12 legends (0 = least, 100 =
most). Legends' profiles use their classical over-the-board games; blitz and
bullet games naturally read more aggressive and less endgame-heavy.

## How it works

- **Engine**: [Stockfish 19 (lite, single-threaded WASM)](https://github.com/nmrugg/stockfish.js)
  runs in a Web Worker, right in your browser. Nothing is uploaded anywhere.
- **Parsing**: [chess.js](https://github.com/jhlywa/chess.js) parses the PGN and
  replays it move by move to get the FEN before/after every move.
- **Per-move accuracy**: every position is evaluated once; the resulting
  centipawn loss per move is converted to a 0–100 accuracy score using
  [lichess's published win-probability model](https://lichess.org/page/accuracy).
- **Phase segmentation**: opening = first 10 full moves; endgame = once combined
  non-pawn material drops to a low threshold; everything between is the
  middlegame. This is a heuristic, not a precise theoretical boundary.
- **Estimated rating**: average centipawn loss is mapped to an approximate
  Elo via a calibrated lookup curve (`src/lib/rating.ts`). This is a rough,
  single-game estimate, not an official rating — treat it as directional.

## Legends data

The legends' games come from [PGN Mentor](https://www.pgnmentor.com/files.html)'s
player collections. To rebuild `public/legends/`, download the player files
(e.g. `https://www.pgnmentor.com/players/Tal.zip`) into `data-source/`, unzip
them, and run:

```bash
node scripts/build-legends.ts
```

## Opening names data

`public/openings.json` is built from Lichess's
[chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0).
Download `a.tsv`–`e.tsv` into `data-source/openings/` and run:

```bash
node scripts/build-openings.ts
```

## Drills data

Drills live in `src/lib/drillData.ts`. After adding or changing one, check that
every opening line is legal and every position can be solved the way the app
grades it (the bundled Stockfish plays it through):

```bash
node scripts/check-drills.ts
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## License / attribution

Piece sets in `public/pieces/` come from the Lichess repository; authors and
licenses (GPLv2+, GPLv3+, Apache 2.0, MIT) are listed in
[`public/pieces/CREDITS.md`](public/pieces/CREDITS.md).

This project bundles a precompiled build of
[Stockfish.js](https://github.com/nmrugg/stockfish.js) (`public/engine/`),
which is GPLv3-licensed — see `public/engine/COPYING.txt`. The rest of this
project's own code has no separate license file yet.
