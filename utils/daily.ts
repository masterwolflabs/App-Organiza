/**
 * Daily (Emanuel, 2026-10-27): the team's to-do list in the Mente Maestra, in the format of his
 * Notion "Daily - Pendientes": Nombre · Ejecutor · Prioridad (time left, computed) · Estado ·
 * Aplicación (instead of Notion's Cliente) · Etiqueta (urgente / importante) · Empieza · Entrega ·
 * Descripción · Nota (a real note). Pure data + helpers; saved in table_views 'daily' {tasks}.
 * The first time it takes the old Pendientes board (table_views 'pendientes') so nothing is lost.
 */

export type DailyStatus = 'sin_empezar' | 'aprobada_claude' | 'en_curso' | 'esperando' | 'en_revision' | 'por_aprobar' | 'listo';
export type DailyTag = 'urgente_importante' | 'importante' | 'urgente' | 'ninguna';
export type DailyTask = {
  id: string;
  title: string;
  executors: string[];
  status: DailyStatus;
  app: string;
  tag: DailyTag;
  /** YYYY-MM-DD */
  start: string | null;
  /** YYYY-MM-DD — the task is due at the END of that day. */
  due: string | null;
  description: string;
  /** Old plain-text note (from the Pendientes board), carried into the real note when it's created. */
  oldNote?: string;
  order: number;
  /** Archived = out of every view ("Ver archivadas" brings them back). */
  archived?: boolean;
  /** Claude has everything and only waits for this permission (Tablero → "Faltan Permisos"). */
  permission?: string | null;
  /** Its page written by Claude from the terminal (scripts/daily.sh in Finance) — wins over utils/dailyPages. */
  page?: DailyPage;
  /** Who made the last change: 'Claude' when it came from the terminal (the row shows 🤖); cleared on a team edit. */
  by?: string | null;
  /** ISO time of that change. */
  byAt?: string | null;
};
/** A task's starting page (see utils/dailyPages): what it is, step by step, what's needed, how long. */
export type DailyPage = { goal: string; why?: string; steps: string[]; needs?: string; time?: string; done?: string };
export type DailyDoc = { tasks: DailyTask[]; people?: string[]; apps?: string[] };

