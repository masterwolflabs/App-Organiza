-- =====================================================================
-- App Organiza · Calendario compartido (Daily, 2026-11-02). Se puede ejecutar
-- varias veces. Solo agrega.
--
--   calendar_events.reminders  minutos antes de cada aviso: 7200 = 5 días
--   organiza_invites           cada invitado con cuenta: pendiente, aceptada o rechazada.
--                              Nacen solas de attendee_users.
--   organiza_notifications     centro de notificaciones de cada persona
--   organiza_prefs             qué avisos y qué sonido quiere cada persona
--   organiza_availability      quién puede ver cuándo estoy ocupado. Nunca ve títulos:
--                              solo se lee con organiza_busy().
-- =====================================================================
alter table public.calendar_events add column if not exists reminders int[] not null default '{}';

create table if not exists public.organiza_invites (
  event_id     uuid not null references public.calendar_events(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  invited_by   uuid references auth.users(id) on delete set null,
  status       text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (event_id, user_id)
);
create index if not exists organiza_invites_user_idx on public.organiza_invites (user_id, status);
alter table public.organiza_invites enable row level security;
drop policy if exists organiza_invites_read on public.organiza_invites;
create policy organiza_invites_read on public.organiza_invites for select to authenticated using (user_id = auth.uid() or invited_by = auth.uid());
drop policy if exists organiza_invites_answer on public.organiza_invites;
create policy organiza_invites_answer on public.organiza_invites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.organiza_notifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'aviso',
  title      text not null,
  body       text not null default '',
  link       text,
  ref        text not null default gen_random_uuid()::text,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, ref)
);
alter table public.organiza_notifications enable row level security;
drop policy if exists organiza_notifications_owner on public.organiza_notifications;
create policy organiza_notifications_owner on public.organiza_notifications for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.organiza_prefs (
  owner_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  notifications boolean not null default true,
  reminders     boolean not null default true,
  sounds        boolean not null default true,
  sound         text not null default 'suave',
  updated_at    timestamptz not null default now()
);
alter table public.organiza_prefs enable row level security;
drop policy if exists organiza_prefs_owner on public.organiza_prefs;
create policy organiza_prefs_owner on public.organiza_prefs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.organiza_availability (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);
alter table public.organiza_availability enable row level security;
drop policy if exists organiza_availability_owner on public.organiza_availability;
create policy organiza_availability_owner on public.organiza_availability for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists organiza_availability_viewer on public.organiza_availability;
create policy organiza_availability_viewer on public.organiza_availability for select to authenticated using (viewer_id = auth.uid());

-- Solo horas: ni título, ni lugar, ni descripción. Y solo si esa persona dio permiso.
create or replace function public.organiza_busy(p_owner uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, all_day boolean, rrule text, exdates text[])
language sql stable security definer set search_path = public as $$
  select e.starts_at, e.ends_at, e.all_day, e.rrule, e.exdates::text[]
  from calendar_events e
  where e.owner_id = p_owner
    and e.status is distinct from 'cancelado'
    and (e.rrule is not null or (e.ends_at >= p_from and e.starts_at < p_to))
    and exists (select 1 from organiza_availability a where a.owner_id = p_owner and a.viewer_id = auth.uid());
$$;
revoke all on function public.organiza_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.organiza_busy(uuid, timestamptz, timestamptz) to authenticated;

-- Los invitados con cuenta nacen de attendee_users; solo quien creó el evento puede invitar.
create or replace function public.organiza_sync_invites() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  delete from organiza_invites where event_id = new.id and not (user_id = any (coalesce(new.attendee_users, '{}')));
  foreach v_user in array coalesce(new.attendee_users, '{}') loop
    if v_user is distinct from new.owner_id then
      insert into organiza_invites (event_id, user_id, invited_by) values (new.id, v_user, new.owner_id) on conflict do nothing;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists organiza_sync_invites on public.calendar_events;
create trigger organiza_sync_invites after insert or update of attendee_users on public.calendar_events for each row execute function public.organiza_sync_invites();

-- Avisos del otro lado: quien recibe la invitación y quien espera la respuesta.
create or replace function public.organiza_invite_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_name text;
begin
  select title into v_title from calendar_events where id = new.event_id;
  if tg_op = 'INSERT' then
    select coalesce("displayName", 'Alguien') into v_name from profiles where id = new.invited_by;
    insert into organiza_notifications (owner_id, kind, title, body, link, ref)
    values (new.user_id, 'invitacion', 'Te invitaron a un evento', coalesce(v_name, 'Alguien') || ' te invitó a ' || coalesce(v_title, 'un evento'), '#avisos', 'invite:' || new.event_id)
    on conflict do nothing;
  elsif new.status is distinct from old.status and new.invited_by is not null then
    select coalesce("displayName", 'Alguien') into v_name from profiles where id = new.user_id;
    insert into organiza_notifications (owner_id, kind, title, body, link, ref)
    values (new.invited_by, 'respuesta', 'Respondieron tu invitación', coalesce(v_name, 'Alguien') || (case new.status when 'aceptada' then ' aceptó ' else ' rechazó ' end) || coalesce(v_title, 'el evento'), '#calendario', 'answer:' || new.event_id || ':' || new.user_id || ':' || new.status)
    on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists organiza_invite_notify on public.organiza_invites;
create trigger organiza_invite_notify after insert or update of status on public.organiza_invites for each row execute function public.organiza_invite_notify();
