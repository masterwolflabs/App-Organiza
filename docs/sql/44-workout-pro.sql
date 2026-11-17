-- Migration 44 (2026-11-17): 🏋️ Workout Pro (Daily workout-pro). Idempotente; solo agrega.
--   organiza_routines      las rutinas (galería): ejercicios [{id, name, muscles[], key, sets, reps, rest, weight, video}]
--   organiza_workout_logs  cada entreno terminado: series hechas (peso, reps), calidad (clave hechos / clave totales), cómo te fue
--   organiza_prefs.body     la figura del perfil: 'hombre' | 'mujer' | null (no decir)
--   organiza_prefs.training la semana: { mode, week: { "0": { routine, version } … } }
create table if not exists public.organiza_routines (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space         text not null default 'persona',
  code          text not null default '',
  title         text not null default '',
  emoji         text not null default '🏋️',
  cover_url     text,
  kind          text not null default 'fuerza',
  core          boolean not null default false,
  exercises     jsonb not null default '[]'::jsonb,
  full_minutes  int,
  short_minutes int,
  notes         text not null default '',
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.organiza_routines enable row level security;
drop policy if exists organiza_routines_owner on public.organiza_routines;
create policy organiza_routines_owner on public.organiza_routines for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_routines to authenticated;
create index if not exists organiza_routines_owner_space on public.organiza_routines (owner_id, space);

create table if not exists public.organiza_workout_logs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space         text not null default 'persona',
  routine_id    uuid references public.organiza_routines(id) on delete set null,
  day           date not null default current_date,
  title         text not null default '',
  core          boolean not null default false,
  version       text not null default 'completa',
  exercises     jsonb not null default '[]'::jsonb,
  quality_done  int not null default 0,
  quality_total int not null default 0,
  minutes       int,
  feel          text,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.organiza_workout_logs enable row level security;
drop policy if exists organiza_workout_logs_owner on public.organiza_workout_logs;
create policy organiza_workout_logs_owner on public.organiza_workout_logs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_workout_logs to authenticated;
create index if not exists organiza_workout_logs_owner_day on public.organiza_workout_logs (owner_id, space, day);

alter table public.organiza_prefs add column if not exists body text;
alter table public.organiza_prefs add column if not exists training jsonb not null default '{}'::jsonb;
