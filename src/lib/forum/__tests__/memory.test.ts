import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../memory";
import type { AuthEvent, ForumBackend } from "../types";

/** A backend with a controllable clock, so rate limits can be tested without waiting. */
function setup(opts: { seed?: boolean } = {}) {
  let now = Date.parse("2026-10-04T12:00:00Z");
  const b = createMemoryBackend({ now: () => now, ...opts });
  return { b, tick: (ms: number) => void (now += ms) };
}
const signUp = (b: ForumBackend, name = "Alice") => b.signUp(`${name.toLowerCase()}@example.com`, "password123", name);
const reject = async (p: Promise<unknown>) => (await p.then(() => null, (e: Error) => e.message)) ?? "";

describe("sign-in methods", () => {
  it("offers no Google or GitHub buttons in the demo, since they can't work there", async () => {
    expect(await setup().b.availableProviders()).toEqual([]);
  });
});

describe("accounts", () => {
  it("signs up, signs in and out, and reports each change", async () => {
    const { b } = setup();
    const events: AuthEvent[] = [];
    b.onAuthChange((e) => events.push(e));
    expect(await b.getSession()).toBeNull();
    expect(await signUp(b)).toEqual({ needsConfirmation: false });
    expect((await b.getSession())?.profile).toMatchObject({ username: "Alice", isAdmin: false });
    await b.signOut();
    expect(await b.getSession()).toBeNull();
    await b.signIn("ALICE@example.com", "password123");
    expect((await b.getSession())?.email).toBe("alice@example.com");
    expect(events).toEqual(["SIGNED_IN", "SIGNED_OUT", "SIGNED_IN"]);
  });

  it("stops listening when unsubscribed", async () => {
    const { b } = setup();
    const events: AuthEvent[] = [];
    const off = b.onAuthChange((e) => events.push(e));
    off();
    await signUp(b);
    expect(events).toEqual([]);
  });

  it("checks the input and refuses duplicates and wrong passwords", async () => {
    const { b } = setup();
    await signUp(b);
    await b.signOut();
    expect(await reject(b.signUp("bad", "password123", "Bob"))).toMatch(/valid email/i);
    expect(await reject(b.signUp("bob@example.com", "short", "Bob"))).toMatch(/at least 8/i);
    expect(await reject(b.signUp("bob@example.com", "password123", "B!"))).toMatch(/username/i);
    expect(await reject(b.signUp("alice@example.com", "password123", "Other"))).toMatch(/already exists/i);
    expect(await reject(b.signUp("bob@example.com", "password123", "ALICE"))).toMatch(/taken/i);
    expect(await reject(b.signIn("alice@example.com", "wrong-password"))).toMatch(/wrong email or password/i);
  });

  it("changes a username (not to a taken one) and a password", async () => {
    const { b } = setup({ seed: true });
    await b.signIn("player@example.com", "password123");
    expect((await b.updateUsername("KnightRider2")).username).toBe("KnightRider2");
    expect(await reject(b.updateUsername("ModeratorMo"))).toMatch(/taken/i);
    await b.updatePassword("a-new-password");
    await b.signOut();
    expect(await reject(b.signIn("player@example.com", "password123"))).toMatch(/wrong/i);
    await b.signIn("player@example.com", "a-new-password");
  });

  it("explains that Google and GitHub need the real backend", async () => {
    const { b } = setup();
    expect(await reject(b.signInWithProvider("google"))).toMatch(/real backend/i);
  });
});

