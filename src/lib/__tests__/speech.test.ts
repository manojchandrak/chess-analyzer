import { describe, expect, it } from "vitest";
import { commentaryToSpeech, sanToSpeech } from "../speech";

describe("sanToSpeech", () => {
  it("reads moves in words", () => {
    expect(sanToSpeech("Nxe5+")).toBe("Knight takes E 5, check");
    expect(sanToSpeech("O-O")).toBe("Castles kingside");
    expect(sanToSpeech("e8=Q#")).toBe("E 8, promotes to Queen, checkmate");
    expect(sanToSpeech("Rad1")).toBe("Rook A D 1");
  });
});

describe("commentaryToSpeech", () => {
  it("reads moves inside sentences like moves", () => {
    expect(commentaryToSpeech("A small inaccuracy. Nf3 was better.")).toBe("A small inaccuracy. Knight F 3 was better.");
    expect(commentaryToSpeech("Better options: Qf6 and exd5.")).toBe("Better options: Queen F 6 and E takes D 5.");
    expect(commentaryToSpeech("White castles kingside, then plays O-O-O?")).toContain("Castles queenside");
  });

  it("reads evaluations as numbers", () => {
    expect(commentaryToSpeech("Better options: Qf6 (+1.3) and Qd7 (+1.5).")).toBe("Better options: Queen F 6 plus 1 point 3 and Queen D 7 plus 1 point 5.");
    expect(commentaryToSpeech("The evaluation swings from +0.4 to -2.1.")).toBe("The evaluation swings from plus 0 point 4 to minus 2 point 1.");
    expect(commentaryToSpeech("White is winning (+6.0).")).toBe("White is winning plus 6.");
    expect(commentaryToSpeech("White has a forced mate in 3.")).toBe("White has a forced mate in 3.");
  });

  it("leaves out opening codes but keeps the opening name", () => {
    expect(commentaryToSpeech("This is the Sicilian Defense (B20).")).toBe("This is the Sicilian Defense.");
  });

  it("does not turn ordinary words into moves", () => {
    expect(commentaryToSpeech("White develops the knight to f3 and stakes a claim in the center.")).toBe("White develops the knight to F 3 and stakes a claim in the center.");
    expect(commentaryToSpeech("A bad blunder by Black")).toBe("A bad blunder by Black");
  });
});
