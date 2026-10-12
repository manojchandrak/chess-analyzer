// Runs supabase/schema.sql against a real Postgres (PGlite, in-process) with stand-ins for Supabase's
// auth schema, so the access rules, triggers and limits are tested for real, not just written down.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import schemaSql from "../../../../supabase/schema.sql?raw";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const MOD = "33333333-3333-3333-3333-333333333333";

let db: PGlite;

/** What Supabase provides: the auth.users table, auth.uid() and the anon / authenticated roles. */
const SUPABASE_STANDINS = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
`;

/** Runs SQL as a signed-in member (or as anonymous with null), like a request through the API. */
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false); set role ${user ? "authenticated" : "anon"};`);
  const rows = (await db.query<T>(sql, params)).rows;
  await db.exec("reset role"); // (after a failure the role is reset by the next call, or by failure() below)
  return rows;
}

async function failure(user: string | null, sql: string, params: unknown[] = []): Promise<string> {
  // A failed statement aborts the transaction, so undo just that statement with a savepoint and carry on.
  await db.exec("savepoint attempt");
  try {
    await as(user, sql, params);
  } catch (e) {
    await db.exec("rollback to savepoint attempt; reset role");
    return e instanceof Error ? e.message : String(e);
  }
  await db.exec("release savepoint attempt");
  return "";
}

const signUp = (id: string, email: string, meta: Record<string, string> = {}) => db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [id, email, JSON.stringify(meta)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  await db.exec(schemaSql);
  await db.exec(schemaSql); // the file says it is safe to run again, so prove it
});
afterAll(async () => db.close());

beforeEach(async () => {
  await db.exec("begin");
  await signUp(A, "a@example.com", { username: "Alice" });
  await signUp(B, "b@example.com", { username: "Bob" });
  await signUp(MOD, "mod@example.com", { username: "Moderator" });
  await db.query("update public.profiles set is_admin = true where id = $1", [MOD]);
});
afterEach(async () => {
  await db.exec("rollback");
});

const newThread = (user: string, over: Record<string, unknown> = {}) =>
  as<{ id: string }>(user, "insert into public.forum_threads (author_id, category, title, body) values ($1, $2, $3, $4) returning id", [user, over.category ?? "feedback", over.title ?? "A good title", over.body ?? "Some body text"]).then((r) => r[0].id);

/** Lets a person post again at once, by moving their earlier posts back in time (the rate limit looks at created_at). */
const ageOut = () => db.exec("update public.forum_threads set created_at = now() - interval '1 minute'; update public.forum_replies set created_at = now() - interval '1 minute'");

describe("sign-up creates a profile", () => {
  it("uses the username given at sign-up", async () => {
    expect((await db.query<{ username: string }>("select username from public.profiles where id = $1", [A])).rows[0].username).toBe("Alice");
  });

  it("falls back to the OAuth user name, then the email, and cleans odd characters", async () => {
    const c = "44444444-4444-4444-4444-444444444444";
    const d = "55555555-5555-5555-5555-555555555555";
    const e = "66666666-6666-6666-6666-666666666666";
    await signUp(c, "who@example.com", { user_name: "octo cat!" });
    await signUp(d, "plain.person@example.com");
    await signUp(e, "x@example.com", {});
    const names = (await db.query<{ id: string; username: string }>("select id, username from public.profiles where id in ($1,$2,$3)", [c, d, e])).rows;
    const by = Object.fromEntries(names.map((n) => [n.id, n.username]));
    expect(by[c]).toBe("octocat");
    expect(by[d]).toBe("plainperson");
    expect(by[e]).toBe("player"); // too short after cleaning: "x" becomes the default
  });

  it("gives a taken username (in any capitalisation) a numeric suffix instead of failing the sign-up", async () => {
    const c = "44444444-4444-4444-4444-444444444444";
    await signUp(c, "c@example.com", { username: "alice" });
    const name = (await db.query<{ username: string }>("select username from public.profiles where id = $1", [c])).rows[0].username;
    expect(name).toMatch(/^alice\d{4}$/);
  });
});

