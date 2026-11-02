import type React from 'react';

/**
 * Horario de Organiza: horarios en borrador o publicados, sus tareas, y lo que
 * se cumplió cada día. Un horario publicado se vuelve eventos semanales en
 * `calendar_events` (source = 'horario'), así Hoy, Calendario y las conexiones
 * leen una sola cosa. Datos: docs/sql/27-organiza-horario.sql.
 */
export type Space = 'persona' | 'empresa';
export type AlarmKind = 'no' | 'notificacion' | 'alarma';
export type ModuleType = 'habitos' | 'sueno' | 'tabla' | 'base';

export type Module = {
  id: string;
  type: ModuleType;
  title: string;
  habits?: string[];
  columns?: string[];
  rows?: string[][];
  databaseId?: string;
};

export type Label = { id: string; owner_id?: string; space: Space; name: string; color: string; icon: string };
export type Schedule = {
  id: string;
  space: Space;
  name: string;
  cover_url: string | null;
  status: 'borrador' | 'publicado';
  alarms: 'todas' | 'elegidas' | 'ninguna';
  published_at: string | null;
  updated_at: string;
};
export type Item = {
  id: string;
  schedule_id: string;
  weekday: number;
  time: string;
  minutes: number;
  title: string;
  icon: string;
  cover_url: string | null;
  stage: string;
  progress: number;
  label_id: string | null;
  description: string;
  alarm: AlarmKind;
  alarm_before: number;
  focus: boolean;
  modules: Module[];
  sort: number;
};
export type Check = { id?: string; ref: string; title: string; day: string; done: boolean; done_at?: string; value: { habits?: string[]; bed?: string; wake?: string } };
export type DayClose = { day: string; space: Space; done: number; total: number; note: string; closed_at: string };

export const WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const BYDAY_OF = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const byTime = (a: Item, b: Item) => toMinutes(a.time) - toMinutes(b.time) || a.sort - b.sort;

