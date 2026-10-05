import { useState } from "react";
import { useAuth } from "../lib/forum/auth-context";

/** "Log in" for visitors; for signed-in people their username and a way to sign out. Hidden when the forum is off. */
export function AccountMenu({ onLogin }: { onLogin: () => void }) {
  const { status, backend, session } = useAuth();
  const [busy, setBusy] = useState(false);
  if (status !== "ready" || !backend) return null;

  if (!session) {
    return (
      <div className="account-bar">
        <button className="btn btn-ghost" onClick={onLogin}>
          Log in
        </button>
      </div>
    );
  }
  const name = session.profile?.username ?? session.email ?? "you";
  return (
    <div className="account-bar">
      <span className="account-name" title={session.email ?? undefined}>
        {name}
        {session.profile?.isAdmin && <span className="tag">moderator</span>}
      </span>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void backend.signOut().finally(() => setBusy(false));
        }}
      >
        Log out
      </button>
    </div>
  );
}
