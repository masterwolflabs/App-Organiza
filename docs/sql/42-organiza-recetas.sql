-- Migration 42 (2026-11-16): Nutrition Pro — recetario. Idempotente; solo agrega.
-- Una receta: categoría (desayuno · almuerzo · cena · merienda), portada, requisitos (cocción, cafetera…),
-- ingredientes [{name, qty, unit}] y pasos en línea de tiempo [{id, text, at (min desde el inicio),
-- minutes (timer, null = sin timer), track (carril: 0, 1, 2 = cosas en paralelo)}].
create table if not exists public.organiza_recipes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  category    text not null default 'desayuno',
  title       text not null default '',
  cover_url   text,
  needs       text[] not null default '{}',
  ingredients jsonb not null default '[]'::jsonb,
  steps       jsonb not null default '[]'::jsonb,
  servings    int,
  kcal        numeric,
  protein     numeric,
  notes       text not null default '',
  made        int not null default 0,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.organiza_recipes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'organiza_recipes' and policyname = 'organiza_recipes_owner') then
    create policy organiza_recipes_owner on public.organiza_recipes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $$;
grant select, insert, update, delete on public.organiza_recipes to authenticated;
create index if not exists organiza_recipes_owner_space on public.organiza_recipes (owner_id, space);
-- Un plato de la semana puede ser una receta del recetario.
alter table public.organiza_meals add column if not exists recipe_id uuid references public.organiza_recipes(id) on delete set null;
