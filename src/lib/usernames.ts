// The Lichess and Chess.com usernames kept in this browser (and, when logged in, saved to the account). A username
// the person has proved is theirs is "verified". Signed-in people only save verified names, so looking at a friend's
// or a stranger's games never overwrites the usernames tied to their own account.
export type Site = "lichess" | "chesscom";

export const USERNAMES_KEY = "chess-analyzer:usernames";

export interface SavedUsernames {
  lichess: string;
  chesscom: string;
  /** The username proved to belong to the account on each site, kept inside the same saved record so it syncs with it. */
  verified: Partial<Record<Site, string>>;
}

export const SITE_NAMES: Record<Site, string> = { lichess: "Lichess", chesscom: "Chess.com" };

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

const text = (v: unknown) => (typeof v === "string" ? v : "");

export function readUsernames(storage: Reader = window.localStorage): SavedUsernames {
  try {
    const raw = JSON.parse(storage.getItem(USERNAMES_KEY) ?? "{}") as Record<string, unknown>;
    const v = (raw.verified && typeof raw.verified === "object" ? raw.verified : {}) as Record<string, unknown>;
    return { lichess: text(raw.lichess), chesscom: text(raw.chesscom), verified: { ...(text(v.lichess) ? { lichess: text(v.lichess) } : {}), ...(text(v.chesscom) ? { chesscom: text(v.chesscom) } : {}) } };
  } catch {
    return { lichess: "", chesscom: "", verified: {} };
  }
}

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether `name` is the username already proved to be the person's on that site. */
export function isVerified(saved: SavedUsernames, site: Site, name: string): boolean {
  return same(saved.verified[site], name);
}

/**
 * Remembers the usernames just loaded. Signed out, everything is remembered on this device as before. Signed in, a name
 * is only remembered if it is verified; any other name is used for this load but the saved one is left alone.
 */
export function saveUsernames(names: { lichess: string; chesscom: string }, signedIn: boolean, storage: Reader & Writer = window.localStorage): void {
  const saved = readUsernames(storage);
  const pick = (site: Site) => {
    if (isVerified(saved, site, names[site])) return saved.verified[site] ?? names[site];
    return !signedIn || !names[site] ? names[site] : saved[site];
  };
  try {
    storage.setItem(USERNAMES_KEY, JSON.stringify({ lichess: pick("lichess"), chesscom: pick("chesscom"), verified: saved.verified }));
  } catch {
    // not remembered; fine
  }
}

/** Records that `name` has been proved to belong to the account on `site`, and makes it the saved username there. */
export function markVerified(site: Site, name: string, storage: Reader & Writer = window.localStorage): SavedUsernames {
  const saved = readUsernames(storage);
  const next: SavedUsernames = { ...saved, [site]: name, verified: { ...saved.verified, [site]: name } };
  try {
    storage.setItem(USERNAMES_KEY, JSON.stringify(next));
  } catch {
    // not remembered; fine
  }
  return next;
}
