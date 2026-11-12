-- Migration: sonidos del equipo (Daily organiza-sonidos-epidemic-subir, 12 nov 2026). Idempotente.
-- Sonidos con licencia (Epidemic Sound) que eligió Emanuel: NO van al repo (es público). Viven en el bucket
-- privado organiza-sounds, carpeta equipo/, y solo los leen los miembros de Master Wolf (is_mw_member()).
-- Se cargan desde SQL / script (no hay escritura desde la app).
create table if not exists public.organiza_team_sounds (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('alarma', 'notificacion')),
  name       text not null,
  path       text not null unique,
  source     text not null default 'epidemic',
  bytes      int not null default 0,
  seconds    real not null default 0,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.organiza_team_sounds enable row level security;
drop policy if exists organiza_team_sounds_read on public.organiza_team_sounds;
create policy organiza_team_sounds_read on public.organiza_team_sounds for select to authenticated
  using (public.is_mw_member());

drop policy if exists organiza_sounds_team_read on storage.objects;
create policy organiza_sounds_team_read on storage.objects for select to authenticated
  using (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = 'equipo' and public.is_mw_member());
