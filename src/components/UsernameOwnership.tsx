import { useState } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { SYNCED_EVENT } from "../lib/sync/apply";
import { isMine, markMine, readUsernames, SITE_NAMES, type Site } from "../lib/usernames";

const NOT_MINE_KEY = "chess-analyzer:not-mine";
const SITES: Site[] = ["lichess", "chesscom"];

const keyOf = (site: Site, name: string) => `${site}:${name.trim().toLowerCase()}`;

function notMine(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(NOT_MINE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * For someone who is logged in: when the games just loaded belong to a username that isn't tied to their account yet,
 * asks whether it is theirs. Yes saves it to their account; no (a friend, an opponent, a stranger) saves nothing.
 * Shows nothing when logged out.
 */
export function UsernameOwnership({ loaded }: { loaded: { lichess: string; chesscom: string } | null }) {
  const { session } = useAuth();
  const [skipped, setSkipped] = useState(notMine);
  const [savedNow, setSavedNow] = useState<string[]>([]);
  if (!session || !loaded) return null;
  const saved = readUsernames();

  function skip(key: string) {
    const next = [...skipped, key];
    setSkipped(next);
    try {
      sessionStorage.setItem(NOT_MINE_KEY, JSON.stringify(next));
    } catch {
      // asked again next time; fine
    }
  }

  function accept(site: Site, name: string, key: string) {
    markMine(site, name.trim());
    setSavedNow((s) => [...s, key]);
    window.dispatchEvent(new Event(SYNCED_EVENT));
  }

  return (
    <>
      {SITES.map((site) => {
        const name = loaded[site].trim();
        if (!name) return null;
        const key = keyOf(site, name);
        if (savedNow.includes(key)) {
          return (
            <p key={key} className="puzzle-ok" role="status">
              ✓ {name} is now saved to your account as your {SITE_NAMES[site]} username.
            </p>
          );
        }
        if (isMine(saved, site, name) || skipped.includes(key)) return null;
        return (
          <div key={key} className="card ownership">
            <p>
              Is <strong>{name}</strong> your {SITE_NAMES[site]} account? Only your own accounts are saved to your login; anyone else's games are just viewed.
            </p>
            <div className="puzzle-nav">
              <button type="button" className="btn btn-primary" onClick={() => accept(site, name, key)}>
                Yes, it's mine
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => skip(key)}>
                No, someone else's
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
