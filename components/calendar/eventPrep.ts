import type { Db } from '@/components/organiza/db';
import type { DayPlan, Extra } from '@/components/organiza/dayPlan';

/**
 * El «antes y después» de un evento presencial (Daily calendario-protocolo-evento, Emanuel 2026-11-16).
 * Al guardar un evento con lugar se arman bloques SOLO en Organiza (extras del día en
 * `organiza_day_plans`, nunca van a Google): 🚿 ducha → 💄 arreglarme → 🚗 trayecto (+ margen) justo
 * antes, y 🏠 la vuelta justo después. El trayecto se mira en Google Maps (link con el medio ya
 * puesto) y los minutos los escribe la persona: no hay llave de Maps.
 * Cada bloque lleva `ref` = id del evento y `prep` = lo elegido, así al reabrir el evento se rearma.
 */
export type Travel = 'auto' | 'micro' | 'pie' | 'bici';
export type Prep = { arreglarse: number; ducha: number; medio: Travel; trayecto: number; margen: number; vuelta: boolean };
export type PrepExtra = Extra & { ref?: string; prep?: Prep };

export const DEFAULT_PREP: Prep = { arreglarse: 0, ducha: 0, medio: 'auto', trayecto: 0, margen: 10, vuelta: true };
export const TRAVEL: { id: Travel; label: string; emoji: string; maps: string }[] = [
  { id: 'auto', label: 'Auto', emoji: '🚗', maps: 'driving' },
  { id: 'micro', label: 'Micro / metro', emoji: '🚌', maps: 'transit' },
  { id: 'pie', label: 'A pie', emoji: '🚶', maps: 'walking' },
  { id: 'bici', label: 'Bici', emoji: '🚲', maps: 'bicycling' },
];
export const travelOf = (t: Travel) => TRAVEL.find((x) => x.id === t) ?? TRAVEL[0];

/** Google Maps with the route to the place and the way of going already chosen (from where you are). */
export const mapsUrl = (location: string, medio: Travel) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}&travelmode=${travelOf(medio).maps}`;

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minus = (d: Date, m: number) => new Date(d.getTime() - m * 60000);

/** The blocks, in order, for an event from `start` to `end`. */
export function prepBlocks(ref: string, title: string, start: Date, end: Date, p: Prep): { day: string; extra: PrepExtra }[] {
  const out: { day: string; extra: PrepExtra }[] = [];
  const name = title.trim() || 'el evento';
  const go = p.trayecto > 0 ? p.trayecto + p.margen : 0;
  const tr = travelOf(p.medio);
  let cursor = minus(start, go);
  if (go) out.push({ day: dayKey(cursor), extra: { id: `${ref}:ida`, title: `${tr.emoji} Ir a ${name}${p.margen ? ` (+${p.margen} min de margen)` : ''}`, time: hhmm(cursor), minutes: go, ref, prep: p } });
  if (p.arreglarse > 0) {
    cursor = minus(cursor, p.arreglarse);
    out.unshift({ day: dayKey(cursor), extra: { id: `${ref}:arreglarse`, title: `💄 Arreglarme para ${name}`, time: hhmm(cursor), minutes: p.arreglarse, ref, prep: p } });
  }
  if (p.ducha > 0) {
    cursor = minus(cursor, p.ducha);
    out.unshift({ day: dayKey(cursor), extra: { id: `${ref}:ducha`, title: `🚿 Ducha antes de ${name}`, time: hhmm(cursor), minutes: p.ducha, ref, prep: p } });
  }
  if (p.vuelta && p.trayecto > 0) out.push({ day: dayKey(end), extra: { id: `${ref}:vuelta`, title: `🏠 Volver de ${name}`, time: hhmm(end), minutes: p.trayecto, ref, prep: p } });
  // Keep the chosen options even with no blocks, so reopening the event remembers them.
  return out;
}

/** When you have to start getting ready / leave, for the summary under the options. */
export function prepSummary(start: Date, p: Prep): string | null {
  const go = p.trayecto > 0 ? p.trayecto + p.margen : 0;
  const total = go + p.arreglarse + p.ducha;
  if (!total) return null;
  const leave = minus(start, go);
  const begin = minus(start, total);
  return go && total > go ? `Empiezas a prepararte a las ${hhmm(begin)} y sales a las ${hhmm(leave)}.` : go ? `Sales a las ${hhmm(leave)}.` : `Empiezas a prepararte a las ${hhmm(begin)}.`;
}

/** What was chosen last time for this event (looked up on the days around it). */
export async function loadPrep(db: Db, space: string, ref: string, days: string[]): Promise<Prep | null> {
  for (const day of Array.from(new Set(days))) {
    const [plan] = await db.select<DayPlan>('organiza_day_plans', { space, day });
    const hit = (plan?.extras as PrepExtra[] | undefined)?.find((x) => x.ref === ref && x.prep);
    if (hit?.prep) return { ...DEFAULT_PREP, ...hit.prep };
  }
  return null;
}

/** Replaces this event's blocks on every day involved (old and new dates). `prep` null = remove them. */
export async function savePrep(db: Db, space: string, ref: string, blocks: { day: string; extra: PrepExtra }[], cleanDays: string[]): Promise<void> {
  const days = Array.from(new Set([...cleanDays, ...blocks.map((b) => b.day)]));
  for (const day of days) {
    const [plan] = await db.select<DayPlan>('organiza_day_plans', { space, day });
    const kept = ((plan?.extras ?? []) as PrepExtra[]).filter((x) => x.ref !== ref);
    const extras = [...kept, ...blocks.filter((b) => b.day === day).map((b) => b.extra)];
    if (!plan && !extras.length) continue;
    await db.upsert(
      'organiza_day_plans',
      { day, schedule_id: plan?.schedule_id ?? null, moves: plan?.moves ?? {}, extras, space, updated_at: new Date().toISOString() },
      'owner_id,space,day',
    );
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('organiza:plans-changed'));
}
