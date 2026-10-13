// The real forum backend, on Supabase (Postgres + Auth). The public URL and anon key identify the project and
// are safe to ship: what each person can read or change is decided by the row-level security rules in
// supabase/schema.sql, not by this code.
import type { SupabaseClient, Session as SbSession } from "@supabase/supabase-js";
import { SyncUnavailableError, type AuthEvent, type CategoryId, type ForumBackend, type OAuthProvider, type Profile, type Reply, type Session, type Thread } from "./types.ts";
import { validateEmail, validatePassword, validateReply, validateThreadBody, validateTitle, validateUsername } from "./validation.ts";

// ---- rows as the database returns them ----
interface ThreadRow {
  id: string;
  author_id: string;
  category: CategoryId;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  author?: { username: string } | null;
}

interface ReplyRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: { username: string } | null;
}

interface ProfileRow {
  id: string;
  username: string;
  is_admin: boolean;
}

export const threadFromRow = (r: ThreadRow): Thread => ({
  id: r.id,
  category: r.category,
  title: r.title,
  body: r.body,
  authorId: r.author_id,
  authorName: r.author?.username ?? "unknown",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastActivityAt: r.last_activity_at,
  replyCount: r.reply_count,
  pinned: r.pinned,
  locked: r.locked,
});

export const replyFromRow = (r: ReplyRow): Reply => ({
  id: r.id,
  threadId: r.thread_id,
  authorId: r.author_id,
  authorName: r.author?.username ?? "unknown",
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const profileFromRow = (r: ProfileRow): Profile => ({ id: r.id, username: r.username, isAdmin: r.is_admin });

/** Turns a Supabase/Postgres error into a message that makes sense to the person who caused it. */
export function friendlyError(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again."): Error {
  const message = error?.message ?? "";
  if (/invalid login credentials/i.test(message)) return new Error("Wrong email or password.");
  if (/email not confirmed/i.test(message)) return new Error("Please confirm your email first: check your inbox for the link we sent.");
  if (/already registered|already been registered/i.test(message)) return new Error("An account with this email already exists.");
  if (/rate limit|too many requests|security purposes/i.test(message)) return new Error("Too many attempts. Please wait a minute and try again.");
  if (/password should be at least/i.test(message)) return new Error("Use a password of at least 8 characters.");
  if (error?.code === "42501" || /row-level security|permission denied/i.test(message)) return new Error("You don't have permission to do that. Try logging in again.");
  if (error?.code === "23505" && /username/i.test(message)) return new Error("That username is taken.");
  // Messages raised by our own database rules (rate limits, locked threads) are already written for people.
  if (error?.code === "P0001" && message) return new Error(message);
  if (/failed to fetch|network/i.test(message)) return new Error("Can't reach the forum right now. Check your connection and try again.");
  return new Error(message && message.length < 160 ? message : fallback);
}

/** Which of the Google / GitHub sign-in methods a Supabase project has switched on, from its public auth settings. */
export function enabledProviders(settings: unknown): OAuthProvider[] {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external;
  return (["google", "github"] as const).filter((p) => external?.[p] === true);
}

/** Supabase's error for the saved-data table, with "the table doesn't exist yet" told apart so the app can quietly stop trying. */
export function userDataError(error: { message?: string; code?: string } | null | undefined): Error {
  const missing = error?.code === "42P01" || error?.code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(error?.message ?? "");
  return missing ? new SyncUnavailableError() : friendlyError(error, "Couldn't save your data. Please try again.");
}

const THREAD_SELECT = "*, author:profiles!forum_threads_author_id_fkey(username)";
const REPLY_SELECT = "*, author:profiles!forum_replies_author_id_fkey(username)";

export async function createSupabaseBackend(url: string, anonKey: string): Promise<ForumBackend> {
  const { createClient } = await import("@supabase/supabase-js");
  // PKCE keeps the sign-in tokens out of the URL hash, which this app uses for its own links.
  const supabase: SupabaseClient = createClient(url, anonKey, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

  async function profileOf(userId: string): Promise<Profile | null> {
    const { data } = await supabase.from("profiles").select("id, username, is_admin").eq("id", userId).maybeSingle();
    return data ? profileFromRow(data as ProfileRow) : null;
  }

  async function toSession(s: SbSession | null): Promise<Session | null> {
    if (!s) return null;
    // The profile is created by a database trigger just after sign-up; give it a moment to appear.
    let profile = await profileOf(s.user.id);
    for (let i = 0; i < 3 && !profile; i++) {
      await new Promise((r) => setTimeout(r, 400));
      profile = await profileOf(s.user.id);
    }
    return { userId: s.user.id, email: s.user.email ?? null, profile };
  }

  async function userId(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Log in to do that.");
    return data.session.user.id;
  }

  const throwIf = (message: string | null) => {
    if (message) throw new Error(message);
  };

  return {
    kind: "supabase",

    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },
    onAuthChange(callback) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const mapped: AuthEvent | null = event === "SIGNED_IN" || event === "INITIAL_SESSION" ? "SIGNED_IN" : event === "SIGNED_OUT" ? "SIGNED_OUT" : event === "PASSWORD_RECOVERY" ? "PASSWORD_RECOVERY" : event === "USER_UPDATED" || event === "TOKEN_REFRESHED" ? "UPDATED" : null;
        if (!mapped) return;
        // Don't call back into Supabase from inside its own callback: do it on the next tick.
        setTimeout(() => void toSession(session).then((s) => callback(mapped, s)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password, username) {
      throwIf(validateEmail(email) ?? validatePassword(password) ?? validateUsername(username));
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("username", username.trim());
      if (count) throw new Error("That username is taken.");
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() }, emailRedirectTo: siteUrl() } });
      if (error) throw friendlyError(error);
      // With email confirmation on there is no session yet; an existing address comes back with no identities.
      if (data.user && data.user.identities?.length === 0) throw new Error("An account with this email already exists.");
      return { needsConfirmation: !data.session };
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw friendlyError(error);
    },
    async loadUserData() {
      const { data, error } = await supabase.from("user_data").select("key, value, updated_at");
      if (error) throw userDataError(error);
      return Object.fromEntries((data ?? []).map((row) => [row.key as string, { value: row.value as unknown, updatedAt: row.updated_at as string }]));
    },
    async saveUserData(key, value) {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new Error("Log in to save your data.");
      const { data, error } = await supabase.from("user_data").upsert({ user_id: userId, key, value }, { onConflict: "user_id,key" }).select("updated_at").single();
      if (error) throw userDataError(error);
      return data.updated_at as string;
    },
    async availableProviders() {
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: anonKey } });
        return res.ok ? enabledProviders(await res.json()) : [];
      } catch {
        return []; // can't tell, so offer none rather than buttons that may not work
      }
    },
    async signInWithProvider(provider: OAuthProvider) {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } });
      if (error) throw friendlyError(error);
    },
    async sendPasswordReset(email) {
      throwIf(validateEmail(email));
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() });
      if (error) throw friendlyError(error);
    },
    async updatePassword(password) {
      throwIf(validatePassword(password));
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw friendlyError(error);
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw friendlyError(error);
    },
    async updateUsername(username) {
      throwIf(validateUsername(username));
      const id = await userId();
      const { data, error } = await supabase.from("profiles").update({ username: username.trim() }).eq("id", id).select("id, username, is_admin").single();
      if (error) throw friendlyError(error);
      return profileFromRow(data as ProfileRow);
    },

    async listThreads({ category, page, pageSize }) {
      let q = supabase.from("forum_threads").select(THREAD_SELECT, { count: "exact" }).order("pinned", { ascending: false }).order("last_activity_at", { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
      if (category) q = q.eq("category", category);
      const { data, error, count } = await q;
      if (error) throw friendlyError(error, "Couldn't load the forum.");
      return { threads: (data as ThreadRow[]).map(threadFromRow), total: count ?? 0 };
    },
    async getThread(id) {
      const { data: t, error } = await supabase.from("forum_threads").select(THREAD_SELECT).eq("id", id).maybeSingle();
      if (error) throw friendlyError(error, "Couldn't load this thread.");
      if (!t) return null;
      const { data: rs, error: rErr } = await supabase.from("forum_replies").select(REPLY_SELECT).eq("thread_id", id).order("created_at", { ascending: true });
      if (rErr) throw friendlyError(rErr, "Couldn't load the replies.");
      return { thread: threadFromRow(t as ThreadRow), replies: (rs as ReplyRow[]).map(replyFromRow) };
    },
    async createThread({ category, title, body }) {
      throwIf(validateTitle(title) ?? validateThreadBody(body));
      const id = await userId();
      const { data, error } = await supabase.from("forum_threads").insert({ author_id: id, category, title: title.trim(), body: body.trim() }).select(THREAD_SELECT).single();
      if (error) throw friendlyError(error);
      return threadFromRow(data as ThreadRow);
    },
    async updateThread(id, { title, body }) {
      throwIf(validateTitle(title) ?? validateThreadBody(body));
      const { data, error } = await supabase.from("forum_threads").update({ title: title.trim(), body: body.trim() }).eq("id", id).select(THREAD_SELECT).single();
      if (error) throw friendlyError(error);
      return threadFromRow(data as ThreadRow);
    },
    async deleteThread(id) {
      const { error } = await supabase.from("forum_threads").delete().eq("id", id);
      if (error) throw friendlyError(error);
    },
    async setThreadFlags(id, flags) {
      const { data, error } = await supabase.from("forum_threads").update(flags).eq("id", id).select(THREAD_SELECT).single();
      if (error) throw friendlyError(error);
      return threadFromRow(data as ThreadRow);
    },
    async createReply(threadId, body) {
      throwIf(validateReply(body));
      const id = await userId();
      const { data, error } = await supabase.from("forum_replies").insert({ thread_id: threadId, author_id: id, body: body.trim() }).select(REPLY_SELECT).single();
      if (error) throw friendlyError(error);
      return replyFromRow(data as ReplyRow);
    },
    async updateReply(id, body) {
      throwIf(validateReply(body));
      const { data, error } = await supabase.from("forum_replies").update({ body: body.trim() }).eq("id", id).select(REPLY_SELECT).single();
      if (error) throw friendlyError(error);
      return replyFromRow(data as ReplyRow);
    },
    async deleteReply(id) {
      const { error } = await supabase.from("forum_replies").delete().eq("id", id);
      if (error) throw friendlyError(error);
    },
  };
}
