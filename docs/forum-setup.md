# Setting up the forum and login (Supabase)

The forum and login run on [Supabase](https://supabase.com) (hosted Postgres plus sign-in). The site itself stays a
static page on GitHub Pages; it talks to your Supabase project directly from the browser. Until the two values in
step 5 are set, the Community tab and the Log in button stay hidden, so nothing breaks.

## 1. Create the project

1. Sign up at supabase.com and click **New project** (the free plan is enough).
2. Pick a name, a database password (save it somewhere safe; this app never needs it) and the region nearest you.

## 2. Create the tables and rules

1. In the project, open **SQL Editor** and click **New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**. It is safe to run again later.

This also creates the `user_data` table that holds each signed-in person's saved usernames, settings and progress (only they
can read or change their own rows). If the Log in button works but the account menu shows **Not saved**, the table is
missing: run the SQL file again.

This creates the profiles, threads and replies tables, and the rules that decide who can do what (everyone can read,
signed-in people can post as themselves and edit or delete their own posts, moderators can moderate, and posting is
rate-limited). Those rules live in the database, so they apply no matter what the web page does.

## 3. Turn on the sign-in methods

Open **Authentication, Providers**.

- **Email**: switch it on. Leave **Confirm email** on (recommended): new people get a link to confirm their address.
- **Google** (optional): in Google Cloud Console create an OAuth client of type *Web application*, add the
  **Callback URL** shown on the Supabase Google provider page as an authorized redirect URI, then paste the client ID
  and secret into Supabase.
- **GitHub** (optional): in GitHub, Settings, Developer settings, OAuth Apps, create an app with the same
  **Callback URL** (it looks like `https://<project-ref>.supabase.co/auth/v1/callback`), then paste its client ID and
  secret into Supabase.

The "Continue with Google / GitHub" buttons only work for providers you switch on here.

## 4. Tell Supabase where the site lives

Open **Authentication, URL Configuration**:

- **Site URL**: `https://manojchandrak.github.io/chess-analyzer/`
- **Redirect URLs**: add `https://manojchandrak.github.io/chess-analyzer/**` and, for local work,
  `http://localhost:5174/chess-analyzer/**`

Confirmation emails, password-reset emails and Google/GitHub sign-in send people back to these addresses.

## 5. Give the site the project's address

Open **Project Settings, API** and copy two values:

- **Project URL** (like `https://abcdefgh.supabase.co`)
- **anon public** key

These two are meant to be public: the database rules, not the key, protect the data. **Never** use the `service_role`
key anywhere in this project.

**For local work**, create `.env.local` in the project folder (it is git-ignored):

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

then run `npm run dev`.

**For the live site**, in the GitHub repository open Settings, Secrets and variables, Actions, **Variables** tab, and add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values. The workflows pass them to the build. Merge to
`main` (or re-run the deploy) and the Community tab and Log in button appear.

## 6. Make yourself a moderator

Moderators can delete any post and pin or lock threads. Sign up on the site first, then in the SQL Editor run:

```sql
update public.profiles set is_admin = true where username = 'YourUsername';
```

There is deliberately no way to do this from the web page.

## Before you go public

- **Email sending.** Supabase's built-in email service is limited to a few messages an hour, enough for testing but not
  for real sign-ups. Under **Authentication, SMTP Settings** connect a mail provider (Resend, Postmark, SendGrid...).
- **Bots.** Under **Authentication, Attack Protection** you can switch on CAPTCHA (hCaptcha or Cloudflare Turnstile).
- **Privacy.** The site stores each person's email address and username, and posts are public. Add a short privacy
  note to the site, and answer deletion requests by deleting the person in **Authentication, Users** (their profile,
  threads and replies are removed with them).
- **Backups and limits.** The free plan pauses a project after a week of no use and has no automatic backups; upgrade
  if the forum matters.

## Trying the screens without a project

```
VITE_FORUM_MOCK=1 npm run dev
```

runs the forum against an in-memory fake that has the same rules (including the rate limits) and a few sample threads.
Nothing is saved, and Google/GitHub sign-in is not available. Log in with `player@example.com` or `mod@example.com`
(moderator), password `password123`.

## How it is tested

`npm test` runs the real `supabase/schema.sql` against an in-process Postgres (PGlite) with stand-ins for Supabase's
login tables, and checks the rules directly: the profile created at sign-up, who can read, post, edit and delete, the
rate limits, locked threads, moderator-only actions, and the columns nobody can change from the page.
