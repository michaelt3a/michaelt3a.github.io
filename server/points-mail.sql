-- Rewards Shop email list. Run this once in the Supabase SQL editor.
--
-- The browser upserts rows here (email, name, balance, last earn time) via
-- the anon key. The points-mail function reads it with the service role key
-- and sends the actual email.

create table if not exists points_mail (
  id bigint generated always as identity primary key,
  email text not null unique,
  name text,
  balance integer not null default 0,
  subscribed boolean not null default true,
  unsub_token uuid not null default gen_random_uuid(),
  last_earned_at timestamptz,
  last_earn_mail_at timestamptz,   -- when we last sent the "you earned points" note
  last_reminder_at timestamptz,    -- when we last sent the "points waiting" nudge
  created_at timestamptz not null default now()
);

alter table points_mail enable row level security;

-- The anon key can write but NEVER read: no select policy means the email
-- list can't be pulled out through the browser key.
create policy "anon signup" on points_mail
  for insert to anon with check (true);
create policy "anon update own row" on points_mail
  for update to anon using (true) with check (true);
