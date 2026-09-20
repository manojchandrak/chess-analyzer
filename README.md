# Chess Game Analyzer

Upload a PGN and get a Stockfish-powered breakdown of both players' accuracy
by opening/middlegame/endgame, plus an estimated performance rating —
entirely client-side, no server or upload involved.

Live at: https://manojchandrak.github.io/chess-analyzer/

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

This project bundles a precompiled build of
[Stockfish.js](https://github.com/nmrugg/stockfish.js) (`public/engine/`),
which is GPLv3-licensed — see `public/engine/COPYING.txt`. The rest of this
project's own code has no separate license file yet.
