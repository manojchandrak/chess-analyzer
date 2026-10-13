-- Chess Analyzer forum: accounts, profiles, threads and replies, with the access rules in the database.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; it replaces functions and policies but never drops your data.
--
-- Who can do what (enforced here with row-level security, not in the web page):
--   * anyone, signed in or not, can read profiles (usernames only), threads and replies
--   * a signed-in person can post threads and replies as themselves, and edit or delete their own
--   * a moderator (profiles.is_admin = true) can also delete, pin and lock anything
--   * nobody can post as someone else, change who wrote a post, or make themselves a moderator

-- ---------------------------------------------------------------------------
-- Profiles: one per account, holds the public username
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_-]{3,24}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);

drop policy if exists "People can rename themselves" on public.profiles;
create policy "People can rename themselves" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Only the username can be changed from the web page; is_admin is set by hand in the dashboard.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username) on public.profiles to authenticated;

-- Create the profile automatically when someone signs up (email, Google or GitHub).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text;
  base text;
  candidate text;
begin
  raw := coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1),
    'player'
  );
  base := left(regexp_replace(raw, '[^A-Za-z0-9_-]', '', 'g'), 20);
  if char_length(base) < 3 then
    base := 'player';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    candidate := base || (1000 + floor(random() * 9000))::int::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Is the signed-in person a moderator? (security definer so the policies below can ask without recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('feedback', 'feature', 'bug', 'discussion', 'help')),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  locked boolean not null default false,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index if not exists forum_threads_activity on public.forum_threads (pinned desc, last_activity_at desc);
create index if not exists forum_threads_category on public.forum_threads (category, pinned desc, last_activity_at desc);

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forum_replies_thread on public.forum_replies (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers: keep counts and timestamps right, and slow spammers down
-- ---------------------------------------------------------------------------
create or replace function public.forum_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forum_threads_touch on public.forum_threads;
create trigger forum_threads_touch before update of title, body on public.forum_threads for each row execute function public.forum_touch_updated_at();

drop trigger if exists forum_replies_touch on public.forum_replies;
create trigger forum_replies_touch before update of body on public.forum_replies for each row execute function public.forum_touch_updated_at();

-- Only moderators may pin or lock a thread.
create or replace function public.forum_protect_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.pinned is distinct from old.pinned or new.locked is distinct from old.locked) and not public.is_admin() then
    raise exception 'Only moderators can do that.';
  end if;
  return new;
end;
$$;

drop trigger if exists forum_threads_flags on public.forum_threads;
create trigger forum_threads_flags before update on public.forum_threads for each row execute function public.forum_protect_flags();

-- A person can start one thread every 30 seconds and post one reply every 10 seconds.
create or replace function public.forum_thread_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.forum_threads where author_id = new.author_id and created_at > now() - interval '30 seconds') then
    raise exception 'You are posting too quickly. Please wait a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists forum_threads_rate on public.forum_threads;
create trigger forum_threads_rate before insert on public.forum_threads for each row execute function public.forum_thread_rate_limit();

-- Replies: rate limit, and no replies to a locked thread (except from moderators).
create or replace function public.forum_reply_checks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.forum_threads where id = new.thread_id and locked) and not public.is_admin() then
    raise exception 'This thread is locked.';
  end if;
  if exists (select 1 from public.forum_replies where author_id = new.author_id and created_at > now() - interval '10 seconds') then
    raise exception 'You are posting too quickly. Please wait a moment.';
  end if;
  return new;
end;
$$;

drop trigger if exists forum_replies_checks on public.forum_replies;
create trigger forum_replies_checks before insert on public.forum_replies for each row execute function public.forum_reply_checks();

-- Keep reply_count and last_activity_at on the thread up to date.
create or replace function public.forum_reply_inserted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.forum_threads set reply_count = reply_count + 1, last_activity_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

create or replace function public.forum_reply_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.forum_threads set reply_count = greatest(0, reply_count - 1) where id = old.thread_id;
  return old;
end;
$$;

