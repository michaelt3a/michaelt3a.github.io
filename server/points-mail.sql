-- Rewards Shop email list. This is already applied to the live project
-- (Aug 2026); kept here as the reference copy.
--
-- The browser calls the points_mail_upsert RPC via the anon key; the table
-- itself is closed to anon in both directions (no policies), so the email
-- list can't be read or written directly with the public key. The
-- points-mail function reads it with the service role key and sends mail.

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
-- Deliberately NO policies: all anon access goes through the RPC below.

-- The one write path for the browser. SECURITY DEFINER so it can touch the
-- table the anon role can't; validates the email shape server-side.
create or replace function public.points_mail_upsert(
  p_email text,
  p_name text default null,
  p_balance integer default null,
  p_subscribed boolean default true,
  p_earned boolean default false
) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    return;
  end if;
  insert into points_mail (email, name, balance, subscribed, last_earned_at)
  values (lower(trim(p_email)), nullif(trim(coalesce(p_name, '')), ''), coalesce(p_balance, 0), p_subscribed,
          case when p_earned then now() else null end)
  on conflict (email) do update set
    name = coalesce(nullif(trim(coalesce(excluded.name, '')), ''), points_mail.name),
    balance = coalesce(p_balance, points_mail.balance),
    subscribed = excluded.subscribed,
    last_earned_at = case when p_earned then now() else points_mail.last_earned_at end;
end
$fn$;

revoke all on function public.points_mail_upsert(text, text, integer, boolean, boolean) from public;
grant execute on function public.points_mail_upsert(text, text, integer, boolean, boolean) to anon;
