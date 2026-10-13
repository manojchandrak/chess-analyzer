import { useEffect, useState } from "react";
import { analyticsAvailable, readConsent, setConsent, startIfConsented, trackPage } from "../lib/analytics";

/** Asks once whether anonymous usage statistics (Google Analytics) are okay, and reports tab changes if they are.
 * Renders nothing when analytics isn't configured. */
export function AnalyticsConsent({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const [asked, setAsked] = useState(() => !analyticsAvailable || readConsent() !== null);

  useEffect(() => {
    startIfConsented();
    trackPage(window.location.hash);
    const onHash = () => trackPage(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (asked) return null;
  const choose = (choice: "granted" | "denied") => {
    setConsent(choice);
    setAsked(true);
  };
  return (
    <div className="consent-banner" role="dialog" aria-label="Usage statistics">
      <p>
        Allow anonymous usage statistics (Google Analytics) to help improve the site? It counts which tabs are used, never your usernames or games.{" "}
        <button className="link-button" onClick={onOpenPrivacy}>
          Details
        </button>
      </p>
      <div className="consent-actions">
        <button className="btn btn-primary" onClick={() => choose("granted")}>
          Allow
        </button>
        <button className="btn btn-ghost" onClick={() => choose("denied")}>
          No thanks
        </button>
      </div>
    </div>
  );
}
