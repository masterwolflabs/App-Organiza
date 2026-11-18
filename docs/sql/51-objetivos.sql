-- Migration 51 (2026-11-18): 🎯 Workout Pro · Objetivos inteligentes (Daily workout-pro-objetivos). Idempotente; solo agrega.
-- OJO: «organiza_goals» ya existe y es otra cosa (metas del Horario, SQL 24). Esta tabla es solo de Workout Pro.
--   organiza_workout_goals  un objetivo por fila. status: propuesto | activo | pausado | completado | rechazado.
--   metric = { kind: exercise_weight | weekly_frequency | weekly_minutes | muscle_sets | body, exercise?, muscle?, body?, direction: up|down|keep }
--   baseline/target en la unidad del indicador; el progreso NO se guarda: se calcula con los entrenos y el perfil físico.
--   source = ia | usuario · why/how = por qué y cómo se evalúa · events = historial (aceptado, pausado, modificado…).
create table if not exists public.organiza_workout_goals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type          text not null default 'fuerza',
  title         text not null default '',
  outcome       text not null default '',
  metric        jsonb not null default '{}'::jsonb,
  unit          text not null default '',
  baseline      numeric,
  target        numeric,
  period_weeks  int,
  started_at    date,
  review_at     date,
  status        text not null default 'propuesto',
  why           text not null default '',
  how           text not null default '',
  next_action   text not null default '',
  source        text not null default 'usuario',
  events        jsonb not null default '[]'::jsonb,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.organiza_workout_goals enable row level security;
drop policy if exists organiza_workout_goals_owner on public.organiza_workout_goals;
create policy organiza_workout_goals_owner on public.organiza_workout_goals for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_workout_goals to authenticated;
create index if not exists organiza_workout_goals_owner_status on public.organiza_workout_goals (owner_id, status);
