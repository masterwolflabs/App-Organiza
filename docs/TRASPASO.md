# Traspaso de Organiza

Guía para seguir editando Organiza. El detalle técnico está en `CLAUDE.md`, y
Claude Code lo lee solo al abrir el proyecto.

## Qué es

Calendario y horario personal de Master Wolf Labs. Calendario y Horario usan los
mismos datos, los eventos se filtran por áreas de vida (Mi relación, Dios,
Familia…) y lo variable ("una vez al mes") vive en **Por acomodar** hasta que se
agenda.

## Enlaces

- App publicada: https://app-organiza-six.vercel.app
- Código: https://github.com/masterwolflabs/App-Organiza
- Publicación: Vercel, equipo `Masterwolf`, proyecto `app-organiza`
- Base de datos: Supabase, proyecto `sistema financiero` (`uxozatzegnoczgiilvvc`)

## Estado

| Etapa | Estado |
|---|---|
| 1. Base: Hoy, Calendario, Horario, Por acomodar | Lista |
| 2. Áreas de vida, filtros, metas variables | Lista |
| 3. Semana tipo, horas libres, cruces, cambiar un solo día | Lista |
| 4. Agendar por voz con tarjeta de confirmación | Pendiente |
| 5. Revisión final en computador y celular | Pendiente |
| 6. Persona/Empresa, Daily, horario publicable, mundo por tarea, checklist, Ruta, tour | Lista |
| 7. Google, Apple, Notion, avisos e iPhone | Llaves de Google y `SUPABASE_SERVICE_ROLE_KEY` puestas en Vercel (2026-11-03, cliente OAuth "Organiza", app En producción). Falta que Emanuel conecte su cuenta. Conexiones vive en Configuración (`SETTINGS_PAGES` de `components/views/index.ts`). Resto: `docs/CONEXIONES.md` |

Pendientes concretos:

- La etapa 4 también cambia el repositorio `App-Master-Cloud`, donde vive la IA.
  La voz debe mostrar una tarjeta para confirmar antes de guardar.
- `model.ts` de la nube todavía no lee `exdates`. Hay que copiar ese cambio para
  que el calendario de la nube muestre bien un día cambiado.
- Los SQL `24` y `25` ya están aplicados en Supabase. Sus copias están en
  `docs/sql/` y faltan en la carpeta `supabase/` de `App-Master-Cloud`.
- La app ya está registrada en la nube (`docs/sql/26-registrar-organiza.sql`) y
  su dirección está autorizada en Supabase para entrar con Google. Si cambia la
  dirección, hay que actualizar ambas cosas.
- `app-organiza.vercel.app` es de otra persona. No la uses como enlace.
- Quedan textos que dicen "Master Finanzas" en notas y compartir. Conviene
  corregirlos en la plantilla.

## Preparar el computador

