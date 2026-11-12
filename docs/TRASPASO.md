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
- **Horario 2026-11-10**: antes del inicio del día («Comenzar desde», ej. 02:30 con Levantarse 09:00) `nowRel` es negativo → lo de hoy sale Pendiente, nunca Atrasada. `SkyDecor` pone `<html data-sky="manana|tarde|noche|madrugada">` y `app/appearance.css` cambia las luces `--amb-*` de noche (violeta) y madrugada (azul noche). En el Tablero el evento del calendario es una línea y los choques de una tarjeta van en un solo aviso (`issues`, detalle en `data-help`) para no estirar la fila alineada por hora.
- **Avisos 2026-11-10**: `sounds.ts` toca los tonos a 0.8 (cuadrada/sierra 0.35) + octava suave, por un limitador (`out()`), y despierta el AudioContext si está suspendido. `notify.ts`: `askNotifications()` (solo dentro de un clic: menú Aviso/Alarma, SoundList, Publicar) y `notify()` con `registration.showNotification` (tag = título, igual que el push del servidor). SoundList muestra «🔔 Activar notificaciones del navegador» o cómo desbloquearlas.
- **Focus 2026-11-10**: `FocusTimer` exporta `openFocus` (el abierto ahora) y escucha `organiza:focus-switch`; `AutoFocus` ya no se salta la revisión con un focus abierto: a la hora de otra acción lo cambia (si la nueva se abre sola, o si el abierto era de los que se abren solos). Reloj `mmss` con horas (6:59:42).
- **Música del focus 2026-11-11 (turno de noche)**: `YouTubeList` tiene un vigilante en su reloj: la que suena pausada sin pedirlo → `playVideo` a los 1,5 s; pegada en BUFFERING 5 s → `seekTo` al mismo segundo; a la 3ª vez se recarga ahí mismo. La siguiente se precarga 30 s antes (6 s en silencio para el búfer); al terminar el fade la vieja se calla y pausa, y se destruye 2 s después. Los eventos de un reproductor ya reemplazado se ignoran (`player !== e.target`).
- **Abrirse solo 2026-11-11 (turno de noche)**: `AutoFocus` se pone al día: vale mientras la acción siga en su horario (inicio … inicio + `minutes`, mínimo 3 min) y manda la que empezó más tarde; revisa al volver a la pestaña (`visibilitychange`/`focus`/`pageshow`). Una vez por día y acción en `localStorage` (`organiza-autofocus:<ref>:<día>`). Si la pestaña no está a la vista o no hubo un toque (autoplay), dispara `notify(..., alarm)`. El aviso de música bloqueada es un botón grande «▶ Tocar para sonar».
- **Volumen por focus 2026-11-11 (turno de noche)**: `Module.volume` (0–100, por defecto 100) en el módulo de música, sin migración. `FocusSetup` tiene el control + ▶ probar (`previewVolume`, 6 s ocultos); `YouTubeList` recibe `volume` y lo usa como tope en todo (inicio, crossfade, saltos, vigilante). El botón Configurar del panel muestra «🔊 25%» si es menor a 100.
- **Sonidos propios 2026-11-11 (rama `noche/sonidos-subir-propios`, SQL 35 SIN ejecutar)**: `organiza_custom_sounds` + bucket privado `organiza-sounds` (`<uid>/<id>.<ext>`, 5 MB, solo audio). `customSounds.ts` sube (valida peso y largo: notificación 15 s, alarma 120 s), renombra, borra y registra en `sounds.ts` (`setCustomSounds`, id `u:<uuid>`, links firmados 1 día, se decodifican al cargar). Suenan por el mismo limitador; si el archivo no carga, suena el de fábrica. Configuración → **Sonidos** (`SoundList manage` dentro de `UserCenter`: si `update:template` lo pisa, reponerlo). `Reminders` los carga al abrir.
- **Mi lista de sonidos 2026-11-11 (rama `noche/sonidos-elegir-ranking`, encima de la de sonidos propios; SQL 36 SIN ejecutar)**: `soundLibrary.ts` + `organiza_sound_library` (una fila por persona: `hidden` text[], `uses` jsonb). `SoundList` usa `arrange()` (sin eliminados, más usados primero, empates en el orden de siempre); ✕ con confirmación «¿Seguro que quieres eliminar este sonido?»; «Restaurar eliminados (N)». Suma uso al elegir y cuando `Reminders` toca un aviso/alarma. Copia local en `organiza-sound-library`; lo que cambia antes de que llegue la lista de la cuenta se suma, y nunca se escribe antes de leerla. Pendiente: copiarlo a la plantilla cuando otra app tenga sonidos.

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
## IA potente en vivo (2026-11-04, rama organiza-ia-en-vivo)
- Botón ✨ IA en Horario y Calendario → `components/organiza/AIPanel.tsx` (panel al lado; manda `screen` con fecha/hora local y horario abierto).
- Nube `tools/organiza.ts`: `horario_crear_tareas`, `horario_editar_tareas`, `horario_borrar_tareas`, `dia_reacomodar`, `horarios_gestionar`, `get_calendario`, `calendario_guardar_evento`, `calendario_borrar_evento`. No escriben: dejan `metadata.actions`.
- `components/organiza/aiExecutor.ts` ejecuta las acciones con `useHorario`/`useCalendar` (en vivo); todo va en `h.batch` = un solo ↶. Borrar pide confirmación.

## Daily · Acciones múltiples (Emanuel, 2026-11-12)
Casilla al pasar el mouse por el nombre de la tarea (queda visible mientras haya algo marcado). Con una o más marcadas aparece `components/daily/BulkBar.tsx` abajo al centro: Estado · Traspasar a (aplicación/área) · Etiqueta · Ejecutor (reemplaza) · + Ejecutor (suma) · Entrega · Archivar/Desarchivar · Borrar (dos confirmaciones) · ✕ quita la selección. Todo pasa por `patchMany` en `DailyView.tsx` (siempre sobre la lista más fresca; quita el 🤖).

