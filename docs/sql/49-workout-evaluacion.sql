-- Migration 49 (2026-11-17): 🧪 Workout Pro · evaluación personalizada (Daily workout-pro-mod-04-evaluacion). Idempotente; solo agrega.
--   organiza_prefs.assessment  { version, basica: { answers, step, done_at, updated_at }, avanzada: { … } }
--   Básica y avanzada van separadas; las respuestas son de la persona (RLS de organiza_prefs: owner_id = auth.uid()).
alter table public.organiza_prefs add column if not exists assessment jsonb not null default '{}'::jsonb;
