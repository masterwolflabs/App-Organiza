-- Migration 45 (2026-11-17): 📸 Nutrition Pro — registro de lo que comes + 💊 suplementos (Daily
-- nutrition-registro-foto-suplementos). Idempotente; solo agrega.
--   organiza_food_log          cada comida registrada: items [{name, grams, per100: {kcal, protein, …}}]
--                              (la IA da gramos y nutrientes por 100 g; la app multiplica y suma)
--   organiza_supplements       tus suplementos: dosis, veces al día, hora y lo que aporta UNA dosis
--   organiza_supplement_takes  el check diario «lo tomé» (n = cuántas dosis ese día)
create table if not exists public.organiza_food_log (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space      text not null default 'persona',
  day        date not null default current_date,
  slot       text not null default 'almuerzo',
  title      text not null default '',
  source     text not null default 'texto',
  items      jsonb not null default '[]'::jsonb,
  note       text not null default '',
  recipe_id  uuid references public.organiza_recipes(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.organiza_food_log enable row level security;
drop policy if exists organiza_food_log_owner on public.organiza_food_log;
create policy organiza_food_log_owner on public.organiza_food_log for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_food_log to authenticated;
create index if not exists organiza_food_log_owner_day on public.organiza_food_log (owner_id, space, day);

create table if not exists public.organiza_supplements (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space      text not null default 'persona',
  name       text not null default '',
  dose       text not null default '1 cápsula',
  per_day    int not null default 1,
  time       text,
  nutrients  jsonb not null default '{}'::jsonb,
  other      text not null default '',
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.organiza_supplements enable row level security;
drop policy if exists organiza_supplements_owner on public.organiza_supplements;
create policy organiza_supplements_owner on public.organiza_supplements for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_supplements to authenticated;

create table if not exists public.organiza_supplement_takes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  supplement_id uuid not null references public.organiza_supplements(id) on delete cascade,
  day           date not null default current_date,
  n             int not null default 1,
  unique (owner_id, supplement_id, day)
);
alter table public.organiza_supplement_takes enable row level security;
drop policy if exists organiza_supplement_takes_owner on public.organiza_supplement_takes;
create policy organiza_supplement_takes_owner on public.organiza_supplement_takes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.organiza_supplement_takes to authenticated;
