import { describe, expect, it } from "vitest";
import { parseElo, pgnClocks, pgnDate, pgnHeaders, pgnMoveText, scoreFor, splitPgn, timeClassOf, toPgn, type GameRecord } from "../games";

const PGN = `[Event "Casual"]
[White "Alice"]
[Black "Bob \\"B\\""]
[Result "1-0"]

1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:59.5]} 2. Nf3 $1 (2. f4 exf4) Nc6?! 3. Bb5 1-0

[Event "Second"]
[White "C"]
[Black "D"]
[Result "0-1"]

1. d4 d5 0-1
`;

describe("PGN text helpers", () => {
  it("splits a multi-game file", () => {
    const games = splitPgn(PGN);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain('[White "C"]');
  });
  it("reads headers including escaped quotes", () => {
    const h = pgnHeaders(splitPgn(PGN)[0]);
    expect(h.White).toBe("Alice");
    expect(h.Black).toBe('Bob "B"');
  });
  it("strips comments, variations, NAGs, move numbers and annotations", () => {
    expect(pgnMoveText(splitPgn(PGN)[0])).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  });
  it("reads clock comments in seconds", () => {
    expect(pgnClocks(splitPgn(PGN)[0])).toEqual([180, 179.5]);
    expect(pgnClocks("1. e4 e5")).toBeNull();
  });
});

describe("small parsers", () => {
  it("parses dates, keeping only the year when the rest is unknown", () => {
    expect(pgnDate("2023.05.14")).toBe("2023-05-14");
    expect(pgnDate("1858.??.??")).toBe("1858");
    expect(pgnDate(undefined)).toBeNull();
  });
  it("parses ratings", () => {
    expect(parseElo("2750")).toBe(2750);
    expect(parseElo("-")).toBeNull();
    expect(parseElo(0)).toBeNull();
  });
  it("classifies time controls like Lichess", () => {
    expect(timeClassOf("60")).toBe("bullet");
    expect(timeClassOf("180+2")).toBe("blitz"); // 180 + 80 = 260 s
    expect(timeClassOf("600")).toBe("rapid");
    expect(timeClassOf("1800")).toBe("classical");
    expect(timeClassOf("1/86400")).toBe("daily");
    expect(timeClassOf("-")).toBeNull();
  });
  it("scores a result for a color", () => {
    expect(scoreFor("1-0", "w")).toBe(1);
    expect(scoreFor("1-0", "b")).toBe(0);
    expect(scoreFor("1/2-1/2", "b")).toBe(0.5);
    expect(scoreFor("*", "w")).toBeNull();
  });
});

describe("toPgn", () => {
  it("writes tags and numbered moves", () => {
    const g = { white: "A", black: "B", result: "1-0", date: "2024-01-02", moves: "e4 e5 Nf3", url: null, event: null, eco: null, whiteElo: 1500, blackElo: null } as unknown as GameRecord;
    const pgn = toPgn(g);
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('[Date "2024.01.02"]');
    expect(pgn).toContain('[WhiteElo "1500"]');
    expect(pgn).not.toContain("BlackElo");
    expect(pgn).toContain("1. e4 e5 2. Nf3 1-0");
  });
});
