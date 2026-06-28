create table if not exists public.league_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.league_state enable row level security;

drop policy if exists "league_state public read" on public.league_state;
create policy "league_state public read"
  on public.league_state
  for select
  to anon
  using (true);

drop policy if exists "league_state public write" on public.league_state;
create policy "league_state public write"
  on public.league_state
  for insert
  to anon
  with check (true);

drop policy if exists "league_state public update" on public.league_state;
create policy "league_state public update"
  on public.league_state
  for update
  to anon
  using (true)
  with check (true);