1. Pide acceso a `masterwolflabs/App-Organiza` en GitHub.
2. Instala [Node.js](https://nodejs.org) y
   [Claude Code](https://claude.com/claude-code).
3. Abre la Terminal y descarga el proyecto:

```bash
git clone https://github.com/masterwolflabs/App-Organiza.git
```

4. Entra a la carpeta e instala lo que necesita:

```bash
cd App-Organiza
```

```bash
npm install
```

5. Abre la app en tu computador, en `http://localhost:3000`:

```bash
npm run dev
```

6. En otra ventana de Terminal, dentro de la misma carpeta, abre Claude Code y
   pide lo que quieras cambiar:

```bash
claude
```

## Trabajar sin romper nada

- Antes de empezar, trae lo último con `git pull`.
- Todo lo que llega a `main` se publica solo en Vercel. Prueba en
  `http://localhost:3000` antes de subir.
- La base de datos es **real y compartida** con Finance y App Master Cloud. Lo que
  cambies ahí afecta a todas las apps, incluso desde tu computador.
- Los cambios de base de datos solo agregan cosas. No borres tablas ni columnas.
- Las claves privadas nunca van en el código. Las de IA viven solo en la nube.
- Para traer mejoras de la plantilla: `npm run update:template`.

## Alimentación y Entrenamiento (3 nov 2026, rama `organiza-alimentacion-entrenamiento`)

Secciones `alimentacion` y `entrenamiento` (menú lateral): `components/organiza/Planner.tsx` (grilla semanal, fichas con portada, metas) y `components/organiza/plan.ts` (`usePlan`, `useNutrition`). Tablas `organiza_meals`, `organiza_workouts`, `organiza_nutrition` (`docs/sql/34`, ya aplicada). Una acción se conecta con los módulos `alimentacion` / `entrenamiento` (`PlanLink`), que muestran lo del día de la acción. Pendiente: organizar compras (tarea `organizar-compras`).

## Reacomodar el día (2026-11-04)
- Tablero: acciones, eventos del calendario (tarjetas con su color, inicio–fin, sello «Calendario») y extras «Solo este día» van en una sola fila por hora.
- `morningConflict` (dayPlan.ts): si el primer evento llega antes de que termine la rutina de la mañana (por nombre: levantarse, ducha, desayuno…), la rutina se adelanta entera.
- Botón «Reacomodar este día» (rojo neón `.neon-red`) aplica la propuesta y abre `AdjustBox` (DayAdjust.tsx): Me gusta / Modificar / Deshacer. Modificar = escribir o dictar (SpeechRecognition es-CL) → nube `/api/organiza/adjust-day` (proposito `adjust-day`, créditos de la app) → moves + extras del plan de ese día.
- Deshacer / Rehacer en `useHorario` (historial en memoria, 100 pasos, cambios juntos se agrupan).

## La IA ayuda con el horario (2026-11-04)
- Nube `src/lib/ai/tools/organiza.ts` (solo app `organiza`, `EngineTool.apps`): `get_horario` (lee), `marcar_en_horario` y `proponer_cambios_horario` (no escriben: dejan `ctx.actions` → `metadata.actions` del mensaje).
- Organiza `components/organiza/aiMarks.ts`: el chat guarda las marcas (localStorage `organiza-ai-marks`) y muestra «🎯 Ver en el Horario»; el Tablero dibuja `.ai-mark` (borde que titila) y `AIMarksBar` con «Aplicar» (usa `h.patchItem`, se puede deshacer).

## Horario simple + Conceptos (2026-11-04)
- **Regla de Emanuel:** lo que no se entiende sale de la vista y se anota en **Configuración → Conceptos** (`components/views/ConceptosView.tsx`, lista `CONCEPTOS`). Si algún día vuelve, se rehace desde ahí.
- Cabecera del Horario: nombre + sello **● Activo / Borrador**, selector solo si hay más de un horario, **Nuevo horario** (copiar este, importar, plantillas). Debajo: Sueño y colores.
- Borrador → franja ámbar con **Publicar**. Activo → sin «Publicar cambios»: `useHorario` re-sincroniza el Calendario solo, 2 s después del último cambio. «Pasar a borrador» abajo, junto a Borrar.
- Guardados en Conceptos: Tu semana, Portada del horario, Modalidad, Fases, Publicar cambios (los datos `mode`/`phase` siguen en la tabla).
- **Partes del día** (2026-11-04): el Tablero separa cada día en 🌙 Madrugada / ☀️ Mañana / 🌤️ Tarde / 🌆 Noche (`PART_INFO`, `partOf` en `HorarioView.tsx`). Horas en «🌗 Partes del día» (localStorage `organiza-day-parts`, por defecto 6 · 12 · 19). Hoy, una parte que ya terminó se pliega sola con «X de Y hechas · N se pasaron»; sus tareas sin marcar llevan «⌛ Se pasó la mañana». Tocar el título pliega/abre cualquier parte.
- **Todas las vistas** (2026-11-04): la barra (semana ‹ ›, Enfocar hoy, Comenzar desde, Partes del día) sale en Tablero, Semana, Mi semana, Galería y Lista (`DayCtx`, `toneOf`, `daysOfWeek`). Galería y Lista van por día y por partes; Semana parte en la hora de «Comenzar desde» y marca las partes con líneas.
- **Racha** = `StreakChip`: 🔥 + número; ✕ rosado si ese día pasado no se cumplió; el fueguito en gris en los días que vienen (siempre, aunque Enfocar hoy esté apagado).
- Cabecera: «● Activo» del alto de «Nuevo horario»; abajo «Pasar a borrador» y «Borrar este horario» como botones.
- **Categorías** (2026-11-04): en la barra solo las 2 con más tareas (+ la que estés filtrando), «+ Nueva» y «Categorías (N)». La ventana muestra todas ordenadas por uso, con emoji (`IconPicker`), color, cuántas tareas y «Ver solo esta».
- **Racha coherente** (2026-11-04): o lo hiciste o no. Si hoy terminó la parte del día de una tarea (mañana/tarde/noche) y no la marcaste (ni reprogramaste), hoy es ✕, la racha se corta y los días que vienen se proyectan desde 1 (`missedToday` en `streakFor`). Con «⌛ Se pasó…» ya no sale «Pendiente hoy».
