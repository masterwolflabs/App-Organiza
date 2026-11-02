@AGENTS.md

# Organiza

App de Master Wolf Labs creada desde la plantilla (más abajo). Pedido
(2026-11-01): calendario y horario que hablen el mismo idioma, con filtros tipo
Notion por áreas de vida, y agendar por voz.
- **Un solo motor**: tabla compartida `calendar_events` con `app = 'organiza'`.
  Calendario y Horario son el mismo `CalendarView`; `horario` muestra solo lo
  que se repite (diario o semanal) y lo nuevo nace semanal.
- `components/calendar/` = COPIA de `src/components/calendar/` de la nube (más
  `McAvatar` y `EntityPicker`), con `cyan-` → `sky-` para seguir el acento.
  Agregados de Organiza: prop `horario`, `lockApp` en `EventEditor`.
- **Áreas y metas** (`components/calendar/organiza.ts`, SQL 24 de la nube):
  `organiza_areas` y `organiza_goals`, más `area_id` y `goal_id` en
  `calendar_events`. Fijo = evento sin `goal_id`. Variable = meta sin fecha
  ("una vez al mes"); al agendarla nace un evento con `goal_id`, y su avance se
  cuenta con esos eventos. Sin el SQL 24, el calendario cae a los tipos de la
  nube y `acomodar` avisa que falta activarlo.
- `acomodar` no va en el dock: con 9 botones las etiquetas se pegan en celular.
  Se llega por el menú lateral y por el bloque "Por acomodar" de Hoy.
- **Una sola repetición** (SQL 25): `exdates` son los días que la serie salta;
  mover o editar "solo este día" suma el día a `exdates` y crea un evento suelto
  con `series_id`. El `expand` de la nube aún no lee `exdates`: si la Mente
  muestra eventos de Organiza, ahí se vería la serie y el evento suelto.
- Horario: muestra horas libres de 6:00 a 23:00 y avisa rutinas que se cruzan.
  Mover ahí siempre mueve la serie, porque es la semana tipo.
- Plan: 1 base ✅, 2 áreas y fijo/variable ✅, 3 horario y excepciones ✅, 4 voz con tarjeta de confirmación (toca el repo de la nube), 5
  revisión.
- **Persona / Empresa** (Emanuel, 2026-11-02): `components/organiza/space.tsx`; todo dato lleva `space` y las pantallas son las mismas.
- **Horario** ya no es `CalendarView`: `organiza_schedules` + `organiza_items` (SQL 27). Nace en vista previa; publicar lo vuelve eventos semanales `source='horario'`, y solo hay uno publicado por base.
- **Datos**: `components/organiza/db.tsx` (`useDb`) para probar en memoria; lógica en `model.ts` y `useHorario.ts`. El récord se sigue por nombre de actividad (`refOf`).
- **Daily** vive aquí (`components/daily/`): la cuenta Labs lee `table_views.daily`, la misma de `daily.sh`; las demás, `organiza-daily-<space>`.
- **Cómo trabajamos** (`components/daily/DailyManual.tsx`): debajo de la Daily, igual a su Notion "Paso a Paso Claude"; estilos en `components/daily/how.css`.
- **Conexiones y teléfono**: `docs/CONEXIONES.md`. Llaves en Vercel; `lib/server/` es solo servidor.
- **Tour**: `utils/tourScript.ts` debe ser igual a `src/utils/organizaTour.ts` de la nube, que genera la voz.
- Guía para quien sigue el proyecto: `docs/TRASPASO.md`. SQL 24 y 25: `docs/sql/`.
- Modo claro: `bg-white` significa oscuro (la plantilla invierte `--color-white`);
  para blanco real usar `bg-[#fff]`.

# Plantilla Master Wolf (master-wolf-app-template)

Base de las apps de Master Wolf Labs, sacada de **Master Wolf Finance**
(`masterwolflabs/master-wolf-finance`). Cada app se crea con "Use this
template" y se conecta a **App Master Cloud** (`masterwolflabs/App-Master-Cloud`,
https://app-master-cloud.vercel.app). Las decisiones de diseño de la plantilla
están en el repo de la nube: `docs/PLANTILLA.md`.

**Quién trabaja aquí:** los socios de Master Wolf Labs, que no son
programadores. Responder en español (Chile), paso a paso, con clics exactos
para Supabase, Vercel y GitHub, y SQL listo para pegar.

## Stack
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4,
  las mismas versiones que Finance para que sus piezas se copien sin cambios.
  Leer `node_modules/next/dist/docs/` antes de tocar convenciones de Next.