describe("who can read", () => {
  it("lets anyone, signed in or not, read profiles, threads and replies", async () => {
    const t = await newThread(A);
    await as(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'hi')", [t, B]);
    expect(await as(null, "select id from public.profiles")).toHaveLength(3);
    expect(await as(null, "select id from public.forum_threads")).toHaveLength(1);
    expect(await as(null, "select id from public.forum_replies")).toHaveLength(1);
  });

  it("does not expose email addresses through profiles", async () => {
    expect(await failure(null, "select email from public.profiles")).toMatch(/column .*email.* does not exist/i);
    expect(await failure(null, "select * from auth.users")).toMatch(/permission denied/i);
  });
});

describe("posting threads", () => {
  it("lets a member post as themselves", async () => {
    expect(await newThread(A)).toBeTruthy();
  });

  it("refuses posting as someone else, or without signing in", async () => {
    expect(await failure(B, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'feedback', 'Fake post', 'x')", [A])).toMatch(/row-level security/i);
    expect(await failure(null, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'feedback', 'Anon post', 'x')", [A])).toMatch(/permission denied/i);
  });

  it("enforces the limits on titles, bodies and categories", async () => {
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'feedback', 'ab', 'x')", [A])).toMatch(/check constraint/i);
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'feedback', 'Fine title', repeat('x', 5001))", [A])).toMatch(/check constraint/i);
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'nonsense', 'Fine title', 'x')", [A])).toMatch(/check constraint/i);
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'feedback', '   ', 'x')", [A])).toMatch(/check constraint/i);
  });

  it("rate-limits a member to one thread every 30 seconds", async () => {
    await newThread(A);
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body) values ($1, 'bug', 'Second thread', 'x')", [A])).toMatch(/posting too quickly/i);
    await ageOut();
    expect(await newThread(A, { title: "Third thread" })).toBeTruthy();
    expect(await newThread(B, { title: "Someone else posts fine" })).toBeTruthy(); // the limit is per person
  });

  it("does not let a member set the counts or flags when posting", async () => {
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body, reply_count) values ($1, 'feedback', 'Sneaky', 'x', 99)", [A])).toMatch(/permission denied/i);
    expect(await failure(A, "insert into public.forum_threads (author_id, category, title, body, pinned) values ($1, 'feedback', 'Sneaky', 'x', true)", [A])).toMatch(/permission denied/i);
  });
});

