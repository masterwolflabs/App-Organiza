-- =====================================================================
-- App Organiza · Bloques y plan del día (Fases 2 a 5 de la Daily, 2026-11-02).
-- Se puede ejecutar varias veces. Solo agrega.
--
--   organiza_items.flex       obligatorio | flexible | secundario
--   organiza_items.category   remunerado | administrativo | proyectos | personal
--   organiza_items.priority   1 alta · 2 media · 3 baja
--   organiza_items.block      'sueno' = lo maneja la configuración del sueño
--   organiza_schedules.sleep  { bed, wake, goal }
--   organiza_day_plans        lo que cambia SOLO un día: qué horario usa, qué se
--                             movió y qué imprevisto apareció. Nunca toca la plantilla.
-- =====================================================================
alter table public.organiza_items add column if not exists flex text not null default 'flexible';
alter table public.organiza_items add column if not exists category text not null default '';
alter table public.organiza_items add column if not exists priority int not null default 2;
alter table public.organiza_items add column if not exists block text not null default '';
alter table public.organiza_schedules add column if not exists sleep jsonb;

create table if not exists public.organiza_day_plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space       text not null default 'persona',
  day         date not null,
  schedule_id uuid references public.organiza_schedules(id) on delete set null,
  moves       jsonb not null default '{}',
  extras      jsonb not null default '[]',
  updated_at  timestamptz not null default now(),
  unique (owner_id, space, day)
);
alter table public.organiza_day_plans enable row level security;
drop policy if exists organiza_day_plans_own on public.organiza_day_plans;
create policy organiza_day_plans_own on public.organiza_day_plans for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