drop trigger if exists forum_replies_after_insert on public.forum_replies;
create trigger forum_replies_after_insert after insert on public.forum_replies for each row execute function public.forum_reply_inserted();

drop trigger if exists forum_replies_after_delete on public.forum_replies;
create trigger forum_replies_after_delete after delete on public.forum_replies for each row execute function public.forum_reply_deleted();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.forum_threads enable row level security;
alter table public.forum_replies enable row level security;

drop policy if exists "Threads are public" on public.forum_threads;
create policy "Threads are public" on public.forum_threads for select using (true);

drop policy if exists "Members start threads as themselves" on public.forum_threads;
create policy "Members start threads as themselves" on public.forum_threads for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "Authors and moderators edit threads" on public.forum_threads;
create policy "Authors and moderators edit threads" on public.forum_threads for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "Authors and moderators delete threads" on public.forum_threads;
create policy "Authors and moderators delete threads" on public.forum_threads for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists "Replies are public" on public.forum_replies;
create policy "Replies are public" on public.forum_replies for select using (true);

drop policy if exists "Members reply as themselves" on public.forum_replies;
create policy "Members reply as themselves" on public.forum_replies for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "Authors and moderators edit replies" on public.forum_replies;
create policy "Authors and moderators edit replies" on public.forum_replies for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "Authors and moderators delete replies" on public.forum_replies;
create policy "Authors and moderators delete replies" on public.forum_replies for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- Column-level permissions: counts and timestamps are maintained by the triggers above, never by the page.
revoke all on public.forum_threads, public.forum_replies from anon, authenticated;
grant select on public.forum_threads, public.forum_replies to anon, authenticated;
grant insert (author_id, category, title, body) on public.forum_threads to authenticated;
grant update (title, body, pinned, locked) on public.forum_threads to authenticated;
grant delete on public.forum_threads to authenticated;
grant insert (thread_id, author_id, body) on public.forum_replies to authenticated;
grant update (body) on public.forum_replies to authenticated;
grant delete on public.forum_replies to authenticated;

-- ---------------------------------------------------------------------------
-- Saved data: each signed-in person's usernames, settings, drill progress, puzzle progress and game ratings,
-- so they follow the account from device to device. One row per person per kind of data.
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_data_key_allowed check (key in ('usernames', 'options', 'board', 'drills', 'stats', 'puzzles', 'history', 'mistakes')),
  constraint user_data_value_size check (octet_length(value::text) <= 2000000)
);

-- Tables made by an earlier version of this file know fewer kinds of data; widen the list (safe to repeat).
alter table public.user_data drop constraint if exists user_data_key_allowed;
alter table public.user_data add constraint user_data_key_allowed check (key in ('usernames', 'options', 'board', 'drills', 'stats', 'puzzles', 'history', 'mistakes'));

create or replace function public.user_data_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data for each row execute function public.user_data_touch();

alter table public.user_data enable row level security;

drop policy if exists "People read their own saved data" on public.user_data;
create policy "People read their own saved data" on public.user_data for select to authenticated using (user_id = auth.uid());

drop policy if exists "People save their own data" on public.user_data;
create policy "People save their own data" on public.user_data for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "People update their own saved data" on public.user_data;
create policy "People update their own saved data" on public.user_data for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "People delete their own saved data" on public.user_data;
create policy "People delete their own saved data" on public.user_data for delete to authenticated using (user_id = auth.uid());

-- Nobody who is signed out can touch it. Signed-in people can write the three columns an upsert names; the timestamp is
-- set by the trigger, and the policies above stop anyone from reading or changing another person's row.
revoke all on public.user_data from anon, authenticated;
grant select on public.user_data to authenticated;
grant insert (user_id, key, value) on public.user_data to authenticated;
grant update (user_id, key, value) on public.user_data to authenticated;
grant delete on public.user_data to authenticated;

-- ---------------------------------------------------------------------------
-- Making someone a moderator (run by hand, as the project owner):
--   update public.profiles set is_admin = true where username = 'YourUsername';
-- ---------------------------------------------------------------------------
