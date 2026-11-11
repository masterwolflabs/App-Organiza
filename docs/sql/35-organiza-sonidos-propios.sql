-- Migration: sonidos propios de notificación y alarma (Daily sonidos-subir-propios, 11 nov 2026).
-- Idempotente, solo agrega. Cada persona sube sus sonidos a un bucket PRIVADO: solo ve los suyos.
--   organiza_custom_sounds   la lista (nombre, tipo, ruta en el bucket)
--   storage «organiza-sounds» archivos en <uid>/<id>.<ext>, máx. 5 MB, solo audio
create table if not exists public.organiza_custom_sounds (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('alarma', 'notificacion')),
  name       text not null,
  path       text not null,
  bytes      int not null default 0,
  seconds    real not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists organiza_custom_sounds_owner_idx on public.organiza_custom_sounds (owner_id, kind);
alter table public.organiza_custom_sounds enable row level security;
drop policy if exists organiza_custom_sounds_owner on public.organiza_custom_sounds;
create policy organiza_custom_sounds_owner on public.organiza_custom_sounds for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organiza-sounds', 'organiza-sounds', false, 5242880,
        array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm'])
on conflict (id) do nothing;

drop policy if exists organiza_sounds_read on storage.objects;
create policy organiza_sounds_read on storage.objects for select to authenticated
  using (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_sounds_insert on storage.objects;
create policy organiza_sounds_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_sounds_update on storage.objects;
create policy organiza_sounds_update on storage.objects for update to authenticated
  using (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists organiza_sounds_delete on storage.objects;
create policy organiza_sounds_delete on storage.objects for delete to authenticated
  using (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = auth.uid()::text);
