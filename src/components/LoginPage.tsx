import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/forum/auth-context";
import type { OAuthProvider } from "../lib/forum/types";
import { ProviderIcon } from "./ProviderIcon";
import { LIMITS, validateEmail, validatePassword, validateUsername } from "../lib/forum/validation";

type Mode = "login" | "signup" | "forgot" | "recovery";

const TITLES: Record<Mode, string> = {
  login: "Log in",
  signup: "Create an account",
  forgot: "Reset your password",
  recovery: "Choose a new password",
};

const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

/** Log in, sign up (email and password, or Google / GitHub), reset a password, or set a new one after following a reset link. */
export function LoginPage({ onDone }: { onDone: () => void }) {
  const { backend, session, recovering, finishRecovery } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    let current = true;
    void backend?.availableProviders().then((list) => {
      if (current) setProviders(list);
    });
    return () => {
      current = false;
    };
  }, [backend]);

  if (!backend) return null;
  const active: Mode = recovering ? "recovery" : mode;

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!backend) return;
    const b = backend;
    if (active === "login") {
      const problem = validateEmail(email) ?? (password ? null : "Enter your password.");
      if (problem) return setError(problem);
      void run(async () => {
        await b.signIn(email, password);
        onDone();
      });
    } else if (active === "signup") {
      const problem = validateUsername(username) ?? validateEmail(email) ?? validatePassword(password);
      if (problem) return setError(problem);
      void run(async () => {
        const { needsConfirmation } = await b.signUp(email, password, username);
        if (needsConfirmation) {
          setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then log in here.`);
          setMode("login");
          setPassword("");
        } else {
          onDone();
        }
      });
    } else if (active === "forgot") {
      const problem = validateEmail(email);
      if (problem) return setError(problem);
      void run(async () => {
        await b.sendPasswordReset(email);
        setNotice(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox.`);
      });
    } else {
      const problem = validatePassword(password);
      if (problem) return setError(problem);
      void run(async () => {
        await b.updatePassword(password);
        finishRecovery();
        onDone();
      });
    }
  }

  // Already signed in (and not resetting a password): nothing to do here.
  if (session && !recovering) {
    return (
      <div className="card login-page">
        <h2>You're logged in</h2>
        <p className="muted">Signed in as {session.profile?.username ?? session.email}.</p>
        <button className="btn btn-primary" onClick={onDone}>
          Continue
        </button>
      </div>
    );
  }

  const social = providers.length > 0 && (active === "login" || active === "signup");

  return (
    <div className="card login-page">
      <h2>{TITLES[active]}</h2>
      {active === "recovery" && <p className="muted small">Pick a new password for your account.</p>}
      {backend.kind === "memory" && (
        <p className="muted small demo-note">
          Demo mode: accounts and posts live only in this tab and disappear on reload. Try <code>player@example.com</code> or <code>mod@example.com</code> with password <code>password123</code>.
        </p>
      )}

      {social && (
        <>
          <div className="social-buttons">
            {providers.map((provider) => (
              <button key={provider} type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => backend.signInWithProvider(provider))}>
                <ProviderIcon provider={provider} />
                Continue with {PROVIDER_NAMES[provider]}
              </button>
            ))}
          </div>
          <p className="muted small login-or">or use your email</p>
        </>
      )}

      <form className="login-form" onSubmit={submit} noValidate>
        {active === "signup" && (
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={LIMITS.usernameMax} aria-describedby="login-username-hint" />
            <span id="login-username-hint" className="muted small">
              {LIMITS.usernameMin}–{LIMITS.usernameMax} characters: letters, numbers, _ and -. Shown on your posts.
            </span>
          </div>
        )}
        {active !== "recovery" && (
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        )}
        {active !== "forgot" && (
          <div className="field">
            <label htmlFor="login-password">{active === "recovery" ? "New password" : "Password"}</label>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={active === "login" ? "current-password" : "new-password"} />
            {active !== "login" && <span className="muted small">At least {LIMITS.passwordMin} characters.</span>}
          </div>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="login-notice" role="status">
            {notice}
          </p>
        )}

        {active === "signup" && <p className="muted small">We keep your email address and username to run your account. Your username and posts are public; your email is not.</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : active === "login" ? "Log in" : active === "signup" ? "Create account" : active === "forgot" ? "Send reset link" : "Save new password"}
        </button>
      </form>

      <div className="login-links">
        {active === "login" && (
          <>
            <button type="button" className="link" onClick={() => switchTo("signup")}>
              Create an account
            </button>
            <button type="button" className="link" onClick={() => switchTo("forgot")}>
              Forgot your password?
            </button>
          </>
        )}
        {(active === "signup" || active === "forgot") && (
          <button type="button" className="link" onClick={() => switchTo("login")}>
            Back to log in
          </button>
        )}
      </div>
    </div>
  );
}