## Sonidos del equipo · Epidemic (Emanuel, 2026-11-12)
8 alarmas + 47 notificaciones que bajó Emanuel (Escritorio/MasterCloud/Organiza/Sonidos). NO están en el repo (es público y tienen licencia): bucket privado `organiza-sounds/equipo/<kind>/` + tabla `organiza_team_sounds` (SQL 37), lectura `can_team_sounds()` = miembros de Master Wolf + cuentas personales de los 3 socios (`organiza_team_sound_access`, SQL 38; solo sonidos, no los hace miembros). `customSounds.ts` → `registerTeam()` firma links por 1 día; `sounds.ts` → `setTeamSounds` (ids `e:<uuid>`, entre los propios y los de fábrica; solo el elegido se baja al tiro). En la lista llevan «🎧 Equipo»; se ocultan con ✕ como cualquiera. Nombres en español puestos por Claude (Logro 1, Correo nuevo 2…). Para agregar más: subir a `equipo/` + fila en la tabla (requiere llave de servicio o un botón de subida, pendiente).

## Horario · pintar acciones (Emanuel, 2026-11-12)
Clic derecho en una tarjeta del Tablero (o mantener 2 s en el celular) → `components/organiza/ColorMenu.tsx`: **Fondo** y **Borde**, 9 colores de un toque + cualquier color (RGB, `<input type=color>`) + «Sin color». Se guarda en `organiza_items.bg_color / border_color` (SQL 39) en todas las repeticiones de la acción (`patchAction`). El fondo es el color al 28 % encima del gris (`tintCss`), se ve en tema claro y oscuro; también en Galería y Lista. Para marcar lo que está claro / no claro / no se aclara hoy.

## Autofocus: solo deja de abrirse si TÚ lo cierras (Emanuel, 2026-11-12)
«No se activó el de la mañana» (Levantarse 09:00, «Abrirse solo»). Hueco: `AutoFocus.tsx` lo marcaba «abierto hoy» en localStorage al ABRIRSE; si la página se recargaba (actualización, Chrome) el focus desaparecía y no volvía. Ahora la marca `organiza-autofocus-closed:<acción>:<día>` se pone solo al cerrar / terminar / pasar a la siguiente acción; mientras está abierto, la pestaña que lo muestra deja un latido (`organiza-autofocus-open:…`, 40 s) para que otra pestaña no lo duplique. Sigue necesitando Organiza abierta y el equipo despierto: con el Mac dormido o Chrome cerrado no corre (lo cubre la app de Mac + la ⏰ alarma del sistema).

## 🌤️ Clima real + pestaña Tiempo (Emanuel, 2026-11-12)
- Datos: Open-Meteo (gratis, sin llave) en `utils/weather.ts`: actual, por hora y 10 días; caché 15 min (localStorage); códigos WMO → escena / emoji / texto; `hintFor` = aviso por hora (⛈️ tormenta, 🌂 lluvia ≥50 %, 🥵 ≥30°, 🧴 UV ≥7 de día, 🧥 ≤8°).
- `components/organiza/useWeather.ts`: una sola carga compartida. Ubicación: GPS (permiso una vez) o ciudad de respaldo (por defecto Santiago); ciudades guardadas y respaldo en `organiza_prefs.weather` (SQL 40). Se refresca cada 15 min.
- Horario: el cielo (`SkyDecor`) dibuja encima el clima de ahora (sol fuerte con calor, nubes, lluvia, nieve, rayo, niebla); pastilla «☀️ 31° Santiago» junto al nombre → `#tiempo`; cada tarjeta del Tablero lleva su aviso del clima a su hora.
- Sección **Tiempo** (`TiempoView.tsx`): estructura de la app Tiempo de Apple con el diseño de Organiza — ciudad, temperatura gigante, estado, máx/mín, sensación; por hora (24 h); 10 días con barra de rango; «Hoy en tu horario» (avisos para lo que queda del día); salida/puesta del sol; varias ciudades (+ Ciudad, ✕), ciudad de respaldo y «Usar mi ubicación».

## 😴 Dormir: registro del sueño (Daily dormir-detectado, 2026-11-12)
`components/organiza/SleepLog.tsx`. Todo queda en la tarea **Dormir** (`SLEEP_REF`), aunque se anote desde Levantarse o el focus (antes cada tarea guardaba lo suyo; las noches viejas se siguen leyendo). Por noche (día en que despiertas, en `organiza_checks.value`): acostarse / despertar (horas calculadas; «me desperté» se adivina con la hora en que marcaste Levantarse), ⭐ calidad 1-5, horas bien dormidas, 🌙 despertares (horas), 💭 sueño. Resumen: barras de 14 noches (verde = meta cumplida), promedio vs meta y calidad, 📔 diario de sueños. `setSleep` le pone el módulo a Dormir; los Dormir viejos lo muestran igual. En el focus de **Levantarse** sale «😴 ¿Cómo dormiste? · 1 minuto».

## 🎨 Pintar en la Daily + borde por categoría en el Horario (2026-11-12)
- Daily: clic derecho en el nombre → **Pintar** (o mantener 2 s en el celular) → `ColorMenu`: fondo (al 25 %) y borde (barra de 4 px a la izquierda). Se guarda en la tarea (`DailyTask.color / border`). `DataTable` tiene ahora `rowStyle` opcional.
- Horario → Mostrar → **🎨 Borde por categoría**: cada acción toma el color de su categoría como borde, si no tiene uno propio.
