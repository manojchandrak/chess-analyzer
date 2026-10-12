import { describe, expect, it } from "vitest";
import { friendlyError, profileFromRow, replyFromRow, threadFromRow } from "../supabase";

describe("row mapping", () => {
  it("maps a thread row (with its author) to the app's shape", () => {
    expect(
      threadFromRow({ id: "t1", author_id: "u1", category: "bug", title: "T", body: "B", pinned: true, locked: false, reply_count: 3, created_at: "c", updated_at: "u", last_activity_at: "l", author: { username: "Alice" } }),
    ).toEqual({ id: "t1", category: "bug", title: "T", body: "B", authorId: "u1", authorName: "Alice", createdAt: "c", updatedAt: "u", lastActivityAt: "l", replyCount: 3, pinned: true, locked: false });
  });
  it("shows 'unknown' when the author's profile can't be read", () => {
    expect(threadFromRow({ id: "t", author_id: "u", category: "help", title: "T", body: "B", pinned: false, locked: false, reply_count: 0, created_at: "c", updated_at: "u", last_activity_at: "l", author: null }).authorName).toBe("unknown");
    expect(replyFromRow({ id: "r", thread_id: "t", author_id: "u", body: "x", created_at: "c", updated_at: "u" }).authorName).toBe("unknown");
  });
  it("maps replies and profiles", () => {
    expect(replyFromRow({ id: "r", thread_id: "t", author_id: "u", body: "x", created_at: "c", updated_at: "u", author: { username: "Bob" } })).toEqual({ id: "r", threadId: "t", authorId: "u", authorName: "Bob", body: "x", createdAt: "c", updatedAt: "u" });
    expect(profileFromRow({ id: "u", username: "Bob", is_admin: true })).toEqual({ id: "u", username: "Bob", isAdmin: true });
  });
});

describe("friendlyError", () => {
  const msg = (error: { message?: string; code?: string } | null) => friendlyError(error).message;
  it("turns sign-in and sign-up errors into plain language", () => {
    expect(msg({ message: "Invalid login credentials" })).toBe("Wrong email or password.");
    expect(msg({ message: "Email not confirmed" })).toMatch(/confirm your email/i);
    expect(msg({ message: "User already registered" })).toMatch(/already exists/i);
    expect(msg({ message: "Password should be at least 6 characters" })).toMatch(/at least 8/i);
    expect(msg({ message: "For security purposes, you can only request this after 30 seconds" })).toMatch(/too many attempts/i);
  });
  it("explains permission, uniqueness and network problems", () => {
    expect(msg({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/permission/i);
    expect(msg({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_username_lower"' })).toMatch(/username is taken/i);
    expect(msg({ message: "TypeError: Failed to fetch" })).toMatch(/can't reach the forum/i);
  });
  it("passes on messages raised by the database's own rules", () => {
    expect(msg({ code: "P0001", message: "You are posting too quickly. Please wait a moment." })).toBe("You are posting too quickly. Please wait a moment.");
    expect(msg({ code: "P0001", message: "This thread is locked." })).toBe("This thread is locked.");
  });
  it("falls back to a generic message for anything unrecognised or very long", () => {
    expect(friendlyError(null).message).toBe("Something went wrong. Please try again.");
    expect(friendlyError({ message: "x".repeat(300) }, "Custom fallback").message).toBe("Custom fallback");
  });
});
