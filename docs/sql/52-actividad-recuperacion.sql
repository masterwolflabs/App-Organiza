-- Migration 52 (2026-11-18): 🔋 Workout Pro · Actividad y recuperación (Daily workout-pro-recuperacion). Idempotente; solo agrega.
--   organiza_activities  actividad fuera del entreno (bici, caminata, correr…) y pasos del día. source = manual | apple_health.
--                        external_id (de Apple Salud) evita duplicados al sincronizar de nuevo.
--   organiza_readiness   «¿cómo llegas?» antes de entrenar: energía, agujetas, dolor, señales de alerta y lo que decidiste.
--   El SUEÑO no se duplica: se lee de organiza_checks (tarea «Dormir», SleepLog).
create table if not exists public.organiza_activities (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day          date not null default current_date,
  kind         text not null default 'otro',
  minutes      int,
  intensity    int,
  distance_km  numeric,
  steps        int,
  notes        text not null default '',
  source       text not null default 'manual',
  external_id  text,
  created_at   timestamptz not null default now()
);
alter table public.organiza_activities enable row level security;
drop policy if exists organiza_activities_owner on public.organiza_activities;
create policy organiza_activities_owner on public.organiza_activities for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_activities to authenticated;
create index if not exists organiza_activities_owner_day on public.organiza_activities (owner_id, day desc);
-- Única completa (los NULL de lo manual no chocan entre sí) para poder hacer upsert onConflict 'owner_id,external_id'.
drop index if exists public.organiza_activities_external;
create unique index if not exists organiza_activities_owner_external on public.organiza_activities (owner_id, external_id);

create table if not exists public.organiza_readiness (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null default current_date,
  energy      int,
  soreness    int,
  pain        text not null default 'no',
  pain_zone   text not null default '',
  flags       jsonb not null default '[]'::jsonb,
  level       text not null default 'normal',
  decision    text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.organiza_readiness enable row level security;
drop policy if exists organiza_readiness_owner on public.organiza_readiness;
create policy organiza_readiness_owner on public.organiza_readiness for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_readiness to authenticated;
create index if not exists organiza_readiness_owner_day on public.organiza_readiness (owner_id, day desc);