export const STATUS_INFO: Record<DailyStatus, { label: string; cls: string }> = {
  sin_empezar: { label: 'Sin empezar', cls: 'bg-white/[0.08] text-zinc-300 ring-white/10' },
  aprobada_claude: { label: '✅ Aprobada para Claude', cls: 'bg-orange-500/15 text-orange-200 ring-orange-400/30' },
  en_curso: { label: 'En curso', cls: 'bg-sky-500/15 text-sky-200 ring-sky-400/30' },
  esperando: { label: '⏳ Esperando a Emanuel / Moisés', cls: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30' },
  en_revision: { label: 'En revisión', cls: 'bg-violet-500/15 text-violet-200 ring-violet-400/30' },
  por_aprobar: { label: 'Por aprobar', cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/30' },
  listo: { label: 'Listo', cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' },
};
export const TAG_INFO: Record<DailyTag, { label: string; cls: string; rank: number }> = {
  urgente_importante: { label: '🔥 Urgente e importante', cls: 'bg-rose-500/15 text-rose-200 ring-rose-400/30', rank: 0 },
  importante: { label: '⭐ Importante', cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/30', rank: 1 },
  urgente: { label: '⚡ Urgente', cls: 'bg-orange-500/15 text-orange-200 ring-orange-400/30', rank: 2 },
  ninguna: { label: 'Puede esperar', cls: 'bg-white/[0.06] text-zinc-400 ring-white/10', rank: 3 },
};
export const DEFAULT_PEOPLE = ['Emanuel Miranda', 'Moisés Montano', 'Claude'];
export const ECOSYSTEM = '🌐 Todo el ecosistema';
export const DEFAULT_APPS = [ECOSYSTEM, 'Finanzas', 'Nube', 'Plantilla', 'Project'];

/** "✨ En 2 d 2 h" · "😱 En 2 h 47 min" (less than a day) · "🔴 Atrasada · 10 h 13 min" · "✅ Lista". */
export function priorityOf(t: Pick<DailyTask, 'due' | 'status'>, now = Date.now()): { text: string; tone: 'ok' | 'soon' | 'late' | 'done' | 'none'; ms: number } {
  if (t.status === 'listo') return { text: '✅ Lista', tone: 'done', ms: Number.MAX_SAFE_INTEGER };
  if (!t.due) return { text: 'Sin fecha', tone: 'none', ms: Number.MAX_SAFE_INTEGER - 1 };
  const end = new Date(`${t.due}T23:59:59`).getTime();
  const diff = end - now;
  const span = (ms: number) => {
    const m = Math.floor(Math.abs(ms) / 60000);
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return d ? `${d} d ${h} h` : `${h} h ${m % 60} min`;
  };
  if (diff < 0) return { text: `🔴 Atrasada · ${span(diff)}`, tone: 'late', ms: diff };
  if (diff < 86400000) return { text: `😱 En ${span(diff)}`, tone: 'soon', ms: diff };
  return { text: `✨ En ${span(diff)}`, tone: 'ok', ms: diff };
}

/** La Daily con la que parte alguien nuevo en Organiza: suya para cambiarla entera. */
export function starterDaily(name: string, space: 'persona' | 'empresa'): DailyDoc {
  const today = todayISO();
  const apps = space === 'empresa' ? ['Administración', 'Ventas', 'Operaciones', 'Finanzas'] : ['Personal', 'Trabajo', 'Hogar', 'Salud'];
  const row = (order: number, title: string, description: string, tag: DailyTag): DailyTask => ({ id: `inicio-${order}`, title, executors: name ? [name] : [], status: 'sin_empezar', app: apps[0], tag, start: today, due: order === 1 ? today : null, description, order });
  return {
    apps,
    tasks: [
      row(1, 'Publicar mi primer horario', 'Ve a Horario, elige una plantilla y publícala.', 'urgente_importante'),
      row(2, 'Anotar lo que tengo pendiente', 'Cambia esta tarea por lo tuyo: esta tabla es tuya.', 'importante'),
      row(3, 'Cerrar el día con el checklist', 'Al final del día repasa qué hiciste y qué no.', 'ninguna'),
    ],
  };
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
/** "27 oct 2026" — the format the table reads as a date column (calendar / cronograma). */
export const showDate = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
export const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Tablero (Emanuel, 2026-10-28): who does each task, in 4 columns. The column is DERIVED from the
 * executors (+ `permission`), so the table and the board can never disagree; dragging a card just
 * changes the executors.
 */
export type DailyLane = 'juntos' | 'humanos' | 'claude' | 'permiso' | 'revision' | 'listo';
export const LANES: { id: DailyLane; title: string; hint: string; dot: string; col: string; head: string }[] = [
  { id: 'juntos', title: '🤝 Juntos', hint: 'Emanuel o Moisés con Claude', dot: 'bg-violet-400', col: 'bg-violet-500/[0.06] ring-violet-400/15', head: 'bg-violet-500/15 text-violet-200' },
  { id: 'humanos', title: '🙋 Emanuel / Moisés', hint: 'Solo personas del equipo', dot: 'bg-sky-400', col: 'bg-sky-500/[0.06] ring-sky-400/15', head: 'bg-sky-500/15 text-sky-200' },
  { id: 'claude', title: '🤖 Claude Work', hint: 'Claude la hace solo', dot: 'bg-orange-400', col: 'bg-orange-500/[0.06] ring-orange-400/15', head: 'bg-orange-500/15 text-orange-200' },
  { id: 'permiso', title: '🔑 Faltan Permisos', hint: 'Claude ya casi termina: solo espera tu OK', dot: 'bg-amber-400', col: 'bg-amber-500/[0.07] ring-amber-400/20', head: 'bg-amber-500/15 text-amber-200' },
  { id: 'revision', title: '🔍 En Revisión', hint: 'Claude dice que la terminó: te toca revisarla (si está bien, pásala a Completo)', dot: 'bg-fuchsia-400', col: 'bg-fuchsia-500/[0.06] ring-fuchsia-400/15', head: 'bg-fuchsia-500/15 text-fuchsia-200' },
  { id: 'listo', title: '✅ Completo', hint: 'Terminadas y aprobadas: todo ok', dot: 'bg-emerald-400', col: 'bg-emerald-500/[0.06] ring-emerald-400/15', head: 'bg-emerald-500/15 text-emerald-200' },
];
export const isClaude = (name: string) => name.trim().toLowerCase() === 'claude';

export function laneOf(t: Pick<DailyTask, 'executors' | 'permission'> & { status?: DailyStatus }): DailyLane {
  if (t.status === 'listo') return 'listo';
  // Done but not yet approved by Emanuel / Moisés (Emanuel, 2026-10-29).
  if (t.status === 'en_revision' || t.status === 'por_aprobar') return 'revision';
  const claude = t.executors.some(isClaude);
  if (claude && t.permission?.trim()) return 'permiso';
  if (!claude) return 'humanos';
  return t.executors.some((p) => !isClaude(p)) ? 'juntos' : 'claude';
}

/** What a task gets when it's dropped in a column: "✅ Completo" / "🔍 En Revisión" only change its status (who did it stays); out of them = "En curso" again. */
export function moveToLane(t: Pick<DailyTask, 'executors'> & { status?: DailyStatus }, lane: DailyLane, me = 'Emanuel Miranda'): { executors?: string[]; permission?: string | null; status?: DailyStatus } {
  if (lane === 'listo') return { status: 'listo' };
  if (lane === 'revision') return { status: 'en_revision' };
  const back = t.status === 'listo' || t.status === 'en_revision' || t.status === 'por_aprobar';
  return { ...(back ? { status: 'en_curso' as const } : {}), ...whoFor(t, lane, me) };
}
/** The executors (and permission) of each "who does it" column. */
function whoFor(t: Pick<DailyTask, 'executors'>, lane: DailyLane, me: string): { executors: string[]; permission: string | null } {
  const humans = t.executors.filter((p) => !isClaude(p));
  if (lane === 'humanos') return { executors: humans.length ? humans : [me], permission: null };
  if (lane === 'juntos') return { executors: [...(humans.length ? humans : [me]), 'Claude'], permission: null };
  return { executors: ['Claude'], permission: null };
}
