# Log in with Lichess: setup

"Continue with Lichess" lets someone log in with their Lichess account. The first time, an account is created for them
with their Lichess username, and that username is saved to the account as their Lichess username. Nothing is asked
of Lichess beyond "who is this?" (no email, no games, no permissions), and there is no app to register with Lichess.

The button stays hidden until you finish the two steps below.

## How it works

1. The login page sends the person to Lichess to approve (OAuth, authorization code with PKCE).
2. Lichess sends them back to `/lichess-callback/`, a small static page that hands the one-time code to the app.
3. The app swaps the code for an access token with Lichess, then sends the token to the `lichess-login` function.
4. The function asks Lichess whose token it is, finds or creates the account for that Lichess id, and returns a
   one-time sign-in token. The app exchanges it for a normal session. Only the real owner of a Lichess account has a
   valid token for it, so nobody can log in as someone else.

Accounts made this way have a placeholder address (`lichess-<id>@lichess.mychessanalyzer.com`) that is never emailed,
so there is no password to reset. They log in with Lichess each time.

## Step 1: deploy the function (Supabase dashboard)

1. Open your project -> **Edge Functions** -> **Deploy a new function** (the in-browser editor).
2. Name it exactly `lichess-login`.
3. Paste the contents of `supabase/functions/lichess-login/index.ts` and deploy.

It needs no secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to functions automatically, and the
service-role key never reaches the browser.

Also check **Authentication -> Sign In / Providers -> Email -> "Allow new users to sign up"** is on.

## Step 2: turn the button on

Add a GitHub Actions variable (repo -> Settings -> Secrets and variables -> Actions -> Variables):

```
VITE_LICHESS_LOGIN = 1
```

then re-run the latest "Deploy to GitHub Pages" run (or push any change). For local testing put `VITE_LICHESS_LOGIN=1`
in `.env.local`.

## Notes

- The return address Lichess uses is `<your site>/lichess-callback/`. Lichess needs no registration of it.
- Someone who already has an email account and also logs in with Lichess gets a separate account; the two aren't merged.
- The saved username lives in the account's saved data (`usernames`), the same place as usernames added by hand.
