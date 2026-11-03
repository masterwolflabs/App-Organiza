import { byTime, daysOf, toMinutes, weekdayOf, type Check, type Item, type Schedule } from '@/components/organiza/model';

/**
 * El plan de un día: qué horario usa y qué cambió solo ese día. La plantilla nunca se toca:
 * lo que se mueve o se cancela queda en `organiza_day_plans` (docs/sql/29).
 */
export type Extra = { id: string; title: string; time: string; minutes: number };
export type DayPlan = { day: string; schedule_id: string | null; moves: Record<string, { time?: string; off?: boolean }>; extras: Extra[] };
export type Gap = { from: string; to: string; minutes: number };
export type Proposal = { moved: { item: Item; to: string }[]; off: Item[]; blocked: Item[] };

const pad = (n: number) => String(n).padStart(2, '0');
export const toTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const endOf = (i: Pick<Item, 'time' | 'minutes'>) => toMinutes(i.time) + i.minutes;
const MIN_GAP = 15;
const DAY_FROM = 6 * 60;
const DAY_TO = 24 * 60;

/** El horario de ese día: el elegido solo para hoy, o el que la semana le asigna. */
export const scheduleFor = (date: Date, schedules: Schedule[], plan?: DayPlan | null) =>
  schedules.find((s) => s.id === plan?.schedule_id) ?? schedules.find((s) => s.status === 'publicado' && daysOf(s).includes(weekdayOf(date))) ?? null;

export function dayItems(date: Date, schedules: Schedule[], items: Item[], plan?: DayPlan | null): Item[] {
  const s = scheduleFor(date, schedules, plan);
  const d = weekdayOf(date);
  const own = !s ? [] : items.filter((i) => i.schedule_id === s.id && i.weekday === d && !plan?.moves?.[i.id]?.off).map((i) => ({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }));
  const extras = (plan?.extras ?? []).map((x, sort): Item => ({ id: x.id, schedule_id: s?.id ?? '', weekday: d, time: x.time, minutes: x.minutes, title: x.title, icon: '⚡', cover_url: null, stage: 'sin_empezar', progress: 0, label_id: null, description: '', alarm: 'no', alarm_before: 0, focus: false, modules: [], sort, flex: 'obligatorio', category: '', priority: 1, block: '' }));
  return [...own, ...extras].sort(byTime);
}

/** Bloques ocupados en minutos del día; lo que pasa de medianoche (dormir) también ocupa la mañana. */
const spans = (list: Pick<Item, 'time' | 'minutes'>[]) => list.flatMap((i): [number, number][] => {
  const a = toMinutes(i.time);
  const b = a + i.minutes;
  return b > 1440 ? [[a, b], [0, b - 1440]] : [[a, b]];
});

/** Qué acciones se cruzan con un bloque de `minutes` que empieza en `time`. */
export const overlaps = <T extends Pick<Item, 'time' | 'minutes'>>(busy: T[], time: string, minutes: number) => {
  const t = toMinutes(time);
  return busy.filter((i) => spans([i]).some(([a, b]) => t < b && t + minutes > a));
};

/** Primera hora libre desde `wanted` donde cabe un bloque de `minutes` sin cruzarse con nada (Emanuel, 2026-11-03). */
export function freeTime(busy: Pick<Item, 'time' | 'minutes'>[], wanted: string, minutes: number): string {
  const blocks = spans(busy);
  let t = toMinutes(wanted);
  for (let k = 0; k < 300 && t + minutes <= 1440; k++) {
    const hit = blocks.filter(([a, b]) => t < b && t + minutes > a);
    if (!hit.length) return toTime(t);
    t = Math.max(...hit.map(([, b]) => b));
  }
  return wanted;
}

/** Los espacios entre actividades. Son tiempo libre: no son tareas ni se llenan solos. */
export function freeGaps(list: Pick<Item, 'time' | 'minutes'>[]): Gap[] {
  const sorted = [...list].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const gaps: Gap[] = [];
  let end = sorted.length ? endOf(sorted[0]) : 0;
  for (const i of sorted.slice(1)) {
    const start = toMinutes(i.time);
    if (start - end >= MIN_GAP) gaps.push({ from: toTime(end), to: toTime(start), minutes: start - end });
    end = Math.max(end, endOf(i));
  }
  return gaps;
}

/**
 * «Reorganizar mi día» con reglas fijas: lo obligatorio no se mueve, lo flexible busca el primer
 * espacio donde cabe y lo secundario se aplaza si no hay. Primero lo más prioritario.
 */
