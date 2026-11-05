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
- **Tarjeta** (2026-11-04): estado en vivo `liveStatus` (Pendiente → ⏰ Por activarse 30 min antes → 🚀 ¡Ejecutar ya! → ▶️ En ejecución si la empezaste → ⏳ Atrasada (sigue a color) → ✖️ Incumplida al pasar su parte del día; ✅ Hecho / ✖️ No lo hice mandan). Estado, racha, Focus y Alarma en una fila; categoría con forma de etiqueta (`TagChip`, tocarla filtra); hora en negrita + «– término · N min». Menú «👁️ Mostrar» (localStorage `organiza-card-fields`) oculta portada, estado, racha, focus/alarma, categoría, hora y duración en Tablero, Galería y Lista.

### Tablero en franjas (2026-11-05, maqueta de Emanuel)
- `Board` (HorarioView) es una grilla: arriba la cabecera de cada día (fecha, eventos de todo el día, Reacomodar); después una **fila por parte del día** (Madrugada/Mañana/Tarde/Noche, solo las que tienen algo) que cruza los 7 días, así en cada franja todas las columnas parten a la misma altura; al final «Nueva tarea» por día.
- Plegar una franja la pliega en toda la semana (`fold[part]`); sin tocar, si la semana es esta, se pliega lo que ya pasó hoy (resumen «hoy X de Y hechas · N se pasaron»).
- Cada casilla lleva `PART_INFO[k].grad` (degradado de esa hora). Al fondo `SkyDecor`: sol (mañana), sol con nubes (tarde), luna y estrellas (noche/madrugada), según la hora actual.
- Menú 👁️ Mostrar: nuevo campo **Nombres de las partes** (`partes`), oculta los títulos de las franjas (queda la línea y la flecha) y la etiqueta de parte en Galería/Lista.
- Tarjeta: clase `.hz-card` en globals.css (gris sólido, más gris en tema claro).
- (2026-11-05, después) Cada casilla de franja corta a la altura de sus acciones (`self-start`, ya no se estira a la más alta) y lleva un **+** al final: crea la tarea ese día en esa franja, a la hora en que termina lo último (o al inicio de la franja); `addItem` ahora toma `p.time` como hora preferida y busca la siguiente libre. La fila final «Nueva tarea» solo sale si la semana está vacía.
- (2026-11-05) `SkyDecor` pasó a la raíz de HorarioView (todas las vistas): `sticky top-0 -z-10 h-0` dentro de un contenedor `relative isolate`, arriba a la derecha (en el espacio del encabezado) y fijo al deslizar. El resplandor (`.hz-glow` en globals.css) respira cada 5 s; se apaga con «reducir movimiento».
- (2026-11-05) El sol vuelve a quedarse arriba en la página (no sigue al deslizar): `absolute top-0`. La barra de cada franja mide el ancho visible del tablero (`vw` con ResizeObserver, `sticky left-0`): texto · puntos · flecha al final, sin puntos encima ni fuera de la pantalla.
- (2026-11-05) `SkyDecor` con 4 escenas según la parte del día: 🌅 amanecer (mañana: sol saliendo con rayos `.hz-rays`, nubes rosadas, lomas), 🌇 atardecer (tarde: sol rojizo entre nubes), 🌆 anochecer (noche: luna creciente violeta + estrellas) y 🌌 madrugada (luna llena con cráteres + estrellas). Las estrellas titilan (`.hz-star`). Cada escena lleva `mask="url(#hz-fade)"` para desvanecerse hacia los bordes (sin cortes rectos).
- (2026-11-05) Tema claro: la tarjeta de evento del calendario (`evChip`) tenía el fondo oscuro escrito en `style` (`#17191fe6`), que el bloque LIGHT THEME no alcanza; ahora usa `.hz-card` + `backgroundImage` con el color del evento. Revisadas las 5 vistas del Horario en claro y oscuro (sin fondos oscuros en claro ni claros en oscuro). Regla: nunca un fondo oscuro en `style={{ background }}`; usar clase.

### Hora de la aplicación y tema «Según la hora» (2026-11-05)
- `utils/appClock.ts`: `appNow()` / `useAppNow()`; Configuración → **Hora de la aplicación** (`ClockCard` en UserCenter): Automática (hora del equipo) o Manual (día + hora, el reloj corre desde ahí; `organiza-app-clock` en este navegador). Manual es **solo para ver**: HorarioView (semana, franjas, estados en vivo, racha, Enfocar hoy, fondo) usa `appNow()`, pero lo que se marca (FocusTimer, panel) se guarda con la fecha real. Con manual puesto sale `ClockBanner` arriba («🕐 Hora de prueba … · Volver a la real»).
- Tema nuevo **🌗 Según la hora** (`ThemePref 'hora'`): claro en mañana/tarde, oscuro en noche/madrugada según la hora de la app y `organiza-day-parts`. AppShell lo re-aplica cada 30 s y al cambiar la hora; THEME_BOOT_SCRIPT lo calcula antes de pintar. Ojo al traer cambios de la plantilla: `utils/theme.ts` y `UserCenter.tsx` tienen esto propio de Organiza.
- (2026-11-05) Tarjeta del Tablero siempre con 3 cosas + la hora: fila 1 estado · racha · Focus; fila 2 Alarma/Aviso; fila 3 Categoría. Si falta alguna sale un `Ghost` tenue («+ Focus», «+ Alarma», «+ Categoría»): Focus se activa al tocar; Alarma y Categoría abren `PickMenu` (BodyPortal, sus toques no abren el panel). Se aplica a todos los días de la acción (`patchAction`, igual que el panel).
- (2026-11-05) Tarjeta con lugares fijos: fila 1 Racha · Focus · Estado (el estado al final y en una sola línea, trunca si no cabe), fila 2 Alarma/Aviso, fila 3 Categoría; todos los botoncitos miden `h-6` y la racha tiene ancho mínimo, así Focus/Alarma/Categoría quedan en el mismo sitio lleno o vacío. Solo se mueven si se ocultan en Mostrar.
- (2026-11-05) «Pasar a borrador» y «Borrar este horario» pasaron al encabezado, a la vista junto a Nuevo horario (un menú ⋯ no le sirvió a Emanuel: no los veía); abajo quedaban lejos porque el Tablero mide lo que mide el día más largo.
- (2026-11-05) Tablero alineado por hora: dentro de cada franja hay una grilla propia con una fila por hora de inicio (`slots`); la misma actividad queda a la misma altura todos los días y donde un día no tiene nada queda el degradado vacío (hueco suave). El fondo de cada día llega hasta su + (justo después de su última actividad). Se quitó el texto «N min libres» (descuadraba las filas).
