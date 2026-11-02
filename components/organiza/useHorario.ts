'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { BYDAY_OF, EMANUEL_LABELS, iso, modulesFor, refOf, TEMPLATES, weekdayOf, type Check, type DayClose, type Item, type Label, type Schedule } from '@/components/organiza/model';

const ACTIVE = 'organiza-schedule';
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

/** La próxima fecha de ese día de la semana a esa hora (hoy cuenta). */
export function nextOccurrence(weekday: number, time: string, from = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h || 0, m || 0);
  d.setDate(d.getDate() + ((weekday - weekdayOf(d) + 7) % 7));
  return d;
}

/** Todos los horarios de la base activa, el elegido y sus tareas. */
export function useHorario() {
  const db = useDb();
  const { space, userId } = useSpace();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([db.select<Schedule>('organiza_schedules', { space }), db.select<Label>('organiza_labels', { space })]);
    const ids = s.map((x) => x.id);
    const it = (await db.select<Item>('organiza_items')).filter((i) => ids.includes(i.schedule_id));
    setSchedules(s.sort((a, b) => (a.status === b.status ? 0 : a.status === 'publicado' ? -1 : 1)));
    setItems(it);
    setLabels(l);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(`${ACTIVE}-${space}`);
    } catch {
      /* modo privado */
    }
    setActive((cur) => (s.some((x) => x.id === cur) ? cur : s.some((x) => x.id === saved) ? saved : (s.find((x) => x.status === 'publicado') ?? s[0])?.id ?? null));
    setReady(true);
  }, [db, space]);
  useEffect(() => {
    setReady(false);
    load();
  }, [load]);

  const choose = useCallback((id: string) => {
    setActive(id);
    try {
      localStorage.setItem(`${ACTIVE}-${space}`, id);
    } catch {
      /* modo privado */
    }
  }, [space]);

  const touch = useCallback((id: string) => {
    const at = new Date().toISOString();
    setSchedules((l) => l.map((s) => (s.id === id ? { ...s, updated_at: at } : s)));
    db.update('organiza_schedules', { id }, { updated_at: at });
  }, [db]);

  const patchSchedule = useCallback(async (id: string, p: Partial<Schedule>) => {
    setSchedules((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));
    await db.update('organiza_schedules', { id }, p);
  }, [db]);

  const patchItem = useCallback(async (id: string, p: Partial<Item>) => {
    const it = items.find((i) => i.id === id);
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
    await db.update('organiza_items', { id }, p);
    if (it) touch(it.schedule_id);
  }, [db, items, touch]);

  const addItem = useCallback(async (scheduleId: string, weekday: number, p: Partial<Item> = {}) => {
    const sort = items.filter((i) => i.schedule_id === scheduleId && i.weekday === weekday).length;
    const title = p.title ?? 'Nueva tarea';
    const [made] = await db.insert<Item>('organiza_items', { schedule_id: scheduleId, weekday, sort, time: '09:00', minutes: 30, title, icon: '', cover_url: null, stage: 'sin_empezar', progress: 0, label_id: null, description: '', alarm: 'no', alarm_before: 0, focus: false, modules: [], ...p });
    if (made) setItems((l) => [...l, made]);
    touch(scheduleId);
    return made ?? null;
  }, [db, items, touch]);

  const removeItem = useCallback(async (id: string) => {
    const it = items.find((i) => i.id === id);
    setItems((l) => l.filter((i) => i.id !== id));
    await db.remove('organiza_items', { id });
    await db.remove('calendar_events', { source: 'horario', source_ref: id });
    if (it) touch(it.schedule_id);
  }, [db, items, touch]);

  const ensureLabel = useCallback(async (name: string, color: string, icon = '') => {
    const found = labels.find((l) => l.name === name);
    if (found) return found;
    const [made] = await db.insert<Label>('organiza_labels', { space, name, color, icon });
    if (made) setLabels((l) => [...l, made]);
    return made ?? null;
  }, [db, labels, space]);

  const patchLabel = useCallback(async (id: string, p: Partial<Label>) => {
    setLabels((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_labels', { id }, p);
  }, [db]);

  const removeLabel = useCallback(async (id: string) => {
    setLabels((l) => l.filter((x) => x.id !== id));
    setItems((l) => l.map((i) => (i.label_id === id ? { ...i, label_id: null } : i)));
    await db.remove('organiza_labels', { id });
  }, [db]);

  /** Nace un horario desde una plantilla, siempre como vista previa. */
  const createFrom = useCallback(async (templateId: string, name?: string) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[1];
    const [sch] = await db.insert<Schedule>('organiza_schedules', { space, name: name || (tpl.id === 'blanco' ? 'Mi horario' : tpl.name), cover_url: tpl.cover, status: 'borrador', alarms: 'elegidas', updated_at: new Date().toISOString() });
    if (!sch) return null;
    const have = [...labels];
    for (const l of tpl.labels as typeof EMANUEL_LABELS) {
      if (have.some((x) => x.name === l.name)) continue;
      const [made] = await db.insert<Label>('organiza_labels', { space, ...l });
      if (made) have.push(made);
    }
    if (tpl.items.length) {
      await db.insert('organiza_items', tpl.items.map(({ label, ...it }) => ({ ...it, schedule_id: sch.id, label_id: have.find((x) => x.name === label)?.id ?? null, cover_url: null, stage: 'sin_empezar', progress: 0, description: '', alarm: 'notificacion', alarm_before: 0, focus: false, modules: modulesFor(it.title) })));
    }
    await load();
    choose(sch.id);
    return sch;
  }, [choose, db, labels, load, space]);

  /**
   * Publicar: este horario pasa a ser el de la semana y sus tareas se vuelven
   * eventos semanales. Solo un horario publicado por base.
   */
  const publish = useCallback(async (id: string, alarms: Schedule['alarms']) => {
    if (!userId) return false;
    const list = items.filter((i) => i.schedule_id === id);
    for (const s of schedules.filter((x) => x.status === 'publicado')) {
      await db.update('organiza_schedules', { id: s.id }, { status: 'borrador' });
    }
    await db.remove('calendar_events', { source: 'horario', space, owner_id: userId });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (list.length) {
      const ok = await db.insert('calendar_events', list.map((i) => {
        const start = nextOccurrence(i.weekday, i.time);
        return {
          owner_scope: userId, app: 'organiza', kind: space === 'empresa' ? 'trabajo' : 'personal', title: `${i.icon ? `${i.icon} ` : ''}${i.title}`, description: i.description || null,
          starts_at: start.toISOString(), ends_at: addMinutes(start, i.minutes).toISOString(), all_day: false, time_zone: zone, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY_OF[i.weekday]}`,
          color: labels.find((l) => l.id === i.label_id)?.color ?? null, source: 'horario', source_ref: i.id, space,
        };
      }));
      if (!ok.length) return false;
    }
    const at = new Date().toISOString();
    await db.update('organiza_schedules', { id }, { status: 'publicado', alarms, published_at: at, updated_at: at });
    await load();
    return true;
  }, [db, items, labels, load, schedules, space, userId]);

  const unpublish = useCallback(async (id: string) => {
    if (!userId) return;
    await db.remove('calendar_events', { source: 'horario', space, owner_id: userId });
    await db.update('organiza_schedules', { id }, { status: 'borrador' });
    await load();
  }, [db, load, space, userId]);

  const removeSchedule = useCallback(async (id: string) => {
    const s = schedules.find((x) => x.id === id);
    if (s?.status === 'publicado') await unpublish(id);
    await db.remove('organiza_schedules', { id });
    setActive(null);
    await load();
  }, [db, load, schedules, unpublish]);

  const active = schedules.find((s) => s.id === activeId) ?? null;
  const activeItems = useMemo(() => items.filter((i) => i.schedule_id === activeId), [items, activeId]);
  const published = schedules.find((s) => s.status === 'publicado') ?? null;
  const publishedItems = useMemo(() => items.filter((i) => i.schedule_id === published?.id), [items, published?.id]);

  return { ready, schedules, active, activeItems, labels, published, publishedItems, choose, patchSchedule, patchItem, addItem, removeItem, ensureLabel, patchLabel, removeLabel, createFrom, publish, unpublish, removeSchedule, reload: load };
}

/** Lo que se cumplió: el registro de cada tarea, el cierre del día y la XP salen de aquí. */
export function useChecks() {
  const db = useDb();
  const { space } = useSpace();
  const [checks, setChecks] = useState<Check[]>([]);
  const [days, setDays] = useState<DayClose[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, d] = await Promise.all([db.select<Check>('organiza_checks', { space }), db.select<DayClose>('organiza_days', { space })]);
      if (!alive) return;
      setChecks(c);
      setDays(d);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [db, space]);

  const mark = useCallback(async (title: string, day: string, done: boolean, value?: Check['value']) => {
    const ref = refOf(title);
    const old = checks.find((c) => c.ref === ref && c.day === day);
    const next: Check = { ref, title, day, done, value: value ?? old?.value ?? {} };
    setChecks((l) => [...l.filter((c) => !(c.ref === ref && c.day === day)), next]);
    await db.upsert('organiza_checks', { ...next, space }, 'owner_id,ref,day');
  }, [checks, db, space]);

  const unmark = useCallback(async (title: string, day: string) => {
    const ref = refOf(title);
    setChecks((l) => l.filter((c) => !(c.ref === ref && c.day === day)));
    await db.remove('organiza_checks', { ref, day });
  }, [db]);

  const closeDay = useCallback(async (day: string, done: number, total: number, note: string) => {
    const row = { day, space, done, total, note, closed_at: new Date().toISOString() };
    setDays((l) => [...l.filter((d) => d.day !== day), row]);
    await db.upsert('organiza_days', row, 'owner_id,space,day');
  }, [db, space]);

  return { ready, checks, days, mark, unmark, closeDay };
}

export const todayISO = () => iso(new Date());
