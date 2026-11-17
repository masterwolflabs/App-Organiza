-- Migration 47 (2026-11-17): 🛒 Master Compras, fase 1 (Daily idea-app-compras). Idempotente; solo agrega.
--   organiza_pantry  la bodega de la casa y lo recurrente: cuánto hay (stock + unidad), desde cuánto reponer
--                    (min), cada cuántos días se acaba (lasts_days), última compra, prioridad y si va a la lista.
create table if not exists public.organiza_pantry (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  name        text not null default '',
  category    text not null default 'comida',
  stock       numeric not null default 0,
  unit        text not null default 'unidad',
  min         numeric not null default 0,
  buy_qty     numeric,
  lasts_days  int,
  last_bought date,
  priority    text not null default 'importante',
  on_list     boolean not null default false,
  note        text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.organiza_pantry enable row level security;
drop policy if exists organiza_pantry_owner on public.organiza_pantry;
create policy organiza_pantry_owner on public.organiza_pantry for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_pantry to authenticated;
create index if not exists organiza_pantry_owner_space on public.organiza_pantry (owner_id, space);
