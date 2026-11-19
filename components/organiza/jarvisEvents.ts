'use client';

import type { Item } from '@/components/organiza/model';
import { clashes, morningConflict, proposeDay, type DayPlan, type Moves } from '@/components/organiza/dayPlan';

/**
 * 🤖 Eventos de Jarvis (J6, Emanuel 2026-11-19): el CÓDIGO detecta lo determinista (sin IA, sin créditos) y Jarvis
 * solo interviene si la persona lo pide. Hoy: choques entre el Horario y el Calendario en los próximos días,
 * con el arreglo que ya calcula el Horario (`proposeDay`, el mismo botón «Reacomodar este día»).
 * Modo Reactivo: no se muestran · Proactivo: se muestran para que decidas · Autónomo: si autorizaste
 * «resolver_choques», se aplica ese arreglo solo (con ↶).
 */
type Occ = { ev: { title: string; all_day: boolean }; start: Date; end: Date; key: string };
export type JarvisEvent = { key: string; kind: 'choque'; date: Date; title: string; body: string; moves: Moves; lines: string[]; ask: string };

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const label = (d: Date, today: Date) => {
  const diff = Math.round((new Date(d).setHours(12, 0, 0, 0) - new Date(today).setHours(12, 0, 0, 0)) / 86_400_000);
  return diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric' });
};

/** Choques de los próximos `days` días (desde hoy). `itemsOn` y `planOf` son los del Horario. */
export function detectClashes(input: { today: Date; days?: number; itemsOn: (d: Date) => Item[]; planOf: (d: Date) => DayPlan | null | undefined; occ: Occ[] }): JarvisEvent[] {
  const out: JarvisEvent[] = [];
  for (let n = 0; n < (input.days ?? 3); n++) {
    const date = new Date(input.today);
    date.setDate(date.getDate() + n);
    const plan = input.planOf(date) ?? null;
    const items = input.itemsOn(date);
    const dayOcc = input.occ.filter((o) => sameDay(o.start, date)).sort((a, b) => +a.start - +b.start);
    if (!dayOcc.length || !items.length) continue;
    const hit = items.filter((i) => !plan?.moves?.[i.id]?.off).map((i) => ({ i, with: clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc) })).filter((x) => x.with.length);
    const morning = morningConflict(items, dayOcc as never, plan);
    if (!hit.length && !morning) continue;
    const p = proposeDay(items, dayOcc as never, plan);
    const first = hit[0];
    const when = label(date, input.today);
    const title = first ? `${first.i.title} choca con ${first.with[0].ev.title} ${when}` : `${morning!.event.ev.title} ${when} llega antes de tu rutina de la mañana`;
    out.push({
      key: `choque:${iso(date)}:${hit.map((x) => x.i.id).sort().join(',')}`,
      kind: 'choque',
      date,
      title,
      body: hit.length > 1 ? `Y ${hit.length - 1} ${hit.length === 2 ? 'choque más' : 'choques más'} ese día.` : 'Puedo reacomodar ese día (solo ese día; tu horario no cambia).',
      moves: p.moves,
      lines: p.lines.map((l) => l.text),
      ask: `${title}. ¿Me ayudas a reacomodar ese día (${iso(date)})?`,
    });
  }
  return out;
}

/** Eventos ya vistos o descartados (por dispositivo; un mismo choque no se repite). */
const SEEN = 'jarvis-events-seen';
export function seenEvents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '[]');
  } catch {
    return [];
  }
}
export function markSeen(key: string) {
  try {
    localStorage.setItem(SEEN, JSON.stringify([...seenEvents().filter((k) => k !== key), key].slice(-200)));
  } catch {}
}
