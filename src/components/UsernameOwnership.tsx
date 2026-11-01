import { useState } from "react";
import { useAuth } from "../lib/forum/auth-context";
import { checkProfile, ownershipCode, WHERE_TO_PUT_CODE, type Check } from "../lib/ownership";
import { SYNCED_EVENT } from "../lib/sync/apply";
import { isVerified, markVerified, readUsernames, SITE_NAMES, type Site } from "../lib/usernames";

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

const PROBLEMS: Record<Exclude<Check, "found">, string> = {
  missing: "We couldn't find the code on that profile yet. Save it there, wait a few seconds, and try again.",
  "no-user": "That username doesn't exist on this site. Check the spelling.",
  error: "Couldn't reach the site to check. Try again in a moment.",
};

/**
 * For someone who is logged in: when the games just loaded belong to a username that isn't tied to their account yet,
 * asks whether it is theirs. If it is, they prove it with a code on their public profile and it is saved to their
 * account; if it isn't (a friend, an opponent, a stranger) nothing is saved. Shows nothing when logged out.
 */
export function UsernameOwnership({ loaded }: { loaded: { lichess: string; chesscom: string } | null }) {
  const { session } = useAuth();
  const [step, setStep] = useState<Record<string, "code">>({});
  const [skipped, setSkipped] = useState(notMine);
  const [problem, setProblem] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [verifiedNow, setVerifiedNow] = useState<string[]>([]);
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

  async function verify(site: Site, name: string, code: string) {
    const key = keyOf(site, name);
    setChecking(key);
    const result = await checkProfile(site, name, code);
    setChecking(null);
    if (result === "found") {
      markVerified(site, name.trim());
      setVerifiedNow((v) => [...v, key]);
      window.dispatchEvent(new Event(SYNCED_EVENT));
    } else {
      setProblem((p) => ({ ...p, [key]: PROBLEMS[result] }));
    }
  }

  return (
    <>
      {SITES.map((site) => {
        const name = loaded[site].trim();
        if (!name) return null;
        const key = keyOf(site, name);
        if (verifiedNow.includes(key)) {
          return (
            <p key={key} className="puzzle-ok" role="status">
              ✓ {name} is now saved to your account as your {SITE_NAMES[site]} username.
            </p>
          );
        }
        if (isVerified(saved, site, name) || skipped.includes(key)) return null;
        if (step[key] === "code") {
          const code = ownershipCode(session.userId, site, name);
          return (
            <div key={key} className="card ownership">
              <p>
                To prove <strong>{name}</strong> is yours, add this code to {WHERE_TO_PUT_CODE[site]}, save it, then press Verify. You can remove the code afterwards.
              </p>
              <p>
                <code className="ownership-code">{code}</code>{" "}
                <button type="button" className="link" onClick={() => void navigator.clipboard?.writeText(code)}>
                  Copy
                </button>
              </p>
              {problem[key] && <p className="error-message">{problem[key]}</p>}
              <div className="puzzle-nav">
                <button type="button" className="btn btn-primary" disabled={checking === key} onClick={() => void verify(site, name, code)}>
                  {checking === key ? "Checking…" : "Verify"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => skip(key)}>
                  Cancel
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={key} className="card ownership">
            <p>
              Is <strong>{name}</strong> your {SITE_NAMES[site]} account? Only your own accounts are saved to your login; anyone else's games are just viewed.
            </p>
            <div className="puzzle-nav">
              <button type="button" className="btn btn-primary" onClick={() => setStep((s) => ({ ...s, [key]: "code" }))}>
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
