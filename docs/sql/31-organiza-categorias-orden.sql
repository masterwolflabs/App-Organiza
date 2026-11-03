-- Migration: orden de las categorías del Horario (3 nov 2026). Idempotente, solo agrega.
alter table public.organiza_labels add column if not exists sort int not null default 0;
