/**
 * 📖 Cómo trabajamos (Emanuel, 2026-10-31): the team's manual under the Daily, a copy of his Notion
 * "Paso a Paso Claude": Horarios Claude (a table) + Detalles de Tareas (Tablero / Tabla). Saved in
 * table_views 'como-trabajamos'; this is only its starting content. `html` keeps the column words as
 * <b data-col="…">, so changing a column's color changes them too. Claude reads it (see CLAUDE.md).
 */
export const HOW_KEY = 'como-trabajamos';

export type HowCard = { id: string; title: string; html: string };
export type HowColumn = { id: string; title: string; color: string; cards: HowCard[] };
export type HowRow = { id: string; name: string; hour: string; implies: string; goal: string; people: string[] };
export type HowDoc = { page: string; heading: string; scheduleTitle: string; detailsTitle: string; schedule: HowRow[]; columns: HowColumn[] };

/** Notion's colors, offered first in the color menu. */
export const HOW_COLORS = ['#7d7a75', '#9a6b4b', '#d27b2d', '#cb9434', '#50946e', '#387dc9', '#9a6bb4', '#c14c8a', '#c4554d'];

const col = (id: string, text: string) => `<b data-col="${id}">${text}</b>`;
const J = (t = 'Juntos') => col('juntos', t);
const W = (t = 'Claude Work') => col('work', t);
const P = (t = 'Faltan Permisos') => col('permisos', t);
const R = (t = 'En Revisión') => col('revision', t);
const C = (t = 'Completo') => col('completo', t);
const G = (t: string) => `<i data-col="muted">${t}</i>`;
const CL = W('Claude');

const cards = (prefix: string, list: [string, string][]): HowCard[] =>
  list.map(([title, html], i) => ({ id: `${prefix}-${i}`, title, html: html.trim().replace(/\n/g, '<br>') }));