export const STAGES = [
  { id: 'sin_empezar', label: 'Sin empezar', color: '#a1a1aa' },
  { id: 'apuntes', label: 'Apuntes', color: '#fbbf24' },
  { id: 'en_curso', label: 'En curso', color: '#38bdf8' },
  { id: 'revision', label: 'Revisión', color: '#a78bfa' },
  { id: 'listo', label: 'Listo', color: '#34d399' },
];
export const stageOf = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0];
export const LABEL_COLORS = ['#38bdf8', '#60a5fa', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#fbbf24', '#34d399', '#94a3b8'];

/** Una actividad se sigue por su nombre: "Levantarse" del lunes y del martes es el mismo récord. */
export const refOf = (title: string) =>
  `h:${title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-')}`;

/** Días seguidos cumplidos, contando solo los días en que la actividad tocaba. */
export function streakOf(ref: string, weekdays: number[], checks: Check[], today = new Date()) {
  const byDay = new Map(checks.filter((c) => c.ref === ref).map((c) => [c.day, c]));
  let streak = 0;
  for (let i = 0, seen = 0; i < 400 && seen < 200; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (!weekdays.includes(weekdayOf(d))) continue;
    seen++;
    const c = byDay.get(iso(d));
    if (!c && i === 0) continue; // hoy todavía se puede marcar
    if (!c?.done) break;
    streak++;
  }
  return streak;
}

/* ── Portadas ───────────────────────────────────────────────────────── */

export const COVERS = [
  { id: 'grad:amanecer', label: 'Amanecer', css: 'linear-gradient(120deg,#f97316,#ec4899 60%,#7c3aed)', rank: 0 },
  { id: 'grad:mar', label: 'Mar', css: 'linear-gradient(120deg,#0ea5e9,#2563eb 60%,#1e1b4b)', rank: 0 },
  { id: 'grad:bosque', label: 'Bosque', css: 'linear-gradient(120deg,#34d399,#059669 60%,#064e3b)', rank: 0 },
  { id: 'grad:noche', label: 'Noche', css: 'linear-gradient(120deg,#1e1b4b,#4c1d95 60%,#0f172a)', rank: 0 },
  { id: 'grad:arena', label: 'Arena', css: 'linear-gradient(120deg,#fde68a,#f59e0b 60%,#b45309)', rank: 1 },
  { id: 'grad:rosa', label: 'Rosa', css: 'linear-gradient(120deg,#fbcfe8,#f472b6 60%,#be185d)', rank: 1 },
  { id: 'grad:hielo', label: 'Hielo', css: 'linear-gradient(120deg,#e0f2fe,#7dd3fc 60%,#0284c7)', rank: 2 },
  { id: 'grad:fuego', label: 'Fuego', css: 'linear-gradient(120deg,#fef08a,#f97316 50%,#b91c1c)', rank: 3 },
  { id: 'grad:aurora', label: 'Aurora', css: 'linear-gradient(120deg,#22d3ee,#a78bfa 50%,#34d399)', rank: 4 },
  { id: 'grad:oro', label: 'Oro', css: 'linear-gradient(120deg,#422006,#ca8a04 50%,#fde047)', rank: 5 },
];
export const coverCss = (c: string | null | undefined): React.CSSProperties | undefined => {
  if (!c) return undefined;
  const g = COVERS.find((x) => x.id === c);
  return g ? { background: g.css } : { backgroundImage: `url("${c}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
};

/* ── El mundo de cada tarea ─────────────────────────────────────────── */

const mid = () => Math.random().toString(36).slice(2, 9);
export const MODULE_CHOICES: { key: string; emoji: string; label: string; hint: string; make: () => Module }[] = [
  { key: 'habitos', emoji: '✅', label: 'Microhábitos', hint: 'Una lista corta que marcas cada día', make: () => ({ id: mid(), type: 'habitos', title: 'Microhábitos', habits: ['Tender la cama', 'Tomar agua'] }) },
  { key: 'sueno', emoji: '😴', label: 'Sueño', hint: 'A qué hora te acostaste y te levantaste', make: () => ({ id: mid(), type: 'sueno', title: 'Mi sueño' }) },
  { key: 'entreno', emoji: '🏋️', label: 'Plan de entrenamiento', hint: 'Día, ejercicio, series y repeticiones', make: () => ({ id: mid(), type: 'tabla', title: 'Plan de entrenamiento', columns: ['Día', 'Ejercicio', 'Series', 'Reps', 'Peso'], rows: [['Lunes', '', '', '', '']] }) },
  { key: 'comidas', emoji: '🍳', label: 'Plan de comidas', hint: 'Qué comes cada día de la semana', make: () => ({ id: mid(), type: 'tabla', title: 'Plan de comidas', columns: ['Día', 'Desayuno', 'Almuerzo', 'Cena'], rows: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => [d, '', '', '']) }) },
  { key: 'tabla', emoji: '🧾', label: 'Tabla libre', hint: 'Una tabla con las columnas que quieras', make: () => ({ id: mid(), type: 'tabla', title: 'Tabla', columns: ['Nombre', 'Detalle'], rows: [['', '']] }) },
  { key: 'base', emoji: '🗃️', label: 'Base de datos', hint: 'Una base dentro de esta tarea, como en Notion', make: () => ({ id: mid(), type: 'base', title: 'Base de datos' }) },
];
/** Lo que trae una tarea según su nombre; después se cambia libremente. */
export function modulesFor(title: string): Module[] {
  const t = title.toLowerCase();
  const pick = (k: string) => MODULE_CHOICES.find((m) => m.key === k)!.make();
  if (/levantar|acostar|dormir/.test(t)) return [pick('sueno'), { ...pick('habitos'), habits: ['Tender la cama', 'Ordenar la pieza', 'Tomar agua'] }];
  if (/gym|entren/.test(t)) return [pick('entreno')];
  if (/cocin|desayuno|almuerzo|cena/.test(t)) return [pick('comidas')];
  return [];
}

/* ── Plantillas ─────────────────────────────────────────────────────── */

type Seed = { d: number; t: string; title: string; icon: string; label: string; min?: number };
export const EMANUEL_LABELS: { name: string; color: string; icon: string }[] = [
  { name: 'Zúbale AM', color: '#60a5fa', icon: '🅉' },
  { name: 'Zúbale PM', color: '#60a5fa', icon: '🅉' },
  { name: 'Zúbale XL+', color: '#818cf8', icon: '🅉' },
  { name: 'Free', color: '#fbbf24', icon: '😌' },
];
const am = (d: number, label: string, salir: string, alistar = '6:30'): Seed[] => [
  { d, t: '6:00', title: 'Levantarse', icon: '🌅', label, min: 10 },
  { d, t: '6:10', title: 'Cocinar + Desayuno', icon: '🍳', label },
  { d, t: alistar, title: 'Alistarme', icon: '👕', label, min: 15 },
  { d, t: salir, title: 'Salir', icon: '🚗', label, min: 15 },
];
/** Copiado de la foto de su Notion; lo que no se alcanza a ver llega con la importación. */
const EMANUEL: Seed[] = [
  { d: 0, t: '10:30', title: 'Levantarse', icon: '🌅', label: 'Zúbale PM', min: 10 },
  { d: 0, t: '10:40', title: 'Visualizar', icon: '🧠', label: 'Zúbale PM', min: 10 },
  { d: 0, t: '10:50', title: 'GYM', icon: '🏋️', label: 'Zúbale PM', min: 60 },
  { d: 0, t: '12:00', title: 'Cocinar', icon: '👨‍🍳', label: 'Zúbale PM', min: 45 },
  ...am(1, 'Zúbale XL+', '7:00', '6:45'),
  { d: 2, t: '10:30', title: 'Levantarse', icon: '🌅', label: 'Free', min: 10 },
  { d: 2, t: '10:40', title: 'Visualizar', icon: '🧠', label: 'Free', min: 10 },
  { d: 2, t: '10:50', title: 'GYM - full', icon: '🏋️', label: 'Free', min: 90 },
  { d: 2, t: '12:30', title: 'Take a Shower', icon: '🚿', label: 'Free', min: 20 },
  ...am(3, 'Zúbale AM', '7:00'),
  ...am(4, 'Zúbale AM', '7:00'),
];
const padTime = (t: string) => t.padStart(5, '0');
export const TEMPLATES = [
  { id: 'emanuel', name: 'Plantilla Emanuel', emoji: '🐺', hint: 'El horario semanal de Emanuel, listo para usar', cover: 'grad:amanecer', labels: EMANUEL_LABELS, seeds: EMANUEL },
  { id: 'blanco', name: 'En blanco', emoji: '📄', hint: 'Lunes a domingo, sin tareas', cover: null, labels: [], seeds: [] as Seed[] },
].map((x) => ({ ...x, items: x.seeds.map((s, i) => ({ weekday: s.d, time: padTime(s.t), title: s.title, icon: s.icon, label: s.label, minutes: s.min ?? 30, sort: i })) }));

/* ── Ruta de XP ─────────────────────────────────────────────────────── */

export const XP = { check: 10, close: 25, perfect: 25 };
export const RANKS = [
  { name: 'Cachorro', min: 0, reward: 'Tus primeras 4 portadas' },
  { name: 'Explorador', min: 150, reward: 'Portadas Arena y Rosa' },
  { name: 'Constante', min: 500, reward: 'Portada Hielo' },
  { name: 'Disciplinado', min: 1200, reward: 'Portada Fuego' },
  { name: 'Estratega', min: 2500, reward: 'Portada Aurora' },
  { name: 'Alfa', min: 5000, reward: 'Portada Oro' },
  { name: 'Master Wolf', min: 10000, reward: 'El rango más alto de Organiza' },
];
export function xpOf(checks: Check[], days: DayClose[]) {
  const done = checks.filter((c) => c.done).length;
  const perfect = days.filter((d) => d.total > 0 && d.done === d.total).length;
  return done * XP.check + days.length * XP.close + perfect * XP.perfect;
}
export const rankOf = (xp: number) => {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].min) i++;
  return i;
};
