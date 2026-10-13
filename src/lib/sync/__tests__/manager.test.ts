import { describe, expect, it, vi } from "vitest";
import { createMemoryBackend } from "../../forum/memory";
import { SyncUnavailableError, type ForumBackend } from "../../forum/types";
import { clearSavedOnDevice, createSync, type SyncStatus, type SyncStorage } from "../manager";
import { SYNC_KEYS } from "../merge";

const fakeStorage = (initial: Record<string, string> = {}): SyncStorage & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

async function signedIn(backend: ForumBackend, name: string): Promise<string> {
  await backend.signUp(`${name}@example.com`, "password123", name);
  return (await backend.getSession())!.userId;
}

const setup = (backend: ForumBackend, storage: SyncStorage, userId: string) => {
  const statuses: SyncStatus[] = [];
  const onApplied = vi.fn();
  const sync = createSync({ backend, storage, userId, onApplied, onStatus: (s) => statuses.push(s) });
  return { sync, statuses, onApplied };
};

describe("keeping a device and an account in step", () => {
  it("saves a first-time login's usernames and progress to the account", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const storage = fakeStorage({ [SYNC_KEYS.usernames]: '{"lichess":"alice","chesscom":"alice_cc"}', [SYNC_KEYS.puzzles]: '["p1"]' });
    const { sync, statuses } = setup(backend, storage, userId);
    await sync.run();
    const saved = await backend.loadUserData();
    expect(saved.usernames.value).toEqual({ lichess: "alice", chesscom: "alice_cc" });
    expect(saved.puzzles.value).toEqual(["p1"]);
    expect(statuses.at(-1)).toBe("saved");
    expect(sync.hasChanges()).toBe(false);
  });

  it("gives a new device the usernames and progress saved from another, and tells the screens to re-read them", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    await setup(backend, fakeStorage({ [SYNC_KEYS.usernames]: '{"lichess":"alice","chesscom":""}', [SYNC_KEYS.puzzles]: '["p1"]' }), userId).sync.run();

    const phone = fakeStorage({ [SYNC_KEYS.puzzles]: '["p2"]' });
    const { sync, onApplied } = setup(backend, phone, userId);
    await sync.run();
    expect(JSON.parse(phone.data.get(SYNC_KEYS.usernames)!)).toEqual({ lichess: "alice", chesscom: "" });
    expect(JSON.parse(phone.data.get(SYNC_KEYS.puzzles)!)).toEqual(["p1", "p2"]);
    expect(onApplied).toHaveBeenCalled();
    expect((await backend.loadUserData()).puzzles.value).toEqual(["p1", "p2"]);
  });

  it("notices a change made here and saves it on the next run", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const storage = fakeStorage({ [SYNC_KEYS.puzzles]: '["p1"]' });
    const { sync } = setup(backend, storage, userId);
    await sync.run();
    expect(sync.hasChanges()).toBe(false);
    storage.setItem(SYNC_KEYS.puzzles, '["p1","p2"]');
    expect(sync.hasChanges()).toBe(true);
    await sync.run();
    expect((await backend.loadUserData()).puzzles.value).toEqual(["p1", "p2"]);
    expect(sync.hasChanges()).toBe(false);
  });

  it("never lets one person's saved data from a shared browser end up in another person's account", async () => {
    const backend = createMemoryBackend();
    const alice = await signedIn(backend, "Alice");
    const shared = fakeStorage({ [SYNC_KEYS.usernames]: '{"lichess":"alice_secret","chesscom":""}', [SYNC_KEYS.puzzles]: '["alice1"]' });
    await setup(backend, shared, alice).sync.run();
    await backend.signOut();

    const bob = await signedIn(backend, "Bob");
    await setup(backend, shared, bob).sync.run();
    expect(shared.data.get(SYNC_KEYS.usernames)).toBeUndefined();
    expect(shared.data.get(SYNC_KEYS.puzzles)).toBeUndefined();
    expect(await backend.loadUserData()).toEqual({});
  });

  it("keeps a change that couldn't be saved, and says so, so it is tried again", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const storage = fakeStorage({ [SYNC_KEYS.puzzles]: '["p1"]' });
    const failing: ForumBackend = { ...backend, saveUserData: () => Promise.reject(new Error("offline")) };
    let clock = 5_000_000;
    const statuses: SyncStatus[] = [];
    const sync = createSync({ backend: failing, storage, userId, onStatus: (s) => statuses.push(s), now: () => clock });
    await sync.run();
    expect(statuses.at(-1)).toBe("error");
    clock += 61_000; // once the wait is over, the unsaved change is still pending
    expect(sync.hasChanges()).toBe(true);
    const retry = setup(backend, storage, userId);
    await retry.sync.run();
    expect((await backend.loadUserData()).puzzles.value).toEqual(["p1"]);
  });

  it("waits a minute after a failed save before the background check tries again", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const storage = fakeStorage({ [SYNC_KEYS.puzzles]: '["p1"]' });
    let clock = 1_000_000;
    const failing: ForumBackend = { ...backend, saveUserData: () => Promise.reject(new Error("offline")) };
    const sync = createSync({ backend: failing, storage, userId, now: () => clock });
    await sync.run();
    expect(sync.hasChanges()).toBe(false);
    clock += 30_000;
    expect(sync.hasChanges()).toBe(false);
    clock += 31_000;
    expect(sync.hasChanges()).toBe(true);
  });

  it("quietly stops trying when the database has no place to put saved data yet", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const missing: ForumBackend = { ...backend, loadUserData: () => Promise.reject(new SyncUnavailableError()) };
    const { sync, statuses } = setup(missing, fakeStorage({ [SYNC_KEYS.puzzles]: '["p1"]' }), userId);
    await sync.run();
    expect(statuses.at(-1)).toBe("unavailable");
    expect(sync.isUnavailable()).toBe(true);
    expect(sync.hasChanges()).toBe(false);
  });

  it("deletes a person's saved data from their account and nobody else's", async () => {
    const backend = createMemoryBackend();
    await signedIn(backend, "Alice");
    await backend.saveUserData("usernames", { lichess: "alice", chesscom: "" });
    await backend.signOut();
    await signedIn(backend, "Bob");
    await backend.saveUserData("usernames", { lichess: "bob", chesscom: "" });
    await backend.deleteUserData();
    expect(await backend.loadUserData()).toEqual({});
    await backend.signOut();
    await backend.signIn("alice@example.com", "password123");
    expect((await backend.loadUserData()).usernames.value).toEqual({ lichess: "alice", chesscom: "" });
  });

  it("after a deletion, forgets this device's copy so it is not saved again", async () => {
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    const storage = fakeStorage({ [SYNC_KEYS.puzzles]: '["p1"]' });
    const { sync } = setup(backend, storage, userId);
    await sync.run();
    await backend.deleteUserData();
    clearSavedOnDevice(storage);
    expect(storage.data.get(SYNC_KEYS.puzzles)).toBeUndefined();
    await sync.run();
    expect(await backend.loadUserData()).toEqual({});
  });

  it("saves the history and favourites of both Lichess and Chess.com games to the account and restores them on another device", async () => {
    const entry = (id: string, source: string, favorite: boolean, at: number) => ({ id, favorite, opened: true, openedAt: at, updatedAt: at, game: { id, source, white: "A", black: "B", moves: "e4 e5" } });
    const history = { "lichess:abc123": entry("lichess:abc123", "lichess", true, 2000), "chesscom:777": entry("chesscom:777", "chesscom", false, 1000) };
    const backend = createMemoryBackend();
    const userId = await signedIn(backend, "Alice");
    await setup(backend, fakeStorage({ [SYNC_KEYS.history]: JSON.stringify(history) }), userId).sync.run();
    const saved = (await backend.loadUserData()).history.value as Record<string, { favorite: boolean }>;
    expect(Object.keys(saved).sort()).toEqual(["chesscom:777", "lichess:abc123"]);
    expect(saved["lichess:abc123"].favorite).toBe(true);

    const phone = fakeStorage();
    const { sync, onApplied } = setup(backend, phone, userId);
    await sync.run();
    expect(Object.keys(JSON.parse(phone.data.get(SYNC_KEYS.history)!)).sort()).toEqual(["chesscom:777", "lichess:abc123"]);
    expect(onApplied).toHaveBeenCalled();
  });

  it("only lets people see their own saved data", async () => {
    const backend = createMemoryBackend();
    const alice = await signedIn(backend, "Alice");
    await backend.saveUserData("usernames", { lichess: "alice", chesscom: "" });
    await backend.signOut();
    await signedIn(backend, "Bob");
    expect(await backend.loadUserData()).toEqual({});
    expect(alice).not.toBe((await backend.getSession())!.userId);
  });
});
