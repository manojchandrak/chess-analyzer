/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd1234.supabase.co (the forum and login are off without it). */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's public "anon" key (safe to ship; row-level security protects the data). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Optional Google Analytics 4 Measurement ID (G-XXXXXXXX). Analytics stays off without it. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** "1" runs the forum against an in-memory fake backend, for trying the screens locally. */
  readonly VITE_FORUM_MOCK?: string;
  /** "1" shows "Continue with Lichess" on the login page (set once the `lichess-login` Supabase function is deployed). */
  readonly VITE_LICHESS_LOGIN?: string;
}
