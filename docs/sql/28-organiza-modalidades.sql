-- =====================================================================
-- App Organiza · Modalidades, fases y días por horario (Fase 1 de la Daily,
-- 2026-11-02). Se puede ejecutar varias veces. Solo agrega.
--
--   mode    modalidad: Base, Subele, Uber…
--   phase   fase dentro de la modalidad: Adaptación, Transición…
--   color   color del horario
--   days    días que usa (0 = lunes … 6 = domingo). Dos horarios publicados
--           nunca comparten un día.
-- =====================================================================
alter table public.organiza_schedules add column if not exists mode text not null default 'Base';
alter table public.organiza_schedules add column if not exists phase text not null default '';
alter table public.organiza_schedules add column if not exists color text;
alter table public.organiza_schedules add column if not exists days int[] not null default '{0,1,2,3,4,5,6}';
