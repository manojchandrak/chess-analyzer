import { describe, expect, it } from "vitest";
import { clearDeviceData } from "../deviceData";

describe("clearDeviceData", () => {
  it("removes this app's items from browser storage and leaves everything else alone", async () => {
    const data = new Map([
      ["chess-analyzer:usernames", "{}"],
      ["chess-analyzer:puzzles:v1", "[]"],
      ["someone-elses-key", "keep"],
    ]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      removeItem: (k: string) => void data.delete(k),
    };
    expect(await clearDeviceData(storage)).toBe(2);
    expect([...data.keys()]).toEqual(["someone-elses-key"]);
  });
});
