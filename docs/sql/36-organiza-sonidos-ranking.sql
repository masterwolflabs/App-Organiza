-- Migration: cada persona arma su lista de sonidos (Daily sonidos-elegir-ranking, 11 nov 2026).
-- Idempotente, solo agrega. Una fila por persona:
--   hidden  ids de los sonidos que eliminó de SU lista (se pueden restaurar; no toca la de los demás)
--   uses    {"<id>": veces que lo eligió o sonó} → la lista sale ordenada por más usados
create table if not exists public.organiza_sound_library (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hidden     text[] not null default '{}',
  uses       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.organiza_sound_library enable row level security;
drop policy if exists organiza_sound_library_owner on public.organiza_sound_library;
create policy organiza_sound_library_owner on public.organiza_sound_library for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
