import { useSyncExternalStore } from "react";
import type { SyncStatus } from "./manager.ts";

let current: SyncStatus = "idle";
const listeners = new Set<() => void>();

export function setSyncStatus(next: SyncStatus): void {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

/** How saving to the account is going, for the little note next to the username. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
