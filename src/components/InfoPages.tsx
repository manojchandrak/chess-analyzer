import { useState } from "react";
import { analyticsAvailable, readConsent, setConsent, type Consent } from "../lib/analytics";
import { useAuth } from "../lib/forum/auth-context";
import { clearDeviceData } from "../lib/deviceData";
import { refreshAfterSync } from "../lib/sync/apply";
import { clearSavedOnDevice } from "../lib/sync/manager";

const REPO = "https://github.com/manojchandrak/chess-analyzer";
const PRIVACY_UPDATED = "13 October 2026";

/** What the site is, who it is for, and what it is built on. */
export function AboutPage({ onClose }: { onClose: () => void }) {
  return (
    <section className="card info-page" aria-labelledby="about-title">
      <h2 id="about-title">About Chess Game Analyzer</h2>
      <p>
        A free tool for understanding your own chess. Load your recent Lichess and Chess.com games, review them with Stockfish right in your browser, see where you lose points and what your playing style is like, then study how the legends played and train
        openings, middlegames and endgames with drills.
      </p>
      <h3>What to expect</h3>
      <ul>
        <li>
          No ads. {analyticsAvailable ? "Anonymous usage statistics (Google Analytics) are collected only if you allow them in the banner." : "No analytics or tracking scripts."} Reviewing games works without an account.
        </li>
        <li>Reviews run on your own device, so there is no per-game limit and your games are not uploaded to anyone.</li>
        <li>An optional account (email, Google or GitHub) saves your usernames, settings and progress so they follow you between devices, and lets you post in the Community tab.</li>
      </ul>
      <h3>Install it</h3>
      <p>
        Add it to your phone or computer like an app. On Android, Chrome or Edge, use the Install app link in the footer (or the browser menu). On iPhone and iPad, tap Share, then Add to Home Screen. Once installed, the board, the drills, the engine and
        anything you have already reviewed work offline; loading games and logging in still need a connection.
      </p>
      <h3>Built on</h3>
      <ul>
        <li>
          <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">
            Stockfish
          </a>{" "}
          (GPL-3.0; the licence is at <a href={`${import.meta.env.BASE_URL}engine/COPYING.txt`}>engine/COPYING.txt</a>), compiled to WebAssembly.
        </li>
        <li>Games from the public APIs of Lichess and Chess.com. Legends' games from PGN Mentor.</li>
        <li>
          Piece sets from the Lichess project, under their own licences (see <a href={`${REPO}/blob/main/public/pieces/CREDITS.md`}>the credits</a>).
        </li>
        <li>
          This project is not affiliated with Lichess or Chess.com. Source code:{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            github.com/manojchandrak/chess-analyzer
          </a>
          .
        </li>
      </ul>
      <h3>Feedback</h3>
      <p>
        Found a problem or have an idea? Use the Community tab if the site shows it, or{" "}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          open an issue on GitHub
        </a>
        .
      </p>
      <p>
        <button className="btn btn-ghost" onClick={onClose}>
          Back to the app
        </button>
      </p>
    </section>
  );
}

type Step = "idle" | "confirm" | "busy" | "done" | "error";

/** What is stored where, who can see it, and the buttons to delete it. */
export function PrivacyPage({ onClose }: { onClose: () => void }) {
  const { backend, session } = useAuth();
  const [cloud, setCloud] = useState<Step>("idle");
  const [device, setDevice] = useState<Step>("idle");
  const [consent, setConsentState] = useState<Consent | null>(() => readConsent());
  const choose = (choice: Consent) => {
    setConsent(choice);
    setConsentState(choice);
  };

  async function deleteSaved() {
    if (!backend) return;
    setCloud("busy");
    try {
      await backend.deleteUserData();
      clearSavedOnDevice(window.localStorage);
      refreshAfterSync();
      setCloud("done");
    } catch {
      setCloud("error");
    }
  }

  async function clearDevice() {
    setDevice("busy");
    try {
      await clearDeviceData();
      setDevice("done");
    } catch {
      setDevice("error");
    }
  }

  return (
    <section className="card info-page" aria-labelledby="privacy-title">
      <h2 id="privacy-title">Privacy</h2>
      <p className="muted small">Last updated {PRIVACY_UPDATED}. This describes what the site does today, in plain language.</p>

      <h3>If you don't log in</h3>
      <ul>
        <li>
          Your usernames, settings, drill and puzzle progress, game ratings and cached engine reviews are kept only in this browser. Nothing about them is sent to this site's operator.
        </li>
        <li>When you load games, your browser asks Lichess and Chess.com for that username's public games, so they see the request. Reviews run on your device.</li>
        <li>The site is hosted on GitHub Pages, which, like any web host, sees technical details of each request (such as your IP address). The site shows no ads. {analyticsAvailable ? "It uses Google Analytics for anonymous usage statistics only if you allow it (see below)." : "It adds no analytics or tracking scripts of its own."}</li>
      </ul>

      <h3>If you log in</h3>
      <ul>
        <li>
          Your account is kept by{" "}
          <a href="https://supabase.com" target="_blank" rel="noreferrer">
            Supabase
          </a>
          : your email address, your username, and your saved usernames, settings, drill and puzzle progress, game history and favourites (the games you opened, with their players and moves), the positions from your reviewed games where you made mistakes, and game ratings. Passwords are sent to Supabase's sign-in service; this site never stores them. Signing in with Google or GitHub shares your email and profile name with Supabase.
        </li>
        <li>Your saved data can be read and changed only by you; a database rule enforces this. Your username and your forum posts are public. Your email address is not shown to anyone.</li>
        <li>Full engine reviews are not saved to your account; they stay in this browser.</li>
      </ul>

      {analyticsAvailable && (
        <>
          <h3>Usage statistics (optional)</h3>
          <p>
            With your permission the site uses Google Analytics to count which tabs are used, on what kind of device and browser and from roughly which country, so it can be improved. It never receives your chess usernames, games or forum text, IP addresses are anonymised, and
            advertising features are turned off. Until you allow it, nothing is loaded from Google.
          </p>
          <p>
            Your choice: <strong>{consent === "granted" ? "allowed" : consent === "denied" ? "not allowed" : "not chosen yet"}</strong>.{" "}
            <button className="btn btn-ghost" onClick={() => choose(consent === "granted" ? "denied" : "granted")}>
              {consent === "granted" ? "Stop usage statistics" : "Allow usage statistics"}
            </button>
          </p>
        </>
      )}

      <h3>Your choices</h3>
      <div className="privacy-actions">
        <div>
          <strong>Delete my saved account data</strong>
          <p className="muted small">
            Removes the usernames, settings and progress saved to your account, and clears them from this device. Other devices you used still hold their own copy and will save it again the next time you log in there; clear them too.
            Your forum posts and the account itself are not removed by this.
          </p>
          {!session ? (
            <p className="muted small">Log in to use this.</p>
          ) : cloud === "confirm" ? (
            <p>
              <button className="btn btn-danger" onClick={() => void deleteSaved()}>
                Yes, delete it
              </button>{" "}
              <button className="btn btn-ghost" onClick={() => setCloud("idle")}>
                Cancel
              </button>
            </p>
          ) : (
            <p>
              <button className="btn btn-ghost" disabled={cloud === "busy"} onClick={() => setCloud("confirm")}>
                Delete my saved account data
              </button>
            </p>
          )}
          {cloud === "done" && <p role="status">Deleted from your account and this device.</p>}
          {cloud === "error" && <p className="error-message">Couldn't delete it just now. Please try again.</p>}
        </div>
        <div>
          <strong>Clear the data on this device</strong>
          <p className="muted small">Removes everything this site stored in this browser, including cached reviews. If you are logged in, your account's saved data returns the next time you log in or the page syncs.</p>
          <p>
            <button className="btn btn-ghost" disabled={device === "busy"} onClick={() => void clearDevice()}>
              Clear this device
            </button>
          </p>
          {device === "done" && <p role="status">Cleared. Reload the page to start fresh.</p>}
          {device === "error" && <p className="error-message">Couldn't clear everything. Try your browser's site-data settings.</p>}
        </div>
        <div>
          <strong>Delete my account or posts</strong>
          <p className="muted small">
            You can edit or delete your own forum posts at any time. To have your account removed entirely,{" "}
            <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
              open an issue on GitHub
            </a>{" "}
            and say which username it is, without including your password.
          </p>
        </div>
      </div>

      <h3>Other services involved</h3>
      <p className="muted small">GitHub (hosting, and optional sign-in), Supabase (accounts and saved data), Google (optional sign-in{analyticsAvailable ? " and, if you allow it, Analytics" : ""}), Lichess and Chess.com (game data). Each has its own privacy policy.</p>

      <p>
        <button className="btn btn-ghost" onClick={onClose}>
          Back to the app
        </button>
      </p>
    </section>
  );
}