describe("replies", () => {
  it("count up and move the thread's last activity, and count down when deleted", async () => {
    const t = await newThread(A);
    const before = (await db.query<{ last_activity_at: string }>("select last_activity_at from public.forum_threads where id = $1", [t])).rows[0].last_activity_at;
    await db.exec("update public.forum_threads set last_activity_at = now() - interval '1 hour'");
    const [r] = await as<{ id: string }>(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'A reply') returning id", [t, B]);
    const row = (await db.query<{ reply_count: number; last_activity_at: string }>("select reply_count, last_activity_at from public.forum_threads where id = $1", [t])).rows[0];
    expect(row.reply_count).toBe(1);
    expect(new Date(row.last_activity_at).getTime()).toBeGreaterThan(new Date(before).getTime() - 5000);
    await as(B, "delete from public.forum_replies where id = $1", [r.id]);
    expect((await db.query<{ reply_count: number }>("select reply_count from public.forum_threads where id = $1", [t])).rows[0].reply_count).toBe(0);
  });

  it("are rate-limited to one every 10 seconds per person", async () => {
    const t = await newThread(A);
    await as(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'one')", [t, B]);
    expect(await failure(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'two')", [t, B])).toMatch(/posting too quickly/i);
    await ageOut();
    await as(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'two')", [t, B]);
  });

  it("can't be posted as someone else, or empty, or too long", async () => {
    const t = await newThread(A);
    expect(await failure(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'x')", [t, A])).toMatch(/row-level security/i);
    expect(await failure(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, '  ')", [t, B])).toMatch(/check constraint/i);
    expect(await failure(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, repeat('x', 3001))", [t, B])).toMatch(/check constraint/i);
  });

  it("are refused on a locked thread, except from a moderator", async () => {
    const t = await newThread(A);
    await as(MOD, "update public.forum_threads set locked = true where id = $1", [t]);
    expect(await failure(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'x')", [t, B])).toMatch(/locked/i);
    await as(MOD, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'mod can')", [t, MOD]);
  });

  it("disappear with their thread", async () => {
    const t = await newThread(A);
    await as(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'x')", [t, B]);
    await as(A, "delete from public.forum_threads where id = $1", [t]);
    expect(await as(null, "select id from public.forum_replies")).toHaveLength(0);
  });
});

describe("editing and deleting", () => {
  it("lets authors edit their own thread and marks it as edited", async () => {
    const t = await newThread(A);
    await db.exec("update public.forum_threads set created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'");
    const [row] = await as<{ title: string; updated_at: string; created_at: string }>(A, "update public.forum_threads set title = 'New title', body = 'New body' where id = $1 returning title, updated_at, created_at", [t]);
    expect(row.title).toBe("New title");
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(row.created_at).getTime() + 60_000);
  });

  it("changes nothing when someone edits or deletes another person's post", async () => {
    const t = await newThread(A);
    expect(await as(B, "update public.forum_threads set title = 'Hijacked' where id = $1 returning id", [t])).toHaveLength(0);
    expect(await as(B, "delete from public.forum_threads where id = $1 returning id", [t])).toHaveLength(0);
    expect(await as(null, "select title from public.forum_threads")).toEqual([{ title: "A good title" }]);
  });

  it("can't change who wrote a post, or its counts", async () => {
    const t = await newThread(A);
    expect(await failure(A, "update public.forum_threads set author_id = $2 where id = $1", [t, B])).toMatch(/permission denied/i);
    expect(await failure(A, "update public.forum_threads set reply_count = 50 where id = $1", [t])).toMatch(/permission denied/i);
  });

  it("lets only moderators pin and lock, and lets them delete anything", async () => {
    const t = await newThread(A);
    expect(await failure(A, "update public.forum_threads set pinned = true where id = $1", [t])).toMatch(/only moderators/i);
    expect(await failure(A, "update public.forum_threads set locked = true where id = $1", [t])).toMatch(/only moderators/i);
    expect(await as(MOD, "update public.forum_threads set pinned = true, locked = true where id = $1 returning pinned, locked", [t])).toEqual([{ pinned: true, locked: true }]);
    expect(await as(MOD, "delete from public.forum_threads where id = $1 returning id", [t])).toHaveLength(1);
  });

  it("lets authors and moderators edit and delete replies, and no one else", async () => {
    const t = await newThread(A);
    const [r] = await as<{ id: string }>(B, "insert into public.forum_replies (thread_id, author_id, body) values ($1, $2, 'mine') returning id", [t, B]);
    expect(await as(A, "update public.forum_replies set body = 'hijack' where id = $1 returning id", [r.id])).toHaveLength(0);
    expect(await as(B, "update public.forum_replies set body = 'edited' where id = $1 returning body", [r.id])).toEqual([{ body: "edited" }]);
    expect(await as(A, "delete from public.forum_replies where id = $1 returning id", [r.id])).toHaveLength(0);
    expect(await as(MOD, "delete from public.forum_replies where id = $1 returning id", [r.id])).toHaveLength(1);
  });
});

describe("profiles", () => {
  it("lets a member change their own username only", async () => {
    expect(await as(A, "update public.profiles set username = 'Alice2' where id = $1 returning username", [A])).toEqual([{ username: "Alice2" }]);
    expect(await as(A, "update public.profiles set username = 'Hijacked' where id = $1 returning id", [B])).toHaveLength(0);
  });

  it("never lets a member make themselves a moderator or take a taken name", async () => {
    expect(await failure(A, "update public.profiles set is_admin = true where id = $1", [A])).toMatch(/permission denied/i);
    expect(await failure(A, "update public.profiles set username = 'bob' where id = $1", [A])).toMatch(/unique|duplicate/i);
    expect(await failure(A, "update public.profiles set username = 'x' where id = $1", [A])).toMatch(/check constraint/i);
  });
});
