// Supabase Edge Function: log in with Lichess.
//
// The web page sends the Lichess access token it just received. This function asks Lichess whose token it is, finds or
// creates the matching account, and hands back a one-time sign-in token that the page exchanges for a normal session.
// Only the real owner of a Lichess account holds a valid token for it, so nobody can sign in as someone else.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function (via Editor) -> name it `lichess-login` -> paste this file,
// then in the function's settings turn OFF "Verify JWT" (the page isn't signed in yet when it calls this; the Lichess token below is the proof).
// It needs no secrets of your own: Supabase provides SUPABASE_URL and its secret key to functions automatically.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The project's secret key (the newer SUPABASE_SECRET_KEYS, or the older service-role key). It never leaves this function. */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, unknown>;
    const key = keys.default ?? Object.values(keys)[0];
    if (typeof key === "string" && key) return key;
  } catch {
    // fall back to the older key
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return reply({ error: "Bad request." }, 400);
  }
  if (typeof token !== "string" || token.length < 10 || token.length > 200) return reply({ error: "Bad request." }, 400);

  // Whose token is it? (Lichess is the only one who can say.)
  const who = await fetch("https://lichess.org/api/account", { headers: { Authorization: `Bearer ${token}` } });
  if (!who.ok) return reply({ error: "Lichess didn't accept the login." }, 401);
  const account = (await who.json()) as { id?: string; username?: string };
  if (!account.id || !account.username || !/^[a-z0-9_-]+$/i.test(account.id)) return reply({ error: "Unexpected answer from Lichess." }, 502);

  // One account per Lichess id. The address is never emailed to; it only gives the account a stable name.
  const email = `lichess-${account.id.toLowerCase()}@lichess.mychessanalyzer.com`;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { user_name: account.username, lichess_id: account.id, lichess_username: account.username },
  });
  // "Already registered" just means this person has logged in with Lichess before.
  if (created.error && !/already|registered|exists/i.test(created.error.message)) return reply({ error: "Couldn't create the account." }, 500);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return reply({ error: "Couldn't start the session." }, 500);

  return reply({ token_hash: tokenHash, username: account.username });
});
