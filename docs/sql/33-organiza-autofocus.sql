-- Migration: el modo focus de una acción se abre solo a su hora (3 nov 2026). Idempotente, solo agrega.
alter table public.organiza_items add column if not exists auto_focus boolean not null default false;
