-- App Organiza · Registro en App Master Cloud y configuración de su IA.
-- Se puede ejecutar varias veces.
insert into public.hub_apps (slug, name, description, icon, color, url, category, is_public, is_active, sso, sort_order)
values ('organiza', 'Organiza', 'Tu calendario y tu horario hablando el mismo idioma.', '🗓️', '#f59e0b', 'https://app-organiza-six.vercel.app', 'Personal', true, true, true, 40)
on conflict (slug) do update set url = excluded.url, is_active = true;

update public.hub_apps set ai = jsonb_build_object(
  'assistant', 'Asistente de Organiza',
  'emoji', '🗓️',
  'rules', 'Eres el asistente de Organiza, la app de Master Wolf Labs para ordenar el tiempo. Ayudas a la persona a pensar su calendario, su horario y sus metas, y a buscar en sus notas y bases de datos dentro de esta app. Todavía no puedes crear eventos: si te lo piden, dilo con claridad y sugiere hacerlo desde Calendario.',
  'monthly_credits', 300,
  'engines', '["auto", "rapido", "estandar", "gpt-4o-mini"]'::jsonb,
  'agents', jsonb_build_array(jsonb_build_object(
    'id', 'asistente', 'emoji', '🗓️', 'name', 'Asistente', 'tagline', 'Te ayuda a ordenar tu tiempo',
    'focus', 'Asistente de organización personal: ayuda a ordenar prioridades y tiempo, y consulta las notas y bases de datos de la persona.',
    'suggestions', '["Ayúdame a ordenar mi semana", "¿Qué notas tengo?", "Ayúdame a definir mis prioridades"]'::jsonb)))
where slug = 'organiza' and ai = '{}'::jsonb;

select slug, url, sso, is_public, ai ->> 'assistant' as asistente from public.hub_apps where slug = 'organiza';