- Supabase compartido con la nube y Finance (proyecto `uxozatzegnoczgiilvvc`).
  Todo es client-side con `@supabase/supabase-js` y RLS, como Finance.
  URL y clave anon (públicas) van escritas en `lib/supabaseClient.ts`; las
  variables de Vercel son opcionales y, si vienen mal escritas, se ignoran
  (2026-10-21: una app quedó con ".supabase.com" porque Chrome tradujo el
  panel de Vercel). **No cambiar a cookies/PKCE**: la nube abre las apps con la sesión en el
  `#access_token` y supabase-js la lee sola (ver `docs/NUBE.md`).

## Estructura
- `app.config.ts`: nombre, slug (= `hub_apps.slug`), acento por defecto,
  URL de la nube y `SECTIONS` (las secciones PROPIAS de la app). Es lo primero
  que se edita en una app nueva. Sus vistas van en `components/views/index.ts`
  (`VIEWS`). Las secciones que trae la plantilla (Notas, IA, Chat…) están en
  `utils/sections.ts`, para que actualizar la plantilla nunca rompa una app.
  Regla: una pieza nueva de la plantilla NUNCA debe exigir cambios en
  `app.config.ts` ni en `components/views/` de las apps.
- `app/page.tsx`: login (`components/auth/LoginScreen.tsx`) o esqueleto.
- `components/shell/AppShell.tsx`: el esqueleto. Tiene sección por `#hash`
  con atrás/adelante y título de pestaña, preferencias, perfil compartido,
  `touchApp()`, buscador y `VIEWS`.
- `components/shell/`: piezas de Finance generalizadas: `Topbar` (sin el
  ojo de ocultar montos, que cada app agrega si lo necesita), `Sidebar`
  (cajón), `BottomDock` (con la Nube al centro), `GlobalSearch`,
  `AmbientBackdrop`, `AnimatedNumber` y `Brand`.
- `components/dashboard/`: `DashboardUI` (SectionShell neon/assistant/glass,
  SectionHeader, AddTile, HeaderAction…) y `ExpandPair`, copiados de Finance.
  Neón y asistente siguen el acento.
- `components/user/UserCenter.tsx`: Perfil (tabla `profiles` compartida),
  Seguridad y Configuración. Almacenamiento, Plan, Bóveda y Datos están
  listados como "Próximamente".
- `components/mente/`: Mente Singular (`MenteSingular`, `MenteGate` con 2FA,
  `ui` con re-autenticación). Inicio y Usuarios (`MMHome`, `MMUsers`) son
  COPIA de los de la Mente Maestra de la nube (`src/components/mente/` en
  App-Master-Cloud), con `app = APP.slug` fijo: si se cambian allá, se copian
  aquí (solo cambia el import `@/lib/mente` → `@/utils/mente`). Usan
  `cloud_mm_overview / cloud_mm_users / cloud_mm_user_detail(p_app)` (SQL 08
  de la nube). Más Laboratorio y Auditoría. Lógica en `utils/mente.ts`.
- `utils/appearance.ts` + el bloque "APARIENCIA CONFIGURABLE" de
  `app/globals.css`: paleta y luces. Funcionan como el modo claro de Finance:
  los componentes usan `sky-*`/`blue-*` y `data-accent` cambia lo que
  significan; las luces usan `--amb-*`. Ese bloque se generó desde los colores
  oficiales de Tailwind. Para un acento nuevo, regenerarlo con la misma lógica:
  `--color-sky-N` = color A, `--color-blue-N` = color B, y en claro 100–400
  más oscuros.
- `utils/cloud.ts`: `openCloud()` (window.open ANTES del await, o el
  navegador bloquea la pestaña), `touchApp()` y `useFlag()`.

## Tablas y bases de datos estilo Notion (v0.2, 2026-10-21)
Copiadas TAL CUAL de Finance para poder traer sus mejoras con un simple copiar
(solo cambian las rutas de import y el almacenamiento):
- `components/tables/` = `components/company/` de Finance: `table.tsx`
  (`Table` / `DataTable`: vistas en pestañas, filtros, orden, columnas ocultas,
  reordenadas y anchas, clic derecho, Galería/Calendario vía `tableViews.tsx`,
  columnas propias "+" vía `customFields.tsx`, relaciones y resúmenes vía
  `relations.tsx`, formato de celdas `cellMenu.tsx`), `section.tsx`, `ui.tsx`
  (`Modal` = ventana tipo Notion flotante/lateral/página completa, `Pill`,
  `Field`, estilos) y `viewsStore.tsx`.
- `components/databases/` + `utils/databases.ts`, `utils/notionFormula.ts`,
  `utils/useDatabases.tsx` y `utils/mathExpression.ts`: las Bases de datos
  del usuario. El embed dentro de notas (TipTap) NO viene todavía, porque llega
  con las Notas.
