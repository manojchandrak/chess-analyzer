// Input rules, shared by the forms and the fake backend. The database enforces the same limits
// (see supabase/schema.sql), so these only exist to give a friendly message before a request is sent.

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 24,
  passwordMin: 8,
  titleMin: 3,
  titleMax: 140,
  threadBodyMax: 5000,
  replyMax: 3000,
} as const;

/** Each validator returns an error message, or null when the input is fine. */
export function validateUsername(value: string): string | null {
  const v = value.trim();
  if (v.length < LIMITS.usernameMin || v.length > LIMITS.usernameMax) return `Pick a username of ${LIMITS.usernameMin}–${LIMITS.usernameMax} characters.`;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return "Usernames can only use letters, numbers, underscores and hyphens.";
  return null;
}

export function validateEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Enter a valid email address.";
}

export function validatePassword(value: string): string | null {
  return value.length >= LIMITS.passwordMin ? null : `Use a password of at least ${LIMITS.passwordMin} characters.`;
}

export function validateTitle(value: string): string | null {
  const v = value.trim();
  if (v.length < LIMITS.titleMin) return `Give the thread a title (at least ${LIMITS.titleMin} characters).`;
  if (v.length > LIMITS.titleMax) return `Keep the title under ${LIMITS.titleMax} characters.`;
  return null;
}

export function validateThreadBody(value: string): string | null {
  const v = value.trim();
  if (!v) return "Write something in the post.";
  if (v.length > LIMITS.threadBodyMax) return `Keep the post under ${LIMITS.threadBodyMax.toLocaleString()} characters.`;
  return null;
}

export function validateReply(value: string): string | null {
  const v = value.trim();
  if (!v) return "Write something in the reply.";
  if (v.length > LIMITS.replyMax) return `Keep the reply under ${LIMITS.replyMax.toLocaleString()} characters.`;
  return null;
}

/** "5 minutes ago", "yesterday", "3 Oct 2026": a short, readable time for a post. */
export function formatAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
