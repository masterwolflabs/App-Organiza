-- Migration 53 (2026-11-18): 🧪 Workout Pro · Entrenamientos experimentales (Daily workout-pro-experimentos). Idempotente; solo agrega.
--   organiza_experiments  un plan experimental APARTE (nunca reemplaza tu planner). status: borrador | en_prueba | terminado | incorporado | descartado.
--     chat = la conversación con la IA · analysis = { summary, compatibility[], adaptations[], claims[{text, kind, source}] }
--     routine = { title, notes, exercises[] } · checkins = sensaciones por sesión [{ day, log_id, enjoyment, effort, pain, notes, soreness_next }]
--     verdict = { decision, why, changes[], at } · weeks / started_at / ends_at = el período de prueba.
--   organiza_workout_logs.experiment_id  los entrenos del experimento (para compararlos con lo habitual).
create table if not exists public.organiza_experiments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  origin      text not null default '',
  goal        text not null default '',
  status      text not null default 'borrador',
  weeks       int,
  started_at  date,
  ends_at     date,
  chat        jsonb not null default '[]'::jsonb,
  analysis    jsonb not null default '{}'::jsonb,
  routine     jsonb not null default '{}'::jsonb,
  checkins    jsonb not null default '[]'::jsonb,
  verdict     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.organiza_experiments enable row level security;
drop policy if exists organiza_experiments_owner on public.organiza_experiments;
create policy organiza_experiments_owner on public.organiza_experiments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_experiments to authenticated;
create index if not exists organiza_experiments_owner_status on public.organiza_experiments (owner_id, status);

alter table public.organiza_workout_logs add column if not exists experiment_id uuid references public.organiza_experiments(id) on delete set null;
