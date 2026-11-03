-- Migration: Alimentación y Entrenamiento (3 nov 2026). Idempotente, solo agrega tablas nuevas.
-- Cada fila es un plato o una sesión en un día de la semana (0 = lunes) y un momento (desayuno, sesión 1…).
create table if not exists public.organiza_meals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  weekday     int  not null,
  slot        text not null,
  sort        int  not null default 0,
  title       text not null default '',
  cover_url   text,
  kcal        numeric,
  protein     numeric,
  carbs       numeric,
  fat         numeric,
  ingredients jsonb not null default '[]'::jsonb,
  steps       text not null default '',
  fast_hours  numeric,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create table if not exists public.organiza_workouts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  weekday     int  not null,
  slot        text not null,
  sort        int  not null default 0,
  title       text not null default '',
  cover_url   text,
  muscles     text[] not null default '{}',
  exercises   jsonb not null default '[]'::jsonb,
  minutes     int,
  kcal        numeric,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
-- Metas diarias de comida (kcal, proteína…) por persona y base.
create table if not exists public.organiza_nutrition (
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  goals       jsonb not null default '{}'::jsonb,
  slots       jsonb not null default '[]'::jsonb,
  primary key (owner_id, space)
);
do $$
declare t text;
begin
  foreach t in array array['organiza_meals', 'organiza_workouts', 'organiza_nutrition'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_owner') then
      execute format('create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_owner', t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
