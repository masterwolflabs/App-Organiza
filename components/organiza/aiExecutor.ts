'use client';

import { LABEL_COLORS, WEEK, type Item } from '@/components/organiza/model';
import type { useHorario } from '@/components/organiza/useHorario';
import type { useCalendar } from '@/components/calendar/useCalendar';
import { BYDAY, type CalEvent } from '@/components/calendar/model';
import { APP } from '@/app.config';

/**
 * La IA de Organiza hace cosas en vivo (Emanuel, 2026-11-04). La nube devuelve acciones en la respuesta
 * (metadata.actions) y aquí se ejecutan con las mismas funciones de la pantalla: se ven al tiro y todo lo de
 * una respuesta se deshace de una vez con ↶. Borrar siempre pregunta antes.
 */
type H = ReturnType<typeof useHorario>;
type Cal = Pick<ReturnType<typeof useCalendar>, 'save' | 'remove' | 'events'>;
type Confirm = (o: { title: string; message?: string; confirmLabel?: string; tone?: 'danger' | 'primary' }) => Promise<boolean>;
type Patch = { title?: string; icon?: string; time?: string; minutes?: number; label?: string; alarm?: Item['alarm']; alarm_before?: number; focus?: boolean; flex?: Item['flex']; description?: string; weekday?: number; auto_focus?: boolean; bg_color?: string | null; border_color?: string | null };
type Action = { type: string; [k: string]: unknown };

const PRIORITY: Record<string, number> = { obligatorio: 1, flexible: 2, secundario: 3 };
const short = (d: number) => WEEK[d]?.slice(0, 3) ?? '';

/** Qué tipos de acción hacen cambios (los otros solo marcan o proponen). */
export const isLiveAction = (a: unknown) => typeof (a as Action)?.type === 'string' && /^organiza\.(create_items|edit_items|delete_items|day_plan|schedule|cal_save|cal_delete)$/.test((a as Action).type);

