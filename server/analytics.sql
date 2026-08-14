-- Arcade analytics + config. Paste this whole file into the Supabase SQL
-- editor and run it once. (Not yet applied as of Aug 2026 unless someone ran
-- it; the site degrades gracefully until then.)
--
-- event_counts: one row per (day, kind, game) with a counter. No PII, no
-- per-player rows, just tallies. The browser bumps it through the RPC; the
-- stats page reads it back. Anyone technically CAN read the counts with the
-- anon key, which is fine: they're aggregate numbers.
--
-- arcade_config: tiny key/value store the site reads on load. Currently just
-- the 'boost' row for double-points windows.

create table if not exists event_counts (
  day date not null,
  kind text not null,
  game text not null default '',
  n integer not null default 0,
  primary key (day, kind, game)
);
alter table event_counts enable row level security;
drop policy if exists "read counts" on event_counts;
create policy "read counts" on event_counts for select to anon using (true);
-- No insert/update policies: writes only through the RPC below.

create or replace function public.bump_event(p_kind text, p_game text default '')
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_kind is null or length(p_kind) > 24 or length(coalesce(p_game, '')) > 24 then
    return;
  end if;
  insert into event_counts (day, kind, game, n)
  values ((now() at time zone 'utc')::date, p_kind, coalesce(p_game, ''), 1)
  on conflict (day, kind, game) do update set n = event_counts.n + 1;
end
$fn$;
revoke all on function public.bump_event(text, text) from public;
grant execute on function public.bump_event(text, text) to anon;

-- Config the site reads on load.
create table if not exists arcade_config (
  key text primary key,
  value jsonb not null
);
alter table arcade_config enable row level security;
drop policy if exists "read config" on arcade_config;
create policy "read config" on arcade_config for select to anon using (true);

-- The double-points switch. To run a boost weekend, update this row (Table
-- Editor -> arcade_config) with the dates you want; the site notices within
-- half an hour. Dates are inclusive, in the player's local time.
insert into arcade_config (key, value)
values ('boost', '{"from": "2000-01-01", "to": "2000-01-01", "mult": 2, "label": "Double points weekend!"}')
on conflict (key) do nothing;
