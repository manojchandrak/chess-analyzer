import { reloadBoardPrefs } from "../boardPrefs.ts";
import { reloadProgress } from "../drills.ts";
import { reloadGameStats } from "../gameStats.ts";

/** Makes the running app pick up saved data that was just written into browser storage. (Usernames, options and
 * solved puzzles are read when their screens open, so they need nothing.) */
export function refreshAfterSync(): void {
  reloadProgress();
  reloadGameStats();
  reloadBoardPrefs();
  window.dispatchEvent(new Event(SYNCED_EVENT));
}

/** Fired after saved data was written into browser storage; screens that read it only once listen for it. */
export const SYNCED_EVENT = "chess-analyzer:synced";
