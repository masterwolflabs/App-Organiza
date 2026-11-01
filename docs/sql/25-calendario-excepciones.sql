-- =====================================================================
-- Calendario · Excepciones de una serie (lo usa Organiza)
-- Se puede ejecutar varias veces.
--
--   exdates    días (fecha local) en que la serie NO ocurre. Mismo concepto
--              que EXDATE de Google Calendar.
--   series_id  en un evento suelto: la serie de la que se separó. Así, mover
--              "solo este martes" = sumar el día a exdates + un evento suelto.
-- =====================================================================

alter table public.calendar_events
  add column if not exists exdates date[] not null default '{}',
  add column if not exists series_id uuid references public.calendar_events(id) on delete set null;
create index if not exists calendar_events_series_idx on public.calendar_events (series_id);
