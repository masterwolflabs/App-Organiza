-- Migration 50 (2026-11-18): 📏 Workout Pro · Perfil físico (Daily workout-pro-perfil-fisico). Idempotente; solo agrega.
--   organiza_body_logs        cada medición es una fila nueva (historial: nunca se sobrescribe al registrar).
--                             Medidas en kg / cm / %; todas opcionales (nada se estima). photos = { frontal, lateral, posterior } → ruta en el bucket.
--   organiza_prefs.body_check { every: 15 | 30, remind: true|false }  frecuencia y recordatorio.
--   bucket organiza-body      PRIVADO: cada uno ve solo su carpeta <uid>/. Solo imágenes, máx. 10 MB.
create table if not exists public.organiza_body_logs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day          date not null default current_date,
  weight       numeric,
  height       numeric,
  age          int,
  waist        numeric,
  chest        numeric,
  arm          numeric,
  leg          numeric,
  hip          numeric,
  body_fat     numeric,
  muscle_mass  numeric,
  notes        text not null default '',
  photos       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.organiza_body_logs enable row level security;
drop policy if exists organiza_body_logs_owner on public.organiza_body_logs;
create policy organiza_body_logs_owner on public.organiza_body_logs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_body_logs to authenticated;
create index if not exists organiza_body_logs_owner_day on public.organiza_body_logs (owner_id, day desc);

alter table public.organiza_prefs add column if not exists body_check jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organiza-body', 'organiza-body', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
drop policy if exists organiza_body_read on storage.objects;
create policy organiza_body_read on storage.objects for select to authenticated
  using (bucket_id = 'organiza-body' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_body_insert on storage.objects;
create policy organiza_body_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'organiza-body' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_body_update on storage.objects;
create policy organiza_body_update on storage.objects for update to authenticated
  using (bucket_id = 'organiza-body' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_body_delete on storage.objects;
create policy organiza_body_delete on storage.objects for delete to authenticated
  using (bucket_id = 'organiza-body' and (storage.foldername(name))[1] = auth.uid()::text);
