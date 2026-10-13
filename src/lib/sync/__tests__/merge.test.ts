import { describe, expect, it } from "vitest";
import { changedHere, combine, fingerprint, reconcile, stable } from "../merge";

const entry = (value: unknown) => ({ value, updatedAt: "2026-10-12T00:00:00.000Z" });

describe("stable", () => {
  it("gives the same text whatever order an object's keys come in", () => {
    expect(stable({ b: 1, a: { d: 2, c: 3 } })).toBe(stable({ a: { c: 3, d: 2 }, b: 1 }));
    expect(fingerprint(stable({ a: 1, b: 2 }))).toBe(fingerprint(stable({ b: 2, a: 1 })));
  });
  it("tells different data apart", () => {
    expect(fingerprint(stable({ a: 1 }))).not.toBe(fingerprint(stable({ a: 2 })));
  });
});

describe("combine (progress from two devices)", () => {
  it("unions solved puzzles", () => {
    expect(combine("puzzles", ["p2", "p1"], ["p3", "p1"])).toEqual(["p1", "p2", "p3"]);
  });
  it("keeps game ratings from both sides", () => {
    expect(combine("stats", { g1: { accuracy: 90 } }, { g2: { accuracy: 80 } })).toEqual({ g1: { accuracy: 90 }, g2: { accuracy: 80 } });
  });
  it("keeps whichever copy of a drill was practised most recently", () => {
    const merged = combine("drills", { a: { last: 200, box: 2 }, b: { last: 10, box: 1 } }, { a: { last: 100, box: 5 }, b: { last: 50, box: 3 }, c: { last: 1, box: 1 } }) as Record<string, { box: number }>;
    expect(merged.a.box).toBe(2);
    expect(merged.b.box).toBe(3);
    expect(merged.c.box).toBe(1);
  });
  it("ignores a side that isn't the right shape", () => {
    expect(combine("puzzles", "nonsense", ["p1"])).toEqual(["p1"]);
    expect(combine("drills", { a: { last: 1 } }, null)).toEqual({ a: { last: 1 } });
  });
});

describe("reconcile", () => {
  it("does nothing when neither side has anything", () => {
    expect(reconcile({}, {}, {})).toEqual({ applyLocal: {}, push: {}, fingerprints: {} });
  });
  it("saves what this device has when the account is empty", () => {
    const plan = reconcile({ usernames: '{"lichess":"magnus","chesscom":""}' }, {}, {});
    expect(plan.push.usernames).toEqual({ lichess: "magnus", chesscom: "" });
    expect(plan.applyLocal).toEqual({});
  });
  it("loads what the account has onto a new device", () => {
    const plan = reconcile({}, { usernames: entry({ lichess: "magnus", chesscom: "" }) }, {});
    expect(JSON.parse(plan.applyLocal.usernames!)).toEqual({ lichess: "magnus", chesscom: "" });
    expect(plan.push).toEqual({});
  });
  it("prefers the account's settings when this device hasn't changed them since the last save", () => {
    const local = '{"lichess":"old","chesscom":""}';
    const saved = { usernames: fingerprint(stable(JSON.parse(local))) };
    const plan = reconcile({ usernames: local }, { usernames: entry({ lichess: "new", chesscom: "" }) }, saved);
    expect(JSON.parse(plan.applyLocal.usernames!).lichess).toBe("new");
    expect(plan.push).toEqual({});
  });
  it("prefers this device's settings when they were changed here since the last save", () => {
    const saved = { usernames: fingerprint(stable({ lichess: "old", chesscom: "" })) };
    const plan = reconcile({ usernames: '{"lichess":"edited","chesscom":""}' }, { usernames: entry({ lichess: "old", chesscom: "" }) }, saved);
    expect(plan.push.usernames).toEqual({ lichess: "edited", chesscom: "" });
    expect(plan.applyLocal).toEqual({});
  });
  it("takes the account's settings on a first sync, rather than overwriting them", () => {
    const plan = reconcile({ usernames: '{"lichess":"local","chesscom":""}' }, { usernames: entry({ lichess: "account", chesscom: "" }) }, {});
    expect(JSON.parse(plan.applyLocal.usernames!).lichess).toBe("account");
    expect(plan.push).toEqual({});
  });
  it("combines progress and saves the combination to both sides", () => {
    const plan = reconcile({ puzzles: '["a","b"]' }, { puzzles: entry(["b", "c"]) }, {});
    expect(JSON.parse(plan.applyLocal.puzzles!)).toEqual(["a", "b", "c"]);
    expect(plan.push.puzzles).toEqual(["a", "b", "c"]);
  });
  it("does nothing when both sides already agree, however their keys are ordered", () => {
    const plan = reconcile({ board: '{"theme":"brown","pieces":"cburnett"}' }, { board: entry({ pieces: "cburnett", theme: "brown" }) }, {});
    expect(plan.applyLocal).toEqual({});
    expect(plan.push).toEqual({});
  });
  it("treats damaged text on this device as missing", () => {
    const plan = reconcile({ usernames: "{not json" }, { usernames: entry({ lichess: "magnus", chesscom: "" }) }, {});
    expect(JSON.parse(plan.applyLocal.usernames!).lichess).toBe("magnus");
  });
});

describe("changedHere", () => {
  it("lists only what differs from the last save", () => {
    const saved = { usernames: fingerprint(stable({ lichess: "a", chesscom: "" })), puzzles: fingerprint(stable(["p1"])) };
    expect(changedHere({ usernames: '{"lichess":"a","chesscom":""}', puzzles: '["p1","p2"]' }, saved)).toEqual(["puzzles"]);
  });
  it("counts data that was never saved as changed, and ignores what is missing", () => {
    expect(changedHere({ stats: '{"g":{"accuracy":80}}', drills: null }, {})).toEqual(["stats"]);
  });
});
