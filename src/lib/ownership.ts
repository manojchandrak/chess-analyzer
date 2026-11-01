// Proving a Lichess or Chess.com username is yours: the site shows a short code for you to paste somewhere on your own
// public profile (the Lichess "bio", the Chess.com "location"), and we check that the code is there. Only the owner of
// an account can edit its profile, and the code is specific to your login, the site and the username, so it can't be
// copied from someone else's profile.
import type { Site } from "./usernames.ts";

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The code to put on the profile, such as "mca-3fa81c2e90b4d7a1". */
export function ownershipCode(userId: string, site: Site, username: string): string {
  const key = `${userId}|${site}|${username.trim().toLowerCase()}`;
  return `mca-${fnv(`a${key}`)}${fnv(`b${key}`)}`;
}

/** Where on the profile the code goes, in words for the instructions. */
export const WHERE_TO_PUT_CODE: Record<Site, string> = {
  lichess: "the Bio on your Lichess profile (lichess.org/account/profile)",
  chesscom: "the Location field on your Chess.com profile (chess.com/settings)",
};

export type Check = "found" | "missing" | "no-user" | "error";

/** Looks up the public profile and says whether it contains the code. */
export async function checkProfile(site: Site, username: string, code: string, fetchImpl: typeof fetch = fetch): Promise<Check> {
  const name = encodeURIComponent(username.trim());
  const url = site === "lichess" ? `https://lichess.org/api/user/${name}` : `https://api.chess.com/pub/player/${name}`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.status === 404) return "no-user";
    if (!res.ok) return "error";
    const json = (await res.json()) as { profile?: { bio?: unknown }; location?: unknown };
    const field = site === "lichess" ? json.profile?.bio : json.location;
    return typeof field === "string" && field.toLowerCase().includes(code.toLowerCase()) ? "found" : "missing";
  } catch {
    return "error";
  }
}
