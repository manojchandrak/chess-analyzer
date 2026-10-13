import { describe, expect, it } from "vitest";
import { parsePgn } from "../pgn";
import { decodeSharedGame, encodeSharedGame } from "../shareLink";

const b64url = (obj: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const PGN = '[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1500"]\n[BlackElo "1480"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0';

describe("share links that carry the game", () => {
  it("round-trips players, ratings, result and every move", () => {
    const game = parsePgn(PGN);
    const part = encodeSharedGame(game)!;
    expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeSharedGame(part)!;
    expect(back.white).toBe("Alice");
    expect(back.black).toBe("Bob");
    expect(back.whiteElo).toBe(1500);
    expect(back.blackElo).toBe(1480);
    expect(back.result).toBe("1-0");
    expect(back.moves.map((m) => m.san)).toEqual(game.moves.map((m) => m.san));
    expect(back.moves.at(-1)?.fenAfter).toBe(game.moves.at(-1)?.fenAfter);
  });

  it("keeps castling, captures, promotions and check symbols", () => {
    const g = parsePgn('[Result "*"]\n\n1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 c6 5. Nf3 Bg4 6. h3 Bxf3 7. Qxf3 e6 8. Bd2 Nf6 9. O-O-O Bb4 *');
    const back = decodeSharedGame(encodeSharedGame(g)!)!;
    expect(back.moves.map((m) => m.san)).toEqual(g.moves.map((m) => m.san));
  });

  it("handles non-English names", () => {
    const g = parsePgn('[White "Zoë Müller"]\n[Black "李雷"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    const back = decodeSharedGame(encodeSharedGame(g)!)!;
    expect(back.white).toBe("Zoë Müller");
    expect(back.black).toBe("李雷");
    expect(back.result).toBe("0-1");
  });

  it("has nothing to share for a game with no moves", () => {
    expect(encodeSharedGame({ white: "A", black: "B", whiteElo: null, blackElo: null, result: "*", moves: [] })).toBeNull();
  });

  it("refuses links that are not ours, damaged, or hold an illegal game", () => {
    expect(decodeSharedGame("")).toBeNull();
    expect(decodeSharedGame("not valid!")).toBeNull();
    expect(decodeSharedGame("aGVsbG8")).toBeNull(); // valid base64, not our data
    const illegal = b64url({ v: 1, w: "A", b: "B", r: "*", m: "e4 e4 Nf3" });
    expect(decodeSharedGame(illegal)).toBeNull();
    const wrongVersion = b64url({ v: 2, w: "A", b: "B", r: "*", m: "e4 e5" });
    expect(decodeSharedGame(wrongVersion)).toBeNull();
    const junkSan = b64url({ v: 1, w: "A", b: "B", r: "*", m: "e4 <script>" });
    expect(decodeSharedGame(junkSan)).toBeNull();
    expect(decodeSharedGame("a".repeat(9000))).toBeNull();
  });

  it("cleans names and ignores impossible ratings in a hand-made link", () => {
    const part = b64url({ v: 1, w: 'Evil"]\n[Result "1-0', b: "B", we: 99999, r: "banana", m: "e4 e5" });
    const g = decodeSharedGame(part)!;
    expect(g.white).not.toMatch(/["\n[\]]/);
    expect(g.whiteElo).toBeNull();
    expect(g.result).toBe("*");
  });
});
