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
  Load 50–500 recent games per site, or **all games** (streamed with a live
  count; stop at any time and keep what has loaded).
  - **Playing style**: five traits (aggression, sacrificial risk, endgame
    appetite, solidity, simplification) measured from the moves themselves,
    an overall archetype, and the legends whose style is closest to yours.
  - **Where to improve**: suggestions backed by your numbers, e.g. losses on
    time, weak openings, color imbalance, king safety, endgame results.
  - **Engine review**: Stockfish reviews your recent games (games Lichess
    already analyzed are used for free) to find your weakest phase, blunders
    that hang pieces, blunders under time pressure, and winning positions you
    didn't convert. Reviews are cached in your browser.
  - **Progress over time**: accuracy, blunders per game and score by month, from
    the games you've reviewed, with a short "improving / steady / slipping" summary.
  - **Practice your mistakes**: a drill built from your own mistakes and blunders.
    You get the position before the error; click a piece and a square (or type the
    move) to find the better one. Solved puzzles are remembered in your browser.
  - **Opening results**: your repertoire table shows engine accuracy per opening
    next to the results.
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
- **Move-by-move commentary**: a short plain-English note on every move: what it does
  (capture, check, castling, development, a piece left hanging), the engine's verdict
  and how the evaluation changed, who is ahead, the opening reached and when the game
  leaves the book. It works without the engine too; the 💬 button hides it, and
  **Download PGN** includes it in the move comments.
- **Alternative moves**: after a Stockfish review, every move lists the engine's top
  three choices in that position with their evaluations and how far each is behind the
  best. **Show the position before the move** draws them as arrows (best in green,
  runners-up in blue and purple, the move played in red).
- **Play on from here**: **Play from this position** (or ▶ next to an alternative or an
  engine line) opens a playable board at that point. Move the pieces for both sides to
  explore, or play White or Black against Stockfish at three strengths (beginner, club,
  strong), with live evaluation, engine lines, undo, a best-move hint and game-over
  detection. You can also start from any position by pasting a FEN on the *Analyze a
  game* tab.
- **Engine lines and arrows**: with Stockfish on, the viewer shows the top three
  lines with arrows on the board (click a line to emphasize it), and a green arrow
  for the move you should have played. **Download PGN** saves the game with
  evaluations and move annotations; **Open position on Lichess** continues the
  analysis there.
- **Shareable links**: the page address always describes what's open. **Copy link**
  in the viewer gives a link to a Lichess game or a legend's game at the current
  move (Chess.com games and pasted PGNs can't be reopened from a link). Links also
  open a tab, a legend or a username (`#/mine?lichess=name`).
- **Opening names**: the viewer names the opening and variation as you step
  through moves (e.g. "B97 Sicilian Defense: Najdorf Variation, Poisoned Pawn
  Accepted") and shows where the game left theory; the same data marks Book
  moves in reviews for every game source.
- **Spoken moves and autoplay**: turn on 🔈 to hear each move read aloud
  ("Knight takes E 5, check") in the most natural English voice your device
  offers, or one you pick and test from the Voice menu; ⏯ plays through the game automatically. Uses your browser's built-in speech.
- **Commentary read aloud**: the 🗣 button reads each move's commentary after the move
  is shown (the 🔈 button still reads just the move; switch both on to hear the move
  and then the comment). Moves in the text are read as moves ("Qf6" as "Queen F 6"),
  evaluations as numbers ("+1.3" as "plus 1 point 3") and opening codes are skipped.
  It uses the same voice as the moves, and autoplay waits for a comment to finish
  before it moves on.
- **Sort games** (yours or a legend's) by most brilliant or great moves,
  accuracy, game performance (estimated rating), fewest/most blunders,
  strongest opponent, date or length. Every review, wherever it runs, records
  these numbers in your browser; legends' lists have a "Review next 10 games"
  button to rank more of them.
- **Drills**: learn the three phases of the game by playing on the board
  (drag a piece, or tap it and then its destination); turn on 🔈 to hear
  each move read aloud.
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
  runs in Web Workers, right in your browser. Nothing is uploaded anywhere. Reviews
  use a small pool of workers (up to 4, leaving a core free) and evaluate a game's
  positions in parallel. Every evaluation has a timeout, and a worker that fails to
  load or crashes is replaced, so a failure shows an error and a Retry button
  instead of freezing the page. (Multi-threaded Stockfish needs special HTTP
  headers that GitHub Pages can't send, so parallelism comes from separate workers.)
- **Storage**: engine reviews are cached in IndexedDB (localStorage's ~5 MB fills up
  after a few hundred games). If the browser refuses to save, the page says so.
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
  single-game estimate, not an official rating — treat it as directional. Games
  under 40 moves are labeled low or moderate confidence.

## Legends data

The legends' games come from [PGN Mentor](https://www.pgnmentor.com/files.html)'s
player collections. To rebuild `public/legends/`, download the player files
(e.g. `https://www.pgnmentor.com/players/Tal.zip`) into `data-source/`, unzip
them, and run:

```bash
node scripts/build-legends.ts
```

Each legend gets `<id>.json` (the game list, without moves) and `<id>.m0.json`,
`<id>.m1.json`, … (move text, 500 games per file). The moves for a game are fetched
only when it's opened, which keeps the biggest list (Carlsen) under 1 MB.

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
npm run dev      # local server
npm test         # unit tests (Vitest)
npm run lint     # oxlint
```

Tests live in `src/lib/__tests__/` and cover the pure logic: move classification,
accuracy and rating, PGN and game parsing, review summaries, trends, puzzles, link
routing, the engine pool (against a fake worker) and the data loaders. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, tests and a
build on every pull request; the deploy workflow runs the same checks before
publishing.

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