describe("threads and replies", () => {
  it("needs a login to post, and posts as the signed-in person", async () => {
    const { b } = setup();
    expect(await reject(b.createThread({ category: "feedback", title: "Hello there", body: "Hi" }))).toMatch(/log in/i);
    await signUp(b);
    const t = await b.createThread({ category: "feedback", title: "  Hello there  ", body: " Hi " });
    expect(t).toMatchObject({ title: "Hello there", body: "Hi", authorName: "Alice", replyCount: 0, pinned: false, locked: false });
  });

  it("validates titles, bodies and categories", async () => {
    const { b } = setup();
    await signUp(b);
    expect(await reject(b.createThread({ category: "feedback", title: "ab", body: "x" }))).toMatch(/title/i);
    expect(await reject(b.createThread({ category: "feedback", title: "Fine title", body: "   " }))).toMatch(/write something/i);
    expect(await reject(b.createThread({ category: "feedback", title: "Fine title", body: "x".repeat(5001) }))).toMatch(/under 5,000/);
    expect(await reject(b.createThread({ category: "nope" as never, title: "Fine title", body: "x" }))).toMatch(/category/i);
  });

  it("rate-limits threads and replies per person, using the clock", async () => {
    const { b, tick } = setup();
    await signUp(b);
    const t = await b.createThread({ category: "bug", title: "First thread", body: "x" });
    expect(await reject(b.createThread({ category: "bug", title: "Second thread", body: "x" }))).toMatch(/too quickly/i);
    tick(31_000);
    await b.createThread({ category: "bug", title: "Second thread", body: "x" });
    await b.createReply(t.id, "one");
    expect(await reject(b.createReply(t.id, "two"))).toMatch(/too quickly/i);
    tick(11_000);
    await b.createReply(t.id, "two");
  });

  it("lists by category, pinned and most recent activity first, and pages", async () => {
    const { b } = setup({ seed: true });
    const all = await b.listThreads({ page: 0, pageSize: 10 });
    expect(all.total).toBe(3);
    expect(all.threads[0].pinned).toBe(true); // the welcome thread
    expect(all.threads.slice(1).map((t) => t.title)).toEqual(["Export my mistakes as a puzzle set", "Is the Najdorf worth learning at 1500?"]);
    expect((await b.listThreads({ category: "discussion", page: 0, pageSize: 10 })).threads).toHaveLength(1);
    const paged = await b.listThreads({ page: 1, pageSize: 2 });
    expect(paged.threads).toHaveLength(1);
    expect(paged.total).toBe(3);
  });

  it("returns a thread with its replies, oldest first, or null", async () => {
    const { b, tick } = setup();
    await signUp(b);
    const t = await b.createThread({ category: "help", title: "How do I?", body: "x" });
    await b.createReply(t.id, "first");
    tick(11_000);
    await b.createReply(t.id, "second");
    const got = await b.getThread(t.id);
    expect(got?.replies.map((r) => r.body)).toEqual(["first", "second"]);
    expect(got?.thread.replyCount).toBe(2);
    expect(await b.getThread("missing")).toBeNull();
  });

  it("deleting a reply lowers the count; deleting a thread removes its replies", async () => {
    const { b } = setup();
    await signUp(b);
    const t = await b.createThread({ category: "help", title: "How do I?", body: "x" });
    const r = await b.createReply(t.id, "first");
    await b.deleteReply(r.id);
    expect((await b.getThread(t.id))?.thread.replyCount).toBe(0);
    await b.deleteThread(t.id);
    expect(await b.getThread(t.id)).toBeNull();
  });
});

describe("permissions", () => {
  async function twoPeople() {
    const { b, tick } = setup({ seed: true });
    await b.signIn("player@example.com", "password123");
    const t = await b.createThread({ category: "feedback", title: "Player's thread", body: "mine" });
    const r = await b.createReply(t.id, "Player's reply");
    await b.signOut();
    return { b, tick, t, r };
  }

  it("lets only the author (or a moderator) edit and delete", async () => {
    const { b, t, r } = await twoPeople();
    await signUp(b, "Mallory");
    expect(await reject(b.updateThread(t.id, { title: "Hijacked", body: "x" }))).toMatch(/your own/i);
    expect(await reject(b.deleteThread(t.id))).toMatch(/your own/i);
    expect(await reject(b.updateReply(r.id, "Hijacked"))).toMatch(/your own/i);
    expect(await reject(b.deleteReply(r.id))).toMatch(/your own/i);
    await b.signOut();
    await b.signIn("player@example.com", "password123");
    expect((await b.updateThread(t.id, { title: "Edited title", body: "x" })).title).toBe("Edited title");
    expect((await b.updateReply(r.id, "Edited reply")).body).toBe("Edited reply");
  });

  it("lets a moderator delete anything and pin or lock threads; nobody else", async () => {
    const { b, t, r } = await twoPeople();
    await signUp(b, "Mallory");
    expect(await reject(b.setThreadFlags(t.id, { pinned: true }))).toMatch(/only moderators/i);
    await b.signOut();
    await b.signIn("mod@example.com", "password123");
    expect(await b.setThreadFlags(t.id, { pinned: true, locked: true })).toMatchObject({ pinned: true, locked: true });
    await b.deleteReply(r.id);
    await b.deleteThread(t.id);
    expect(await b.getThread(t.id)).toBeNull();
  });

  it("refuses replies to a locked thread except from a moderator", async () => {
    const { b, t, tick } = await twoPeople();
    await b.signIn("mod@example.com", "password123");
    await b.setThreadFlags(t.id, { locked: true });
    await b.signOut();
    await signUp(b, "Mallory");
    expect(await reject(b.createReply(t.id, "hello"))).toMatch(/locked/i);
    await b.signOut();
    await b.signIn("mod@example.com", "password123");
    tick(11_000);
    await b.createReply(t.id, "moderator can");
  });
});
