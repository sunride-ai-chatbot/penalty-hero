-- "מלך הפנדלים": the global table of the knockout cups. Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Every player files one row per cup he played (the champion's row has champion = true). The game only ever inserts and reads.
-- Nobody can change or delete a row with the publishable key. There is no referee, so the table is as honest as the players:
-- the checks below keep the numbers possible, and cups of fewer than four players do not count.

create table if not exists public.king_cups (
  id          bigint generated always as identity primary key,
  cup_id      text        not null check (char_length(cup_id) between 3 and 40),
  player_id   text        not null check (char_length(player_id) between 6 and 40),
  name        text        not null check (char_length(name) between 1 and 24),
  team        text        not null default '' check (char_length(team) <= 60),
  champion    boolean     not null default false,
  matches_won smallint    not null check (matches_won between 0 and 3),
  goals       smallint    not null check (goals between 0 and 80),
  kicks       smallint    not null check (kicks between 0 and 100),
  players     smallint    not null check (players between 4 and 8),
  created_at  timestamptz not null default now(),
  constraint king_cups_goals_le_kicks check (goals <= kicks),
  constraint king_cups_one_row_per_cup unique (cup_id, player_id)
);

alter table public.king_cups enable row level security;
drop policy if exists "king read"   on public.king_cups;
drop policy if exists "king insert" on public.king_cups;
create policy "king read"   on public.king_cups for select to anon, authenticated using (true);
create policy "king insert" on public.king_cups for insert to anon, authenticated with check (true);
grant select, insert on public.king_cups to anon, authenticated;

create or replace view public.king_board with (security_invoker = true) as
select player_id,
       (array_agg(name order by created_at desc))[1]            as name,
       count(*)::int                                           as cups,
       (count(*) filter (where champion))::int                 as titles,
       sum(matches_won)::int                                   as wins,
       sum(goals)::int                                         as goals,
       sum(kicks)::int                                         as kicks,
       round(100.0 * sum(goals) / nullif(sum(kicks), 0))::int  as pct,
       max(created_at)                                         as last_at
from public.king_cups
group by player_id;
grant select on public.king_board to anon, authenticated;
