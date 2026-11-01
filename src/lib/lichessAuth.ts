// "Log in with Lichess": the standard OAuth sign-in for browser apps (authorization code with PKCE, which needs no secret
// and no app registration). Lichess sends the person back with a one-time code; we swap it for an access token, and
// the backend uses the token only to learn which Lichess account it belongs to. No special permissions are asked for.
import { parseHash } from "./route.ts";

const AUTHORIZE_URL = "https://lichess.org/oauth";
const TOKEN_URL = "https://lichess.org/api/token";
const PENDING_KEY = "chess-analyzer:lichess-login";

/** Shown to the person on Lichess's approval page. */
export const CLIENT_ID = "mychessanalyzer.com";

/** Switched on (VITE_LICHESS_LOGIN=1) once the backend's `lichess-login` function is deployed. */
export const lichessLoginEnabled = import.meta.env.VITE_LICHESS_LOGIN === "1";

export function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(length)));
}

/** The PKCE "challenge" for a secret verifier: its SHA-256, base64url-encoded. */
export async function challengeFor(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Where Lichess sends the person back to: a tiny static page that hands the result to the app. */
export function redirectUri(origin = window.location.origin, base = import.meta.env.BASE_URL): string {
  return `${origin}${base}lichess-callback/`;
}

export function authorizeUrl(challenge: string, state: string, redirect = redirectUri()): string {
  const params = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: redirect, code_challenge_method: "S256", code_challenge: challenge, state });
  return `${AUTHORIZE_URL}?${params}`;
}

/** Sends the person to Lichess to approve the login. */
export async function startLichessLogin(): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(16);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  window.location.assign(authorizeUrl(await challengeFor(verifier), state));
}

export interface Callback {
  code: string | null;
  state: string | null;
  error: string | null;
}

/** What the callback page put in the address, or null when this isn't a return from Lichess. */
export function readCallback(hash: string): Callback | null {
  const query = hash.replace(/^#\/?/, "").split("?")[1];
  if (!query || parseHash(hash).tab !== "login") return null;
  const p = new URLSearchParams(query);
  const code = p.get("lcode");
  const error = p.get("lerror");
  if (!code && !error) return null;
  return { code, state: p.get("lstate"), error };
}

/** The return from Lichess, captured as the page loads: the app tidies the address bar soon after, which would drop it. */
export const initialCallback: Callback | null = typeof window === "undefined" ? null : readCallback(window.location.hash);

/** Swaps the one-time code for an access token. The state must match the one saved when the login started. */
export async function finishLichessLogin(callback: Callback, fetchImpl: typeof fetch = fetch): Promise<string> {
  let pending: { verifier?: string; state?: string } = {};
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "{}") as typeof pending;
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // treated as no login in progress
  }
  if (callback.error) throw new Error("Lichess login was cancelled.");
  if (!callback.code || !pending.verifier || !pending.state || pending.state !== callback.state) throw new Error("That Lichess login link has expired. Please try again.");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: callback.code, code_verifier: pending.verifier, redirect_uri: redirectUri(), client_id: CLIENT_ID }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error("Lichess didn't accept the login. Please try again.");
  return json.access_token;
}