- **Almacenamiento por app**: `viewsStore` usa `app_table_views` y
  `useDatabases` usa `app_databases` / `app_database_rows`, siempre con
  `app = APP.slug` y `owner_scope = user.id` (RLS: solo el dueño). SQL en la
  nube: `supabase/05-bases-de-datos-apps.sql`. Finance sigue con sus propias
  tablas (`table_views`, `user_databases`…), que no se tocan.
- Proveedores en `AppShell`: `ConfirmProvider` → `TableViewsProvider scope=user.id`
  → `DatabaseStoreProvider`.
- Al traer una mejora desde Finance: copiar el archivo de `components/company/X`
  a `components/tables/X`, cambiar `@/components/company/` por
  `@/components/tables/` (y confirm por `@/components/ui/confirm`), y NO
  sobrescribir `viewsStore.tsx` ni `utils/useDatabases.tsx` (los cambios
  de almacenamiento por app viven ahí).
- Cuidado heredado: nunca darle a un `DataTable` un `id` igual a otra clave
  guardada en el mismo store.

## Chat compartido con la nube (v0.3, 2026-10-22)
- Es el chat de Finance TAL CUAL (`components/community/*` + `CommunityView`),
  sobre las MISMAS tablas de Finance (`direct_messages`, `chat_groups`,
  `chat_group_*`, `chat_favorites`, `chat_starred`, buckets `community-audio`
  y `community-files`).
- **Por app**: `direct_messages.app` y `chat_groups.app` (SQL 09 de la nube;
  null = Finance). `utils/chatScope.ts` filtra y marca la app. En la
  plantilla `CHAT_SCOPE = { filter: APP.slug, send: APP.slug }` (en
  AppShell): cada app ve sus grupos (los "canales" de esa app) y sus mensajes
  directos. La nube ve todo con filtro.
- `components/community/ChatSystem.tsx` = la orquestación que en Finance vive
  en `app/page.tsx`: `ChatProvider` (arriba de toda la app: ventanas flotante
  y lateral, aviso de mensaje nuevo), `useChat()` (no leídos para la campana) y
  `ChatView` (la sección).
- Todavía no vienen: tickets de soporte en el chat y canales de difusión (los
  de Finance son de demostración).
- Sabido: marcar como leído (`mark_dm_read`) marca los mensajes de esa persona
  en todas las apps.

## Notas compartidas con la nube (v0.4, 2026-10-23)
- Son las Notas de Finance TAL CUAL (`components/notes/*`: tablero, editor
  TipTap con imágenes, archivos, colores, calculadora y bases de datos dentro de
  la nota, ventana lateral / centrada / flotante / completa, compartir con
  personas o con link), sobre las MISMAS tablas de Finance (`notes`,
  `note_members`, `note_share_links`, `note_categories`, bucket `documents`).
- **Por app**: `notes.app` (SQL 10 de la nube; null = Finance). `useNotes.ts`
  filtra con `utils/chatScope.ts` (el mismo scope del chat) y guarda la app en
  cada nota nueva. Una nota de otra app igual se abre desde una tarjeta del chat.
- `components/notes/NotesSystem.tsx` = la orquestación que en Finance vive en
  `app/page.tsx`: `NotesProvider` (arriba de la app, DENTRO de `ChatProvider` y
  de `DatabaseStoreProvider`: la nota abierta sigue viva al navegar; publica su
  `NotesBridge` al chat para adjuntar y abrir notas) y `NotesView` (la sección).
- `/n/<token>`: página pública de un link de nota (sin cuenta). "Guardar en mi
  cuenta" lleva a `/?share=<token>`.
- No vienen (son de Finance): notas de movimientos y de proyectos. La
  calculadora resuelve sola lo simple; frases ("dos mil más…") usan
  `/api/calculator-solve`, que llega con la IA.

## IA con la nube (v0.5, 2026-10-23)
- El MOTOR y las llaves de OpenAI / Claude viven SOLO en App Master Cloud
  (`src/lib/ai/*`, rutas `/api/ai/chat`, `/api/ai/engines`,
  `/api/ai/transcribe`, `/api/calculator-solve`). La app llama a
  `${APP.cloudUrl}/api/ai/*` con la sesión de la persona (Bearer) y su
  `app` (`lib/aiClient.ts`). Esta app no tiene llaves de IA.
- Pantalla: la de Finance tal cual (`components/ai/*`: historial, carpetas,
  motores, agentes, markdown, copiar / regenerar / editar, archivos y notas de
  voz). `components/ai/AIChatView.tsx` = `FinanceChatView` y
  `components/ai/IAHome.tsx` = inicio de IA (imagen `public/ia/wolf-hero.webp`
  + frase + Iniciar chat + créditos). Sin reporte financiero, dato random ni
  progreso (son de Finance).
- **Cada app** define su IA en la nube, en `hub_apps.ai` (SQL 11): nombre del
  asistente, reglas, cupo mensual de créditos, motores y agentes. La imagen
  del inicio es `public/ia/wolf-hero.webp` de cada app.
