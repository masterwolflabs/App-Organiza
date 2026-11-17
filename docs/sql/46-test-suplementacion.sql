-- Migration 46 (2026-11-17): 💊 Test de suplementación (Daily nutrition-test-suplementacion). Idempotente; solo agrega.
--   organiza_supplement_tests  cada test: respuestas, tu propuesta y el análisis (para volver a verlo)
--   organiza_supplements.until  fecha de término (reevaluar) · .reason por qué lo tomas · .buy para la lista de compras
create table if not exists public.organiza_supplement_tests (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space      text not null default 'persona',
  answers    jsonb not null default '[]'::jsonb,
  proposal   text not null default '',
  analysis   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.organiza_supplement_tests enable row level security;
drop policy if exists organiza_supplement_tests_owner on public.organiza_supplement_tests;
create policy organiza_supplement_tests_owner on public.organiza_supplement_tests for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_supplement_tests to authenticated;

alter table public.organiza_supplements add column if not exists until date;
alter table public.organiza_supplements add column if not exists reason text not null default '';
alter table public.organiza_supplements add column if not exists buy boolean not null default false;
