import { useState } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { useSyncStatus } from "../lib/sync/status";

const SYNC_NOTES = {
  idle: null,
  syncing: { text: "Saving…", title: "Saving your usernames, settings and progress to your account" },
  saved: { text: "Saved", title: "Your usernames, settings and progress are saved to your account" },
  error: { text: "Not saved", title: "Couldn't save to your account just now. It will try again." },
  unavailable: { text: "Not saved", title: "Saving to your account isn't set up on this site yet." },
} as const;

/** "Log in" for visitors; for signed-in people their username and a way to sign out. Hidden when the forum is off. */
export function AccountMenu({ onLogin }: { onLogin: () => void }) {
  const { status, backend, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const sync = useSyncStatus();
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
      {SYNC_NOTES[sync] && (
        <span className="muted small" title={SYNC_NOTES[sync].title} aria-live="polite">
          {SYNC_NOTES[sync].text}
        </span>
      )}
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
