// An in-memory forum backend with the same rules as the real one (permissions, limits, rate limits),
// used by the tests and by `VITE_FORUM_MOCK=1` so the screens can be tried without a Supabase project.
// Nothing here is saved or shared: it resets when the page reloads.
import type { AuthEvent, CategoryId, ForumBackend, OAuthProvider, Profile, Reply, Session, Thread, ThreadList, UserDataEntry } from "./types.ts";
import { isCategory } from "./types.ts";
import { validateEmail, validatePassword, validateReply, validateThreadBody, validateTitle, validateUsername } from "./validation.ts";

export interface MemoryOptions {
  now?: () => number;
  /** Minimum gap between one person's threads / replies, like the database's rate limits. */
  threadCooldownMs?: number;
  replyCooldownMs?: number;
  /** Start with a moderator, a member and a few threads, so the screens have something in them. */
  seed?: boolean;
}

interface User {
  id: string;
  email: string;
  password: string;
  profile: Profile;
}

export function createMemoryBackend(opts: MemoryOptions = {}): ForumBackend {
  const now = opts.now ?? Date.now;
  const threadCooldown = opts.threadCooldownMs ?? 30_000;
  const replyCooldown = opts.replyCooldownMs ?? 10_000;
  const users: User[] = [];
  let threads: Thread[] = [];
  let replies: Reply[] = [];
  let currentId: string | null = null;
  let counter = 0;
  const savedData = new Map<string, Record<string, UserDataEntry>>();
  const listeners = new Set<(event: AuthEvent, session: Session | null) => void>();
  const iso = (ms = now()) => new Date(ms).toISOString();
  const nextId = (prefix: string) => `${prefix}${++counter}`;

  const sessionOf = (u: User | undefined): Session | null => (u ? { userId: u.id, email: u.email, profile: u.profile } : null);
  const me = () => users.find((u) => u.id === currentId);
  const emit = (event: AuthEvent) => listeners.forEach((l) => l(event, sessionOf(me())));
  const requireMe = (): User => {
    const u = me();
    if (!u) throw new Error("Log in to do that.");
    return u;
  };
  const isMod = (u: User) => u.profile.isAdmin;
  const canChange = (u: User, authorId: string) => u.id === authorId || isMod(u);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.profile.username ?? "unknown";
  const taken = (username: string, exceptId?: string) => users.some((u) => u.id !== exceptId && u.profile.username.toLowerCase() === username.trim().toLowerCase());

  function addUser(email: string, password: string, username: string, isAdmin = false): User {
    const u: User = { id: nextId("u"), email: email.trim().toLowerCase(), password, profile: { id: "", username: username.trim(), isAdmin } };
    u.profile.id = u.id;
    users.push(u);
    return u;
  }

  const throwIf = (message: string | null) => {
    if (message) throw new Error(message);
  };

  const backend: ForumBackend = {
    kind: "memory",

    async getSession() {
      return sessionOf(me());
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signUp(email, password, username) {
      throwIf(validateEmail(email) ?? validatePassword(password) ?? validateUsername(username));
      if (users.some((u) => u.email === email.trim().toLowerCase())) throw new Error("An account with this email already exists.");
      if (taken(username)) throw new Error("That username is taken.");
      currentId = addUser(email, password, username).id;
      emit("SIGNED_IN");
      return { needsConfirmation: false };
    },
    async signIn(email, password) {
      const u = users.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
      if (!u) throw new Error("Wrong email or password.");
      currentId = u.id;
      emit("SIGNED_IN");
    },
    async signInWithProvider(_provider: OAuthProvider) {
      throw new Error("Google and GitHub sign-in need the real backend. Use email and password in this demo.");
    },
    async deleteUserData() {
      savedData.delete(requireMe().id);
    },
    async availableProviders() {
      return [];
    },
    async loadUserData() {
      const u = requireMe();
      return { ...(savedData.get(u.id) ?? {}) };
    },
    async saveUserData(key, value) {
      const u = requireMe();
      const updatedAt = iso();
      savedData.set(u.id, { ...(savedData.get(u.id) ?? {}), [key]: { value: JSON.parse(JSON.stringify(value)) as unknown, updatedAt } });
      return updatedAt;
    },
    async sendPasswordReset(email) {
      throwIf(validateEmail(email));
    },
    async updatePassword(password) {
      const u = requireMe();
      throwIf(validatePassword(password));
      u.password = password;
      emit("UPDATED");
    },
    async signOut() {
      currentId = null;
      emit("SIGNED_OUT");
    },
    async updateUsername(username) {
      const u = requireMe();
      throwIf(validateUsername(username));
      if (taken(username, u.id)) throw new Error("That username is taken.");
      u.profile = { ...u.profile, username: username.trim() };
      emit("UPDATED");
      return u.profile;
    },

    async listThreads({ category, page, pageSize }): Promise<ThreadList> {
      const all = threads
        .filter((t) => !category || t.category === category)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt));
      return { threads: all.slice(page * pageSize, (page + 1) * pageSize).map((t) => ({ ...t, authorName: nameOf(t.authorId) })), total: all.length };
    },
    async getThread(id) {
      const t = threads.find((x) => x.id === id);
      if (!t) return null;
      return {
        thread: { ...t, authorName: nameOf(t.authorId) },
        replies: replies.filter((r) => r.threadId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ ...r, authorName: nameOf(r.authorId) })),
      };
    },
    async createThread({ category, title, body }) {
      const u = requireMe();
      if (!isCategory(category)) throw new Error("Pick a category.");
      throwIf(validateTitle(title) ?? validateThreadBody(body));
      if (threads.some((t) => t.authorId === u.id && now() - Date.parse(t.createdAt) < threadCooldown)) throw new Error("You are posting too quickly. Please wait a moment.");
      const t: Thread = {
        id: nextId("t"), category, title: title.trim(), body: body.trim(), authorId: u.id, authorName: u.profile.username,
        createdAt: iso(), updatedAt: iso(), lastActivityAt: iso(), replyCount: 0, pinned: false, locked: false,
      };
      threads.push(t);
      return { ...t };
    },
    async updateThread(id, { title, body }) {
      const u = requireMe();
      const t = threads.find((x) => x.id === id);
      if (!t) throw new Error("That thread no longer exists.");
      if (!canChange(u, t.authorId)) throw new Error("You can only edit your own posts.");
      throwIf(validateTitle(title) ?? validateThreadBody(body));
      Object.assign(t, { title: title.trim(), body: body.trim(), updatedAt: iso() });
      return { ...t, authorName: nameOf(t.authorId) };
    },
    async deleteThread(id) {
      const u = requireMe();
      const t = threads.find((x) => x.id === id);
      if (!t) return;
      if (!canChange(u, t.authorId)) throw new Error("You can only delete your own posts.");
      threads = threads.filter((x) => x.id !== id);
      replies = replies.filter((r) => r.threadId !== id);
    },
    async setThreadFlags(id, flags) {
      const u = requireMe();
      if (!isMod(u)) throw new Error("Only moderators can do that.");
      const t = threads.find((x) => x.id === id);
      if (!t) throw new Error("That thread no longer exists.");
      if (flags.pinned !== undefined) t.pinned = flags.pinned;
      if (flags.locked !== undefined) t.locked = flags.locked;
      return { ...t, authorName: nameOf(t.authorId) };
    },
    async createReply(threadId, body) {
      const u = requireMe();
      const t = threads.find((x) => x.id === threadId);
      if (!t) throw new Error("That thread no longer exists.");
      if (t.locked && !isMod(u)) throw new Error("This thread is locked.");
      throwIf(validateReply(body));
      if (replies.some((r) => r.authorId === u.id && now() - Date.parse(r.createdAt) < replyCooldown)) throw new Error("You are posting too quickly. Please wait a moment.");
      const r: Reply = { id: nextId("r"), threadId, authorId: u.id, authorName: u.profile.username, body: body.trim(), createdAt: iso(), updatedAt: iso() };
      replies.push(r);
      t.replyCount += 1;
      t.lastActivityAt = r.createdAt;
      return { ...r };
    },
    async updateReply(id, body) {
      const u = requireMe();
      const r = replies.find((x) => x.id === id);
      if (!r) throw new Error("That reply no longer exists.");
      if (!canChange(u, r.authorId)) throw new Error("You can only edit your own replies.");
      throwIf(validateReply(body));
      Object.assign(r, { body: body.trim(), updatedAt: iso() });
      return { ...r, authorName: nameOf(r.authorId) };
    },
    async deleteReply(id) {
      const u = requireMe();
      const r = replies.find((x) => x.id === id);
      if (!r) return;
      if (!canChange(u, r.authorId)) throw new Error("You can only delete your own replies.");
      replies = replies.filter((x) => x.id !== id);
      const t = threads.find((x) => x.id === r.threadId);
      if (t) t.replyCount = Math.max(0, t.replyCount - 1);
    },
  };

  if (opts.seed) {
    const mod = addUser("mod@example.com", "password123", "ModeratorMo", true);
    const member = addUser("player@example.com", "password123", "KnightRider");
    const at = (minutesAgo: number) => iso(now() - minutesAgo * 60_000);
    const mk = (author: User, category: CategoryId, title: string, body: string, minutesAgo: number, pinned = false): Thread => {
      const t: Thread = { id: nextId("t"), category, title, body, authorId: author.id, authorName: author.profile.username, createdAt: at(minutesAgo), updatedAt: at(minutesAgo), lastActivityAt: at(minutesAgo), replyCount: 0, pinned, locked: false };
      threads.push(t);
      return t;
    };
    mk(mod, "feedback", "Welcome! Tell us what you think", "This is the place for feedback, ideas and chess talk. Be kind, stay on topic, and tell us what would make the analyzer more useful for you.", 3000, true);
    const t2 = mk(member, "discussion", "Is the Najdorf worth learning at 1500?", "I keep running into the Sicilian as Black's reply to 1.e4. Is it better to learn a main line properly or play a simpler setup first?", 120);
    mk(member, "feature", "Export my mistakes as a puzzle set", "It would be great to download the practice puzzles so I can study them offline.", 45);
    const r: Reply = { id: nextId("r"), threadId: t2.id, authorId: mod.id, authorName: mod.profile.username, body: "At 1500 I'd learn the ideas first (the plans for both sides) and a small repertoire line; the Najdorf theory can come later.", createdAt: at(90), updatedAt: at(90) };
    replies.push(r);
    t2.replyCount = 1;
    t2.lastActivityAt = r.createdAt;
  }

  return backend;
}
