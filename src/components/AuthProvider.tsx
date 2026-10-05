import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getForumBackend } from "../lib/forum/backend";
import { AuthContext, type AuthState } from "../lib/forum/auth-context";
import type { ForumBackend, Session } from "../lib/forum/types";

/** Starts the forum backend and keeps the signed-in person (if any) up to date for the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<ForumBackend | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    getForumBackend().then(
      async (b) => {
        if (cancelled) return;
        if (!b) {
          setStatus("off");
          return;
        }
        setBackend(b);
        unsubscribe = b.onAuthChange((event, s) => {
          if (cancelled) return;
          setSession(s);
          if (event === "PASSWORD_RECOVERY") setRecovering(true);
        });
        const initial = await b.getSession().catch(() => null);
        if (cancelled) return;
        setSession((current) => current ?? initial);
        setStatus("ready");
      },
      () => !cancelled && setStatus("off"),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const finishRecovery = useCallback(() => setRecovering(false), []);
  const value = useMemo<AuthState>(() => ({ status, backend, session, recovering, finishRecovery }), [status, backend, session, recovering, finishRecovery]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