export async function runAIActions(actions: unknown, ctx: { h: H; cal: Cal; confirm: Confirm }): Promise<string[]> {
  const list = (Array.isArray(actions) ? actions : []).filter(isLiveAction) as Action[];
  if (!list.length) return [];
  const { h, cal, confirm } = ctx;
  const lines: string[] = [];
  const labels = new Map(h.labels.map((l) => [l.name.toLowerCase(), l.id]));
  const labelId = async (name: string) => {
    const key = name.toLowerCase();
    if (labels.has(key)) return labels.get(key)!;
    const made = await h.ensureLabel(name, LABEL_COLORS[(h.labels.length + labels.size) % LABEL_COLORS.length]);
    if (made) labels.set(key, made.id);
    return made?.id ?? null;
  };
  const toItem = async (p: Patch): Promise<Partial<Item>> => {
    const { label, flex, ...rest } = p;
    const out: Partial<Item> = { ...rest };
    if (label) out.label_id = await labelId(label);
    if (flex) Object.assign(out, { flex, priority: PRIORITY[flex] ?? 2 });
    return out;
  };
  const scheduleByName = (name: unknown) => {
    const n = typeof name === 'string' ? name.trim().toLowerCase() : '';
    return (n && h.schedules.find((s) => s.name.toLowerCase() === n)) || (n && h.schedules.find((s) => s.name.toLowerCase().includes(n))) || null;
  };

  await h.batch('Cambios de la IA', async () => {
    for (const a of list) {
      try {
        if (a.type === 'organiza.create_items') {
          const sch = scheduleByName(a.schedule) ?? h.active ?? h.schedules[0];
          if (!sch) { lines.push('⚠️ No hay un horario donde crear la acción.'); continue; }
          for (const it of (a.items as { days: number[]; patch: Patch }[]) ?? []) {
            const p = await toItem(it.patch);
            for (const d of it.days) await h.addItem(sch.id, d, p);
            lines.push(`✅ Creé «${it.patch.title}» ${it.days.map(short).join(', ')} a las ${it.patch.time}`);
          }
        } else if (a.type === 'organiza.edit_items') {
          const changes = (a.changes as { id: string; patch: Patch }[]) ?? [];
          for (const c of changes) await h.patchItem(c.id, await toItem(c.patch));
          const titles = [...new Set(changes.map((c) => h.activeItems.find((i) => i.id === c.id)?.title ?? h.publishedItems.find((i) => i.id === c.id)?.title).filter(Boolean))];
          lines.push(`✏️ Cambié ${changes.length} ${changes.length === 1 ? 'acción' : 'acciones'}${titles.length ? `: ${titles.slice(0, 4).join(', ')}${titles.length > 4 ? '…' : ''}` : ''}`);
        } else if (a.type === 'organiza.delete_items') {
          const ids = (a.ids as string[]) ?? [];
          const titles = (a.titles as string[]) ?? [];
          if (!(await confirm({ title: `¿Borro ${ids.length} ${ids.length === 1 ? 'acción' : 'acciones'}?`, message: titles.join(', '), confirmLabel: 'Sí, borrar', tone: 'danger' }))) { lines.push('↩️ No borré nada.'); continue; }
          for (const id of ids) await h.removeItem(id);
          lines.push(`🗑️ Borré ${ids.length}: ${titles.join(', ')}`);
        } else if (a.type === 'organiza.day_plan') {
          const day = String(a.day);
          const plan = h.planOf(new Date(`${day}T12:00`));
          const moves = { ...plan?.moves };
          for (const m of (a.moves as { id: string; time?: string; off?: boolean }[]) ?? []) moves[m.id] = m.off ? { off: true } : { ...moves[m.id], time: m.time };
          const extras = [...(plan?.extras ?? []), ...((a.extras as { title: string; time: string; minutes: number }[]) ?? []).map((x) => ({ id: `x:${crypto.randomUUID()}`, ...x }))];
          await h.setPlan(day, { moves, extras });
          lines.push(`📅 Reacomodé el ${day.slice(8)}/${day.slice(5, 7)}`);
        } else if (a.type === 'organiza.schedule') {
          const op = String(a.op);
          const sch = scheduleByName(a.schedule) ?? h.active;
          const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : undefined;
          if (op === 'crear') { await h.createFrom('blanco', name); lines.push(`🆕 Creé el horario «${name ?? 'Mi horario'}» (en borrador)`); }
          else if (!sch) lines.push('⚠️ No encontré ese horario.');
          else if (op === 'duplicar') { await h.duplicate(sch.id, name ? { name } : {}); lines.push(`📄 Dupliqué «${sch.name}»`); }
          else if (op === 'renombrar' && name) { await h.patchSchedule(sch.id, { name }); lines.push(`✏️ «${sch.name}» ahora se llama «${name}»`); }
          else if (op === 'publicar') { await h.publish(sch.id, sch.alarms); lines.push(`🚀 Publiqué «${sch.name}»`); }
          else if (op === 'despublicar') { await h.unpublish(sch.id); lines.push(`📝 «${sch.name}» volvió a borrador`); }
        } else if (a.type === 'organiza.cal_save') {
          const e = (a.event as Record<string, unknown>) ?? {};
          const id = typeof a.id === 'string' && a.id ? a.id : null;
          const prev = id ? cal.events.find((x) => x.id === id) ?? null : null;
          const allDay = e.allDay === true || (typeof e.start === 'string' && e.start.length === 10);
          const parse = (v: string) => (v.length === 10 ? new Date(`${v}T00:00`) : new Date(v));
          const start = typeof e.start === 'string' ? parse(e.start) : prev ? new Date(prev.starts_at) : null;
          let end = typeof e.end === 'string' ? parse(e.end) : prev && !e.start ? new Date(prev.ends_at) : start ? new Date(start.getTime() + (allDay ? 86400000 : 3600000)) : null;
          if (start && end && end <= start) end = new Date(start.getTime() + 3600000);
          const repeat = typeof e.repeat === 'string' ? e.repeat : undefined;
          const row: Partial<CalEvent> = {
            ...(typeof e.title === 'string' ? { title: e.title } : {}),
            ...(start ? { starts_at: start.toISOString() } : {}),
            ...(end ? { ends_at: end.toISOString() } : {}),
            ...(typeof e.allDay === 'boolean' || (typeof e.start === 'string') ? { all_day: allDay } : {}),
            ...(typeof e.location === 'string' ? { location: e.location || null, mode: e.location ? 'presencial' : null } : {}),
            ...(typeof e.url === 'string' ? { meeting_url: e.url || null, mode: e.url ? 'online' : null } : {}),
            ...(typeof e.description === 'string' ? { description: e.description || null } : {}),
            ...(repeat ? { rrule: repeat === 'diario' ? 'FREQ=DAILY' : repeat === 'semanal' && start ? `FREQ=WEEKLY;BYDAY=${BYDAY[start.getDay()]}` : repeat === 'mensual' ? 'FREQ=MONTHLY' : null } : {}),
          };
          if (prev) {
            const back = Object.fromEntries(Object.keys(row).map((k) => [k, (prev as Record<string, unknown>)[k] ?? null])) as Partial<CalEvent>;
            await cal.save({ id: prev.id, ...row });
            h.recordExternal(`Evento «${prev.title}»`, () => cal.save({ id: prev.id, ...back }), () => cal.save({ id: prev.id, ...row }));
            lines.push(`✏️ Cambié el evento «${row.title ?? prev.title}»`);
          } else if (start) {
            const full: Partial<CalEvent> = { kind: 'evento', app: APP.slug, status: 'confirmado', source: 'manual', time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, attendee_users: [], attendee_people: [], attendee_clients: [], attendee_emails: [], color: null, rrule: null, all_day: allDay, title: 'Sin título', ...row };
            let made = await cal.save(full);
            if (made) {
              h.recordExternal(`Evento «${made.title}»`, async () => made && cal.remove(made.id), async () => { made = await cal.save(full); });
              lines.push(`📅 Agendé «${made.title}» el ${start.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}${allDay ? '' : ` a las ${start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`}`);
            } else lines.push('⚠️ No pude guardar el evento.');
          }
        } else if (a.type === 'organiza.cal_delete') {
          const ids = (a.ids as string[]) ?? [];
          const titles = (a.titles as string[]) ?? [];
          if (!(await confirm({ title: `¿Borro ${ids.length === 1 ? 'este evento' : `${ids.length} eventos`}?`, message: titles.join(', '), confirmLabel: 'Sí, borrar', tone: 'danger' }))) { lines.push('↩️ No borré nada.'); continue; }
          for (const id of ids) {
            const prev = cal.events.find((x) => x.id === id);
            if (!(await cal.remove(id)) || !prev) continue;
            const { id: _id, google_event_id: _g, ...copy } = prev;
            let back: CalEvent | null = null;
            h.recordExternal(`Borrar «${prev.title}»`, async () => { back = await cal.save(copy); }, async () => back && cal.remove(back.id));
          }
          lines.push(`🗑️ Borré: ${titles.join(', ')}`);
        }
      } catch (err) {
        console.error('acción de la IA', a.type, err);
        lines.push('⚠️ Algo no se pudo hacer. Revisa y vuelve a pedírmelo.');
      }
    }
  });
  return lines;
}

/* ── Agente con poderes (Daily agente-organiza-poderes, 2026-11-12) ─────────────────────────────── */

/** Cambios de pantalla (sección, vista, mostrar, semana, abrir) y tutorial: se hacen directo, sin preguntar. */
export const isScreenAction = (a: unknown) => typeof (a as Action)?.type === 'string' && /^organiza\.(ui|tour)$/.test((a as Action).type);

export function runScreenActions(actions: unknown) {
  const list = (Array.isArray(actions) ? actions : []).filter(isScreenAction) as Action[];
  for (const a of list) {
    if (a.type === 'organiza.ui') {
      const { type: _t, ...detail } = a;
      if (typeof detail.seccion === 'string' && detail.seccion) {
        const target = `#${detail.seccion === 'inicio' ? 'inicio' : detail.seccion}`;
        if (window.location.hash !== target) window.location.hash = target;
      }
      // La vista del Horario la escucha (vista, mostrar, enfocar hoy, semana, abrir una acción).
      setTimeout(() => window.dispatchEvent(new CustomEvent('organiza:ui', { detail })), 150);
    } else if (a.type === 'organiza.tour') {
      window.dispatchEvent(new CustomEvent('organiza:tour', { detail: a.steps }));
    }
  }
}

const ALARM_TXT: Record<string, string> = { no: 'sin aviso', notificacion: 'notificación', alarma: 'alarma' };
/** «Voy a…»: lo que haría cada acción, en palabras, ANTES de hacerlo (la persona confirma con Sí). */
export function describeActions(actions: unknown, h: H, cal: Cal): string[] {
  const list = (Array.isArray(actions) ? actions : []).filter(isLiveAction) as Action[];
  const titleOf = (id: string) => h.activeItems.find((i) => i.id === id)?.title ?? h.publishedItems.find((i) => i.id === id)?.title ?? 'una acción';
  const what = (p: Patch) =>
    [
      p.time && `a las ${p.time}`,
      p.minutes && `${p.minutes} min`,
      p.title && `nombre «${p.title}»`,
      p.alarm && ALARM_TXT[p.alarm],
      p.focus === true && 'con focus',
      p.focus === false && 'sin focus',
      p.auto_focus === true && 'focus se abre solo',
      p.auto_focus === false && 'focus no se abre solo',
      p.bg_color !== undefined && (p.bg_color ? 'pintar fondo' : 'sin color de fondo'),
      p.border_color !== undefined && (p.border_color ? 'pintar borde' : 'sin borde'),
      p.label && `categoría «${p.label}»`,
      p.flex && ({ obligatorio: 'no negociable', flexible: 'modificable', secundario: 'flexible' } as Record<string, string>)[p.flex],
      p.weekday !== undefined && `pasar a ${WEEK[p.weekday]}`,
    ]
      .filter(Boolean)
      .join(', ');
  const out: string[] = [];
  for (const a of list) {
    if (a.type === 'organiza.create_items') for (const it of (a.items as { days: number[]; patch: Patch }[]) ?? []) out.push(`➕ Crear «${it.patch.title}» ${it.days.map(short).join(', ')}${it.patch.time ? ` a las ${it.patch.time}` : ''}`);
    else if (a.type === 'organiza.edit_items') {
      const changes = (a.changes as { id: string; patch: Patch }[]) ?? [];
      const byTitle = new Map<string, { n: number; desc: string }>();
      for (const c of changes) {
        const t = titleOf(c.id);
        const e = byTitle.get(t) ?? { n: 0, desc: what(c.patch) };
        e.n++;
        byTitle.set(t, e);
      }
      for (const [t, e] of byTitle) out.push(`✏️ «${t}»${e.n > 1 ? ` (${e.n} días)` : ''}: ${e.desc || 'cambios'}`);
    } else if (a.type === 'organiza.delete_items') out.push(`🗑️ Borrar: ${((a.titles as string[]) ?? []).join(', ')}`);
    else if (a.type === 'organiza.day_plan') out.push(`📅 Reacomodar el ${String(a.day).slice(8)}/${String(a.day).slice(5, 7)}: ${((a.moves as unknown[]) ?? []).length} cambios${((a.extras as unknown[]) ?? []).length ? ` y ${((a.extras as unknown[]) ?? []).length} agregadas` : ''}`);
    else if (a.type === 'organiza.schedule') out.push(`🗂️ Horario: ${String(a.op)}${a.schedule ? ` «${a.schedule}»` : ''}${a.name ? ` → «${a.name}»` : ''}`);
    else if (a.type === 'organiza.cal_save') {
      const e = (a.event as Record<string, unknown>) ?? {};
      const prev = typeof a.id === 'string' ? cal.events.find((x) => x.id === a.id) : null;
      out.push(prev ? `✏️ Cambiar el evento «${prev.title}»` : `📅 Agendar «${String(e.title ?? 'evento')}»${typeof e.start === 'string' ? ` el ${new Date(e.start.length === 10 ? `${e.start}T00:00` : e.start).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`);
    } else if (a.type === 'organiza.cal_delete') out.push(`🗑️ Borrar evento: ${((a.titles as string[]) ?? []).join(', ')}`);
  }
  return out;
}
