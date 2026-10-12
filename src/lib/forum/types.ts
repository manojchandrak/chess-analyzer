// Shapes shared by the forum screens and the backends (Supabase for real, an in-memory fake for tests).

export const CATEGORIES = [
  { id: "feedback", label: "Feedback", hint: "What you like, what to improve" },
  { id: "feature", label: "Feature requests", hint: "Ideas for something new" },
  { id: "bug", label: "Bug reports", hint: "Something isn't working" },
  { id: "discussion", label: "Chess discussion", hint: "Openings, games, training" },
  { id: "help", label: "Help & questions", hint: "How do I…?" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const isCategory = (id: string): id is CategoryId => CATEGORIES.some((c) => c.id === id);

export interface Profile {
  id: string;
  username: string;
  isAdmin: boolean;
}

/** The signed-in person: their account and their forum profile (null for a moment after sign-up). */
export interface Session {
  userId: string;
  email: string | null;
  profile: Profile | null;
}

export interface Thread {
  id: string;
  category: CategoryId;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  replyCount: number;
  pinned: boolean;
  locked: boolean;
}

export interface Reply {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "PASSWORD_RECOVERY" | "UPDATED";
export type OAuthProvider = "google" | "github";

export interface ThreadList {
  threads: Thread[];
  total: number;
}

/** Everything the app needs from a forum backend. Errors are thrown as `Error` with a message fit to show. */
export interface ForumBackend {
  readonly kind: "supabase" | "memory";

  // --- accounts ---
  getSession(): Promise<Session | null>;
  onAuthChange(callback: (event: AuthEvent, session: Session | null) => void): () => void;
  /** Resolves with whether the person must confirm their email before they can sign in. */
  signUp(email: string, password: string, username: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  /** The "Continue with ..." sign-in methods that are switched on, so the login page only offers ones that work. */
  availableProviders(): Promise<OAuthProvider[]>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  updateUsername(username: string): Promise<Profile>;

  // --- forum ---
  listThreads(opts: { category?: CategoryId; page: number; pageSize: number }): Promise<ThreadList>;
  getThread(id: string): Promise<{ thread: Thread; replies: Reply[] } | null>;
  createThread(input: { category: CategoryId; title: string; body: string }): Promise<Thread>;
  updateThread(id: string, input: { title: string; body: string }): Promise<Thread>;
  deleteThread(id: string): Promise<void>;
  /** Moderators only. */
  setThreadFlags(id: string, flags: { pinned?: boolean; locked?: boolean }): Promise<Thread>;
  createReply(threadId: string, body: string): Promise<Reply>;
  updateReply(id: string, body: string): Promise<Reply>;
  deleteReply(id: string): Promise<void>;
}
