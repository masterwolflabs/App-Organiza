-- Migration: clima (Emanuel, 12 nov 2026). Idempotente.
-- organiza_prefs.weather = { cities: [{name, country, lat, lon}], fallback: {name, lat, lon} | null, geo: 'si'|'no'|null }
alter table public.organiza_prefs add column if not exists weather jsonb not null default '{}'::jsonb;
