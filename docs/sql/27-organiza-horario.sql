-- =====================================================================
-- App Organiza · Empresa/Persona, horarios publicables, registro, Ruta,
-- avisos y conexiones. Se puede ejecutar varias veces. Solo agrega.
--
--   space                  'persona' o 'empresa': dos bases dentro de la app.
--   organiza_schedules     horarios: borrador (vista previa) o publicado.
--   organiza_items         tareas del horario: día, hora, portada, etiqueta,
--                          alarma, modo focus y su "mundo" (modules).
--   organiza_labels        etiquetas con el color que elige cada persona.
--   organiza_checks        lo que se hizo o no se hizo cada día.
--   organiza_days          cierre del día (checklist) y XP.
--   organiza_push          teléfonos y computadores que reciben avisos.
--   organiza_push_sent     para no repetir un aviso.
--   organiza_connections   llaves de Google / Notion: solo el servidor las lee.
--   organiza_feeds         dirección privada del calendario para Apple.
-- Todo es privado: cada persona ve y edita solo lo suyo.
-- =====================================================================

alter table public.organiza_areas add column if not exists space text not null default 'persona';
alter table public.organiza_goals add column if not exists space text not null default 'persona';
alter table public.calendar_events add column if not exists space text not null default 'persona';
create index if not exists calendar_events_source_ref_idx on public.calendar_events (source, source_ref);

create table if not exists public.organiza_labels (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space      text not null default 'persona',
  name       text not null,
  color      text not null default '#94a3b8',
  icon       text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, space, name)
);

create table if not exists public.organiza_schedules (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space        text not null default 'persona',
  name         text not null default 'Mi horario',
  cover_url    text,
  status       text not null default 'borrador' check (status in ('borrador', 'publicado')),
  alarms       text not null default 'elegidas' check (alarms in ('todas', 'elegidas', 'ninguna')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists organiza_schedules_owner_idx on public.organiza_schedules (owner_id, space);

create table if not exists public.organiza_items (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.organiza_schedules(id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday      int  not null check (weekday between 0 and 6), -- 0 = lunes
  time         text not null default '09:00',
  minutes      int  not null default 30 check (minutes > 0),
  title        text not null default '',
  icon         text not null default '',
  cover_url    text,
  stage        text not null default 'sin_empezar',
  progress     int  not null default 0 check (progress between 0 and 100),
  label_id     uuid references public.organiza_labels(id) on delete set null,
  description  text not null default '',
  alarm        text not null default 'no' check (alarm in ('no', 'notificacion', 'alarma')),
  alarm_before int  not null default 0 check (alarm_before >= 0),
  focus        boolean not null default false,
  modules      jsonb not null default '[]'::jsonb,
  sort         int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists organiza_items_schedule_idx on public.organiza_items (schedule_id);

create table if not exists public.organiza_checks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space      text not null default 'persona',
  ref        text not null,
  title      text not null default '',
  day        date not null,
  done       boolean not null,
  done_at    timestamptz not null default now(),
  value      jsonb not null default '{}'::jsonb,
  unique (owner_id, ref, day)
);
create index if not exists organiza_checks_day_idx on public.organiza_checks (owner_id, day);

create table if not exists public.organiza_days (
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space     text not null default 'persona',
  day       date not null,
  closed_at timestamptz not null default now(),
  done      int  not null default 0,
  total     int  not null default 0,
  note      text not null default '',
  primary key (owner_id, space, day)
);

create table if not exists public.organiza_push (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.organiza_push_sent (
  owner_id uuid not null references auth.users(id) on delete cascade,
  ref      text not null,
  at       timestamptz not null,
  primary key (owner_id, ref, at)
);

-- Sin políticas a propósito: las llaves de Google y Notion solo las lee el servidor.
create table if not exists public.organiza_connections (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  provider   text not null check (provider in ('google', 'notion')),
  account    text not null default '',
  tokens     jsonb not null default '{}'::jsonb,
  state      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, provider)
);

create table if not exists public.organiza_feeds (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['organiza_labels', 'organiza_schedules', 'organiza_items', 'organiza_checks', 'organiza_days', 'organiza_push', 'organiza_feeds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_owner', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.organiza_push_sent enable row level security;
alter table public.organiza_connections enable row level security;

-- Lo único que el navegador puede saber de una conexión: si existe y con qué cuenta.
create or replace function public.organiza_connections_status()
returns table (provider text, account text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.provider, c.account, c.updated_at from public.organiza_connections c where c.owner_id = auth.uid();
$$;
revoke all on function public.organiza_connections_status() from public, anon;
grant execute on function public.organiza_connections_status() to authenticated;

-- Las vistas de la tabla Daily de la nube pasan a Organiza (la nube queda igual).
insert into public.app_table_views (app, owner_scope, table_key, data)
select 'organiza', v.owner_scope, v.table_key, v.data
from public.table_views v
where v.table_key like 'daily-tabla%'
on conflict (app, owner_scope, table_key) do nothing;

-- La IA de Organiza: abierta, pero solo para orden y planificación.
update public.hub_apps set ai = coalesce(ai, '{}'::jsonb) || jsonb_build_object(
  'emoji', '🗓️',
  'rules', 'Eres el asistente de Organiza, la app de Master Wolf Labs para ordenar la vida y el tiempo. Es un chat abierto, pero solo hablas de orden y planificación: horarios, rutinas, hábitos, prioridades, pendientes, metas, productividad, descanso, y planes de comida o entrenamiento vistos como organización (no das indicaciones médicas). Si te preguntan otra cosa, dilo con amabilidad en una frase y vuelve a llevar la conversación a organizarse. También compartes datos curiosos sobre organización y hábitos cuando te los piden, y solo los que conoces con certeza. Puedes buscar en las notas y bases de datos de la persona dentro de esta app. Todavía no puedes crear eventos: si te lo piden, sugiere hacerlo desde Calendario u Horario.',
  'agents', jsonb_build_array(jsonb_build_object(
    'id', 'asistente', 'name', 'Asistente', 'emoji', '🗓️',
    'tagline', 'Ordena tu tiempo y tu vida',
    'focus', 'Coach de organización y planificación: ayuda a armar rutinas, ordenar prioridades, planificar la semana y revisar hábitos. No sale de ese tema.',
    'suggestions', jsonb_build_array('Ayúdame a ordenar mi semana', '¿Cómo armo una rutina de mañana?', 'Dame un dato curioso sobre hábitos', '¿Qué priorizo hoy?')
  ))
) where slug = 'organiza';

-- Las áreas pueden repetir nombre entre Persona y Empresa.
alter table public.organiza_areas drop constraint if exists organiza_areas_owner_id_name_key;
create unique index if not exists organiza_areas_owner_space_name on public.organiza_areas (owner_id, space, name);

-- Reconocer una fila que vino de Notion al volver a traerla.
alter table public.organiza_items add column if not exists notion_id text;
create index if not exists organiza_items_notion_idx on public.organiza_items (notion_id);
