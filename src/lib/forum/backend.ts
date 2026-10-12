// Which forum backend this build uses: Supabase when the project's URL and anon key are configured,
// an in-memory fake for local screen-testing (VITE_FORUM_MOCK=1), or none (the forum shows setup steps).
import type { ForumBackend } from "./types.ts";

export type ForumConfig = { mode: "supabase"; url: string; anonKey: string } | { mode: "mock" } | { mode: "off" };

export function forumConfig(env: Pick<ImportMetaEnv, "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY" | "VITE_FORUM_MOCK"> = import.meta.env): ForumConfig {
  if (env.VITE_FORUM_MOCK === "1") return { mode: "mock" };
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { mode: "supabase", url, anonKey } : { mode: "off" };
}

let backend: Promise<ForumBackend | null> | null = null;

/** The forum backend, created on first use (and its code loaded only then), or null when the forum is off. */
export function getForumBackend(config: ForumConfig = forumConfig()): Promise<ForumBackend | null> {
  backend ??= (async () => {
    if (config.mode === "supabase") return (await import("./supabase.ts")).createSupabaseBackend(config.url, config.anonKey);
    if (config.mode === "mock") return (await import("./memory.ts")).createMemoryBackend({ seed: true, threadCooldownMs: 2000, replyCooldownMs: 1000 });
    return null;
  })();
  return backend;
}