- **Datos**: la IA lee las notas y las bases de datos de ESTA app de la
  persona (solo lectura, con su sesión). **Créditos separados por app**.
- Conversaciones: mismas tablas de Finance (`ai_conversations`…) con columna
  `app`; `utils/useAIConversations.ts` muestra solo las de esta app.
- `app/api/calculator-solve` (calculadora de las notas) solo reenvía a la nube.

## Voz con la nube (v0.6, 2026-10-23)
- Asistente de voz en tiempo real de Finance tal cual
  (`components/ai/VoiceAssistant.tsx`): botón flotante abajo a la izquierda en
  todas las secciones menos los chats a pantalla completa. OpenAI Realtime por
  WebRTC directo desde el navegador; la nube (`/api/ai/voice/session`) crea una
  llave temporal (la de OpenAI nunca sale de la nube), `/api/ai/voice/tool`
  ejecuta las herramientas (notas y bases de datos de esta app) y
  `/api/ai/voice/usage` registra el consumo en los créditos de la app.
- Puede LLEVAR a la persona a cualquier sección (`navigate_to` con las
  secciones de `ALL_SECTIONS`, que AppShell le pasa) y sabe en cuál está.
- Corta sola tras 60 s sin hablar (costo). Sin Master Wolf Control (de Finance).

## Calculadora (v0.6.1, 2026-10-25)
- La calculadora flotante de Finance tal cual (`components/calculator/*`:
  básica, científica, conversor de monedas y unidades, dictar una operación,
  minimizar y arrastrar). Flota encima de todas las páginas y ventanas
  (portal, `z-[95]`). Se abre con el botón 🧮 de la barra superior y con ⌘K
  ("Calculadora").
- Tipos de cambio: `app/api/currency-rates` reenvía a la nube (las APIs
  externas pasan por App Master Cloud). Frases ("el IVA de…"): la IA de la nube
  (`app/api/calculator-solve`).

## Ayuda de 2 segundos (de Finance)
`components/ui/HelpTips.tsx` (montado en AppShell): cualquier elemento con `data-help="…"` (y
opcional `data-help-title`) muestra una cajita al dejar el cursor 2 s encima. Las tablas
(`components/tables/table.tsx`) ya lo traen en su barra de íconos, vistas y encabezados
(`help={{columna: texto}}`), y el clic derecho → "¿Para qué sirve?". Prefiere `data-help` a `title`.

## Traer mejoras de Finance: `npm run sync:finance`
`scripts/sync-from-finance.mjs` lee Finance desde GitHub (`git fetch` + `git
show origin/main:…` de `../master-wolf-finance`, sin tocar su carpeta) y:
- muestra los commits nuevos desde la última sincronización
  (`scripts/finance-sync.json`) y la sección `## Para la plantilla` del
  CLAUDE.md de Finance (lo que Emanuel marcó con "esto también va para la
  plantilla de Master Cloud");
- AUTO: archivos copiados tal cual (solo se reescriben los imports). `--apply`
  los copia y mueve el punto de sincronización;
- MANUAL: archivos adaptados en la plantilla. Muestra cuáles cambiaron en
  Finance; con `--diff` muestra el detalle para aplicarlo a mano;
- avisa si un archivo copiado importa algo nuevo que la plantilla no tiene.
  Hay que agregarlo a AUTO o MANUAL en el script.

`app/globals.css` es el de Finance tal cual. Lo propio de la plantilla (paleta
y luces) está en `app/appearance.css`.
Después de sincronizar: `npm run build`, probar las vistas afectadas, subir la
versión en package.json y en `hub_templates` (SQL en la nube) y hacer commit.

## Llevar la plantilla a las apps: `npm run update:template`
Va dentro de cada app creada con la plantilla (`scripts/update-from-template.mjs`).
Hace `git fetch` de masterwolflabs/master-wolf-app-template y copia sus
archivos, salvo lo propio de cada app: `app.config.ts`, `README.md`,
`CLAUDE.md`, `components/views/`, `public/` y `.env*`. En `package.json`
conserva nombre y versión y suma dependencias y scripts. Para que una mejora
llegue bien a todas las apps, ponla en la plantilla, no en la app.

## Reglas heredadas de Finance
- Diseño: mínimo y sutil, "una sinfonía de arte". El neón va solo donde
  importa.
- Ventanas y paneles en portal (`components/ui/BodyPortal.tsx`): el
  backdrop-blur atrapa los `fixed`.
- Links externos: `<a href target="_blank">`. `window.open` solo de forma
  síncrona dentro del click.
- Seguridad en la base de datos (RLS y funciones `security definer`), nunca
  solo en la UI.
- Todo lo importante se escribe en este archivo (la memoria de Claude es por
  computador).
