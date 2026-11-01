-- =====================================================================
-- App Organiza · Áreas de vida y metas variables
-- Se puede ejecutar varias veces.
--
--   organiza_areas   las áreas de cada persona (Mi relación, Dios, Familia…).
--   organiza_goals   metas sin fecha ("una vez al mes, un día con mi novia").
--   calendar_events  gana area_id y goal_id: cada evento dice a qué área
--                    pertenece y, si nació de una meta, de cuál. El avance de
--                    una meta se cuenta con esos eventos.
-- Todo es privado: cada persona ve y edita solo lo suyo.
-- =====================================================================

create table if not exists public.organiza_areas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  emoji      text not null default '',
  color      text not null default '#94a3b8',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.organiza_goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id     uuid references public.organiza_areas(id) on delete set null,
  title       text not null default '',
  times       int  not null default 1 check (times between 1 and 31),
  period      text not null default 'mes' check (period in ('semana', 'mes')),
  all_day     boolean not null default false,
  minutes     int  not null default 60 check (minutes > 0),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists organiza_goals_owner_idx on public.organiza_goals (owner_id);

alter table public.calendar_events
  add column if not exists area_id uuid references public.organiza_areas(id) on delete set null,
  add column if not exists goal_id uuid references public.organiza_goals(id) on delete set null;
create index if not exists calendar_events_goal_idx on public.calendar_events (goal_id);

alter table public.organiza_areas enable row level security;
alter table public.organiza_goals enable row level security;

drop policy if exists organiza_areas_owner on public.organiza_areas;
create policy organiza_areas_owner on public.organiza_areas for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists organiza_goals_owner on public.organiza_goals;
create policy organiza_goals_owner on public.organiza_goals for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.organiza_areas to authenticated;
grant select, insert, update, delete on public.organiza_goals to authenticated;
