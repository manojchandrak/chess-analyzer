import { useEffect } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { refreshAfterSync } from "../lib/sync/apply";
import { createSync } from "../lib/sync/manager";
import { setSyncStatus } from "../lib/sync/status";

const CHECK_EVERY_MS = 15_000;

/** While someone is signed in, keeps their saved data in step with their account: on login, when the tab comes
 * back into view, and shortly after anything changes. Renders nothing. */
export function SyncBridge() {
  const { backend, session } = useAuth();
  const userId = session?.userId;

  useEffect(() => {
    if (!backend || !userId) {
      setSyncStatus("idle");
      return;
    }
    let storage: Storage;
    try {
      storage = window.localStorage;
    } catch {
      return; // storage blocked: nothing to keep in step
    }
    const sync = createSync({ backend, storage, userId, onApplied: refreshAfterSync, onStatus: setSyncStatus });
    void sync.run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && sync.hasChanges()) void sync.run();
    }, CHECK_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible" || sync.hasChanges()) void sync.run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      setSyncStatus("idle");
    };
  }, [backend, userId]);

  return null;
}
