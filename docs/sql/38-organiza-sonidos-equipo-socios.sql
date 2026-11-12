-- Migration: los sonidos del equipo también para las cuentas personales de los socios (Emanuel, 12 nov 2026).
-- Acceso SOLO a los sonidos (no los hace miembros de Master Wolf). Idempotente.
create table if not exists public.organiza_team_sound_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note    text not null default ''
);
alter table public.organiza_team_sound_access enable row level security;  -- sin políticas: solo SQL

create or replace function public.can_team_sounds() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_mw_member() or exists (select 1 from public.organiza_team_sound_access where user_id = auth.uid())
$$;

insert into public.organiza_team_sound_access (user_id, note) values
  ('3ddda4d2-22da-451d-845f-e0a848ef1275', 'Emanuel Miranda (personal)'),
  ('72ca1470-0b16-421d-b575-fc56cba9fe2d', 'Moisés Montano (personal)'),
  ('2f491894-e09b-4367-a30d-ad7de46aeab7', 'Alfonso García (personal)')
on conflict (user_id) do nothing;

drop policy if exists organiza_team_sounds_read on public.organiza_team_sounds;
create policy organiza_team_sounds_read on public.organiza_team_sounds for select to authenticated
  using (public.can_team_sounds());

drop policy if exists organiza_sounds_team_read on storage.objects;
create policy organiza_sounds_team_read on storage.objects for select to authenticated
  using (bucket_id = 'organiza-sounds' and (storage.foldername(name))[1] = 'equipo' and public.can_team_sounds());
