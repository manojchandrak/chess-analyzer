// The Lichess and Chess.com usernames kept in this browser (and, when logged in, saved to the account). Signed-in people
// are asked whether a loaded username is theirs, and only the ones they say are theirs are saved, so looking at a
// friend's or a stranger's games never overwrites the usernames tied to their own account.
export type Site = "lichess" | "chesscom";

export const USERNAMES_KEY = "chess-analyzer:usernames";

export interface SavedUsernames {
  lichess: string;
  chesscom: string;
  /** The username said to be theirs on each site, kept inside the same saved record so it syncs with it. */
  mine: Partial<Record<Site, string>>;
}

export const SITE_NAMES: Record<Site, string> = { lichess: "Lichess", chesscom: "Chess.com" };

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

const text = (v: unknown) => (typeof v === "string" ? v : "");

export function readUsernames(storage: Reader = window.localStorage): SavedUsernames {
  try {
    const raw = JSON.parse(storage.getItem(USERNAMES_KEY) ?? "{}") as Record<string, unknown>;
    const v = (raw.mine && typeof raw.mine === "object" ? raw.mine : {}) as Record<string, unknown>;
    return { lichess: text(raw.lichess), chesscom: text(raw.chesscom), mine: { ...(text(v.lichess) ? { lichess: text(v.lichess) } : {}), ...(text(v.chesscom) ? { chesscom: text(v.chesscom) } : {}) } };
  } catch {
    return { lichess: "", chesscom: "", mine: {} };
  }
}

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether `name` is the username the person already said is theirs on that site. */
export function isMine(saved: SavedUsernames, site: Site, name: string): boolean {
  return same(saved.mine[site], name);
}

/**
 * Remembers the usernames just loaded. Signed out, everything is remembered on this device as before. Signed in, a name
 * is only remembered if the person said it is theirs; any other name is used for this load but the saved one is left alone.
 */
export function saveUsernames(names: { lichess: string; chesscom: string }, signedIn: boolean, storage: Reader & Writer = window.localStorage): void {
  const saved = readUsernames(storage);
  const pick = (site: Site) => {
    if (isMine(saved, site, names[site])) return saved.mine[site] ?? names[site];
    return !signedIn || !names[site] ? names[site] : saved[site];
  };
  try {
    storage.setItem(USERNAMES_KEY, JSON.stringify({ lichess: pick("lichess"), chesscom: pick("chesscom"), mine: saved.mine }));
  } catch {
    // not remembered; fine
  }
}

/** Records that `name` has been said to be theirs on `site`, and makes it the saved username there. */
export function markMine(site: Site, name: string, storage: Reader & Writer = window.localStorage): SavedUsernames {
  const saved = readUsernames(storage);
  const next: SavedUsernames = { ...saved, [site]: name, mine: { ...saved.mine, [site]: name } };
  try {
    storage.setItem(USERNAMES_KEY, JSON.stringify(next));
  } catch {
    // not remembered; fine
  }
  return next;
}
