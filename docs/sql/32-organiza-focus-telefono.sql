-- Migration: el recordatorio «configura Concentración en tu teléfono» se marca hecho por acción (3 nov 2026). Idempotente.
alter table public.organiza_items add column if not exists phone_focus boolean not null default false;