export function reorganize(list: Item[], extra: Pick<Item, 'time' | 'minutes'>, nowMin = 0): Proposal {
  const start = toMinutes(extra.time);
  const end = start + extra.minutes;
  const hit = list.filter((i) => toMinutes(i.time) < end && endOf(i) > start);
  const busy: [number, number][] = [...list.filter((i) => !hit.includes(i)).map((i): [number, number] => [toMinutes(i.time), endOf(i)]), [start, end]];
  const out: Proposal = { moved: [], off: [], blocked: hit.filter((i) => i.flex === 'obligatorio') };
  const rank = (i: Item) => i.priority * 10 + (i.flex === 'secundario' ? 1 : 0);
  const fit = (minutes: number, from: number) => {
    for (let t = Math.ceil(Math.max(from, DAY_FROM) / 5) * 5; t + minutes <= DAY_TO; t += 5) if (!busy.some(([a, b]) => t < b && t + minutes > a)) return t;
    return null;
  };
  for (const i of hit.filter((x) => x.flex !== 'obligatorio').sort((a, b) => rank(a) - rank(b))) {
    const t = fit(i.minutes, Math.max(nowMin, end));
    if (t === null) out.off.push(i);
    else {
      busy.push([t, t + i.minutes]);
      out.moved.push({ item: i, to: toTime(t) });
    }
  }
  return out;
}

export type ActivityState = 'pendiente' | 'completada' | 'reprogramada' | 'cancelada';
export const STATES: { id: ActivityState; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'completada', label: 'Completada' },
  { id: 'reprogramada', label: 'Reprogramada' },
  { id: 'cancelada', label: 'Cancelada' },
];
export const stateOf = (c?: Check): ActivityState => (c?.done ? 'completada' : c?.value?.state ?? 'pendiente');

/** Lo cancelado no cuenta: 8 de 10 son 80%. Reprogramar no es fallar. */
export function dayStats(list: Item[], checkOf: (i: Item) => Check | undefined) {
  const live = list.filter((i) => stateOf(checkOf(i)) !== 'cancelada');
  const done = live.filter((i) => stateOf(checkOf(i)) === 'completada').length;
  return { done, total: live.length, pct: live.length ? Math.round((done / live.length) * 100) : 0 };
}

/* ── Choques con el calendario ─────────────────────────────────────── */

type Occ = { ev: { title: string; all_day: boolean }; start: Date; end: Date; key: string };
export type Moves = DayPlan['moves'];
/**
 * Propuesta para un día con choques: cada evento del calendario cuenta como fijo y se reacomoda con
 * las reglas de siempre (lo no negociable no se mueve, lo modificable busca espacio, lo flexible se suelta).
 */
export function proposeDay(dayItems: Item[], events: Occ[], plan: DayPlan | null) {
  const moves: Moves = { ...plan?.moves };
  const lines: { text: string; tone: 'move' | 'off' | 'lock' }[] = [];
  let list = dayItems.filter((i) => !moves[i.id]?.off).map((i) => ({ ...i, time: moves[i.id]?.time ?? i.time }));
  for (const o of events.filter((e) => !e.ev.all_day)) {
    const minutes = Math.max(5, Math.round((+o.end - +o.start) / 60000));
    const p = reorganize(list, { time: toTime(o.start.getHours() * 60 + o.start.getMinutes()), minutes });
    for (const m of p.moved) {
      if (m.item.id.startsWith('ev:')) continue;
      moves[m.item.id] = { ...moves[m.item.id], time: m.to };
      lines.push({ text: `${m.item.title} → ${m.to}`, tone: 'move' });
    }
    for (const i of p.off) {
      if (i.id.startsWith('ev:')) continue;
      moves[i.id] = { ...moves[i.id], off: true };
      lines.push({ text: `${i.title}: se aplaza este día`, tone: 'off' });
    }
    for (const i of p.blocked) if (!i.id.startsWith('ev:')) lines.push({ text: `${i.title} es no negociable y choca con ${o.ev.title}: decide tú`, tone: 'lock' });
    const gone = new Set(p.off.map((i) => i.id));
    list = list.filter((i) => !gone.has(i.id)).map((i) => ({ ...i, time: moves[i.id]?.time ?? i.time }));
    list.push({ ...dayItems[0], id: `ev:${o.key}`, title: o.ev.title, time: toTime(o.start.getHours() * 60 + o.start.getMinutes()), minutes, flex: 'obligatorio' });
  }
  return { moves, lines };
}

