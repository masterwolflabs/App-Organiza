-- Migration 41 (2026-11-16): Organiza pasa a llamarse Master Planner. Solo lo visible en la nube:
-- nombre, ícono (el logo publicado en la app) y el nombre del asistente. El slug 'organiza' no cambia.
update public.hub_apps
set name = 'Master Planner',
    icon = 'https://app-organiza-six.vercel.app/icon-192.png',
    ai = jsonb_set(
           jsonb_set(ai, '{rules}', to_jsonb(replace(ai->>'rules', 'Organiza', 'Master Planner'))),
           '{assistant}', to_jsonb(replace(ai->>'assistant', 'Organiza', 'Master Planner')))
where slug = 'organiza';
