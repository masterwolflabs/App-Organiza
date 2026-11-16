import { iso, refOf, type Check } from '@/components/organiza/model';
import type { useHorario } from '@/components/organiza/useHorario';

/**
 * La IA sugiere cambiar el horario (Daily ia-sugiere-cambiar-horario, Emanuel 2026-11-04 / 16).
 * «Ayudar de la forma más simple»: cuando la semana se mueve mucho, un aviso en el Horario ofrece
 * 🗓️ cambiar el horario de verdad (abre la IA con el contexto ya escrito) o 🧳 un horario provisorio
 * por unos días (después vuelve solo el normal). Avisa cuando:
 *   · una misma acción se movió 3+ veces en los últimos 7 días,
 *   · 2+ días de la semana quedaron muy reacomodados (4+ acciones movidas o sacadas),
 *   · los últimos 3 días se cumplió menos de la mitad (solo si la persona suele marcar lo que hace).
 * «Le cuento algo grande» va por la IA: la acción `provisorio` de horarios_gestionar (nube) → aiExecutor.
 */
type H = ReturnType<typeof useHorario>;
export type Hint = { key: string; text: string; ask: string };

const DAY = 86400000;
const OFF_KEY = 'organiza-hint-off:';
const OFF_DAYS = 7;

export function scheduleHints(h: H, checks: Check[], now: Date): Hint[] {
  const out: Hint[] = [];
  const titles = new Map([...h.publishedItems, ...h.activeItems].map((i) => [i.id, i.title]));
  const week = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() - i * DAY));

  // 1 · La misma acción movida 3+ veces.
  const moved = new Map<string, { n: number; to: Map<string, number> }>();
  let busyDays = 0;
  for (const d of week) {
    const moves = Object.entries(h.planOf(d)?.moves ?? {});
    if (moves.length >= 4) busyDays++;
    for (const [id, mv] of moves) {
      const title = titles.get(id);
      if (!title) continue;
      const m = moved.get(title) ?? { n: 0, to: new Map() };
      m.n++;
      if (mv.time) m.to.set(mv.time, (m.to.get(mv.time) ?? 0) + 1);
      moved.set(title, m);
    }
  }
  for (const [title, m] of [...moved].sort((a, b) => b[1].n - a[1].n)) {
    if (m.n < 3) break;
    const [common, times] = [...m.to].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const often = common && times >= 2 ? ` (casi siempre a las ${common})` : '';
    out.push({
      key: `movida:${refOf(title)}`,
      text: `Moviste «${title}» ${m.n} veces esta semana${often}.`,
      ask: `Esta semana moví «${title}» ${m.n} veces${often}. Ayúdame a cambiar mi horario para que quede donde de verdad lo hago.`,
    });
  }

  // 2 · Días muy reacomodados.
  if (busyDays >= 2)
    out.push({
      key: 'reacomodado',
      text: `${busyDays} días de esta semana los tuviste que reacomodar mucho.`,
      ask: `Esta semana tuve que reacomodar mucho ${busyDays} días. Mira qué se está moviendo y ayúdame a ajustar mi horario para que calce con cómo vivo de verdad.`,
    });

  // 3 · Acciones sin cumplir (solo si de verdad se marca lo que se hace).
  const marks = checks.filter((c) => c.done && c.day >= iso(new Date(now.getTime() - 14 * DAY)));
  if (marks.length >= 5) {
    const past = [1, 2, 3].map((i) => new Date(now.getTime() - i * DAY));
    const low = past.every((d) => {
      const day = iso(d);
      const list = h.itemsOn(d);
      if (list.length < 3) return false;
      const done = new Set(checks.filter((c) => c.day === day && c.done).map((c) => c.ref));
      return list.filter((i) => done.has(refOf(i.title))).length / list.length < 0.5;
    });
    if (low)
      out.push({
        key: 'incumplidas',
        text: 'Los últimos 3 días se cumplió menos de la mitad de tu horario.',
        ask: 'Los últimos 3 días cumplí menos de la mitad de mi horario. Revisa qué no estoy haciendo y propón un horario más realista.',
      });
  }

  return out.filter((x) => !isOff(x.key, now));
}

function isOff(key: string, now: Date) {
  try {
    const at = Number(localStorage.getItem(OFF_KEY + key));
    return !!at && now.getTime() - at < OFF_DAYS * DAY;
  } catch {
    return false;
  }
}
export function snoozeHint(key: string) {
  try {
    localStorage.setItem(OFF_KEY + key, String(Date.now()));
  } catch {}
}

/**
 * Horario provisorio: copia del horario que rige (en borrador, no reemplaza al real) y se elige SOLO
 * para esos días en el plan del día (`schedule_id`). Pasados los días vuelve solo el normal.
 */
export async function makeProvisional(h: H, days: number, reason?: string | null, from = new Date()): Promise<{ name: string; until: Date } | null> {
  const base = h.published ?? h.active ?? h.schedules[0];
  if (!base || days < 1) return null;
  const until = new Date(from.getTime() + (days - 1) * DAY);
  const name = `🧳 Provisorio${reason ? ` · ${reason}` : ''} (hasta el ${until.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })})`;
  const copy = await h.duplicate(base.id, { name });
  if (!copy) return null;
  for (let i = 0; i < days; i++) await h.setPlan(iso(new Date(from.getTime() + i * DAY)), { schedule_id: copy.id });
  return { name, until };
}