export const HOW_DEFAULT: HowDoc = {
  page: 'Paso a Paso Claude',
  heading: '📖 Cómo trabajamos',
  scheduleTitle: 'Horarios Claude',
  detailsTitle: 'Detalles de Tareas',
  schedule: [
    { id: 'permisos', name: 'Aprobación de Permisos', hour: '', implies: `Dar los permisos que ${CL} no puede hacer por si solo.`, goal: `Que se pase de ${P()} &gt; ${W()}<br>o ${R()} ${G('(si la tarea está ok y solo faltaba un permiso)')}`, people: ['Moisés Montano'] },
    { id: 'revision', name: 'Revisión y de Tareas', hour: '', implies: `Revisar todo lo que ${CL} terminó.`, goal: `Toda Tarea que se inicia a revisar, debe culminar.<br>${G(`(Ej: Inicio a <b>revisar una tarea,</b> y debo hacer las correcciones necesarias para que pase de `)}${R()} ${G('&gt;')} ${C('Completada')}`, people: ['Emanuel Miranda', 'Moisés Montano'] },
    { id: 'pendientes', name: 'Pendientes y Creación de Tareas', hour: '', implies: 'Iniciar con un pendiente', goal: `Culminar Pendientes de ${J('Juntos🤝')} &gt; ${W()}`, people: ['Emanuel Miranda'] },
    { id: 'claude', name: 'Claude trabaja', hour: '1:30', implies: `${CL} trabaja en todo lo que fue previamente aprobado.`, goal: `Pasar de ${W()} a ${P()} o ${R('En Revisión.')}`, people: ['Claude'] },
  ],
  columns: [
    {
      id: 'juntos',
      title: 'Juntos 🤝',
      color: '#9a6bb4',
      cards: cards('juntos', [
        ['💡 Concepto', `Espacio de creación, desarrollo y perfilación de ideas entre <b>Emanuel, Moisés</b> y ${CL}.`],
        ['👤 Quién Ejecuta', 'Emanuel Miranda. Claude participa como asistente en la construcción y desarrollo de ideas.'],
        ['⚙️ Etapa de trabajo', `Existen tres Etapas:

<b>1. Crear ideas:</b> registrar propuestas para desarrollarlas posteriormente.

2. <b>Desarrollar ideas:</b> tomar tareas existentes y definir su contexto, requerimientos, referencias y funcionamiento.

3. <b>Perfilar Idea:</b>
  • ${CL} confirma dicho ajuste.
  • Afila detalles.
  • Sugiere (si es necesario).
  • Compila todo.
  • Menciona el gasto de Tokens y el tiempo estimado.
  • Pide confirmación para envía a ${W()}.
  • Enviado`],
        ['👮🏻 Reglas', `Claude debe ayudar a desarrollar las ideas mediante preguntas, aclaraciones y sugerencias.

Si una idea ya está desarrollada, Claude debe confirmar que comprende lo solicitado antes de ejecutarla.

Toda idea desarrollada debe quedar documentada en las Notas de su tarea.

La documentación debe contener el contexto necesario para que Claude pueda trabajar sin depender del historial de conversación.

Si el usuario termina las <b>3 fases</b> y requiere construirlo ya es válido. Pero debe ser puesto en la Casilla ${W()} de igual manera.`],
      ]),
    },
    {
      id: 'work',
      title: 'Claude Work',
      color: '#d27b2d',
      cards: cards('work', [
        ['💡 Concepto', 'Espacio donde Claude ejecuta autónomamente las tareas previamente desarrolladas y aprobadas.'],
        ['👤 Quién Ejecuta', `Puntualmente aquí la Ejecución la hace ${W('Claude.')}`],
        ['⚙️ Modalidad de trabajo', `<b>Programado:</b>
${CL} trabaja automáticamente a la 1:30 AM, tomando las tareas disponibles y ejecutándolas de manera secuencial, según los créditos y recursos disponibles.

Instantáneo:
Ni bien estaba en la casilla ${J('Juntos,')} pasa a ${W()} por petición mencionada por el usuario.
Una vez se termina, se envía a ${R('Revisión')} o ${P('Permisos')}`],
        ['👮🏻 Reglas', `Leer obligatoriamente las Notas de cada tarea antes de ejecutarla.

Respetar el contexto, los requerimientos y las instrucciones establecidas.

No modificar funcionalidades ajenas al alcance solicitado sin autorización.

No inventar decisiones importantes que correspondan a Emanuel o Moisés.

Si necesita una aclaración o intervención humana, debe documentar lo que necesita.

Si una tarea queda bloqueada, debe apartarla y continuar con las siguientes tareas disponibles hasta culminar o que los créditos diarios acaben.

No considerar una tarea aprobada simplemente por haber terminado su ejecución.`],
        ['▶️ Criterio de salida', `Cada tarea ejecutada debe pasar a uno de estos estados:

• ${R('En Revisión:')} cuando Claude considera que terminó satisfactoriamente la ejecución.
• ${P('Faltan Permisos:')} cuando necesita una intervención humana para continuar.`],
        ['Requisitos', '  1. El computador tiene que quedar <b>prendido con la app de Claude.</b>'],
      ]),
    },
    {
      id: 'permisos',
      title: 'Faltan Permisos',
      color: '#cb9434',
      cards: cards('permisos', [
        ['💡 Concepto', 'Espacio destinado a las tareas que necesitan intervención humana para continuar su ejecución.'],
        ['👤 Quién Ejecuta', 'Moisés es el responsable principal de gestionar estos permisos.'],
        ['🧩 Tipos de intervenciones', `Autorizaciones y credenciales.
Conexiones de API.
Permisos de acceso.
Instalaciones y configuraciones.
Decisiones o acciones que requieren intervención humana.`],
        ['👮🏻 Reglas', `Claude debe indicar claramente qué necesita y por qué.

Debe documentar los pasos necesarios para resolver el bloqueo.

No debe detener la ejecución de otras tareas disponibles por un bloqueo individual.

Una vez concedido el permiso, debe determinarse si todavía necesita ejecutar acciones (ahí movería a ${W()} de nuevo) o si la tarea está lista para mover a ${R('Revisión.')}`],
        ['▶️ Criterio de salida', `${W('Claude Work:')} cuando Claude necesita continuar ejecutando la tarea.

${R('En Revisión:')} cuando la tarea ya está ejecutada y solamente necesita validación.`],
      ]),
    },
    {
      id: 'revision',
      title: 'En Revisión',
      color: '#387dc9',
      cards: cards('revision', [
        ['💡 Concepto', 'Espacio destinado a validar los resultados de las tareas ejecutadas por Claude y comprobar que cumplen con lo solicitado.'],
        ['👤 Quién Ejecuta', 'La revisión puede realizarla <b>Emanuel o Moisés</b>, según la asignación de la tarea.'],
        ['🔍 Tipo de Revisión', `Funcionamiento y comportamiento.
Diseño y experiencia de usuario.
Cumplimiento de requerimientos.
Detección de errores e inconsistencias.
Correcciones y mejoras necesarias.`],
        ['👮🏻 Reglas', `Revisar las Notas originales para comprender lo solicitado.

Comprobar que el resultado corresponde a los requerimientos establecidos.

No aprobar tareas que presenten errores o funcionalidades incompletas.

Moisés puede realizar revisiones de manera autónoma cuando tenga el contexto y los criterios necesarios.

Emanuel conserva la responsabilidad de las decisiones finales de producto y aprobación cuando corresponda.`],
        ['▶️ Criterio de salida', `${C('Completo:')} cuando el resultado es satisfactorio y está aprobado.
${W('Claude Work:')} cuando necesita nuevas modificaciones o correcciones de Claude.
${P('Faltan Permisos:')} cuando requiere una nueva intervención humana.`],
        ['', '<b>IMPORTANTE:</b> Que Claude termine una tarea no significa que esté aprobada. La validación es una etapa independiente de la ejecución.'],
      ]),
    },
    {
      id: 'completo',
      title: 'Completo',
      color: '#50946e',
      cards: cards('completo', [
        ['💡 Concepto', 'Espacio destinado a las tareas que han sido ejecutadas, revisadas y aprobadas satisfactoriamente.'],
        ['👤 Quién Ejecuta', 'El responsable de revisión confirma la aprobación y finalización de la tarea.'],
        ['👮🏻 Reglas', `Una tarea solamente puede llegar aquí cuando cumple los requerimientos establecidos.

Su resultado debe haber sido revisado y aprobado.

No deben quedar correcciones o acciones pendientes.

Las tareas completadas deben conservarse como registro histórico del trabajo realizado.`],
        ['🏁 Criterio de salida', 'Esta es la etapa final del flujo. Las tareas permanecen archivadas como trabajos finalizados.'],
      ]),
    },
  ],
};
