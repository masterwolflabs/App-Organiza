'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { dayItems, scheduleFor, type DayPlan, freeTime } from '@/components/organiza/dayPlan';
import { ALL_DAYS, daysOf, toMinutes, type Sleep, BYDAY_OF, EMANUEL_LABELS, iso, modulesFor, refOf, TEMPLATES, weekdayOf, type Check, type DayClose, type Item, type Label, type Schedule } from '@/components/organiza/model';

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
/** La alarma que vale: la que eligió el horario al publicarse. */
const withAlarm = (s: Schedule, i: Item): Item => ({ ...i, alarm: s.alarms === 'ninguna' ? 'no' : s.alarms === 'todas' && i.alarm === 'no' ? 'notificacion' : i.alarm });

export function useHorario() {
  const db = useDb();
  const { space, userId } = useSpace();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /* ── Deshacer / Rehacer (Emanuel, 2026-11-03) ──────────────────────────
     Cada cambio guarda cómo volver atrás y cómo repetirlo. Los cambios que llegan casi juntos
     (ej. el panel que actualiza todos los días de una acción, o escribir un nombre) cuentan como uno. */
  type Step = { label: string; at: number; key: string; undo: (() => Promise<unknown>)[]; redo: (() => Promise<unknown>)[] };
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const replaying = useRef(false);
  const [, setHistoryTick] = useState(0);
  const record = useCallback((label: string, key: string, undo: () => Promise<unknown>, redo: () => Promise<unknown>) => {
    if (replaying.current) return;
    const now = Date.now();
    const last = past.current[past.current.length - 1];
    if (last && (now - last.at < 600 || (last.key === key && now - last.at < 1500))) {
      last.undo.unshift(undo);
      last.redo.push(redo);
      last.at = now;
    } else past.current = [...past.current.slice(-99), { label, at: now, key, undo: [undo], redo: [redo] }];
    future.current = [];
    setHistoryTick((t) => t + 1);
  }, []);
  const replay = useCallback(async (from: typeof past, to: typeof past, kind: 'undo' | 'redo') => {
    const step = from.current.pop();
    if (!step) return null;
    replaying.current = true;
    try {
      for (const f of step[kind]) await f();
    } finally {
      replaying.current = false;
    }
    step.at = 0; // lo que venga después es otro paso
    to.current.push(step);
    setHistoryTick((t) => t + 1);
    return step.label;
  }, []);
  /** Todo lo que pase dentro de `fn` queda como UN paso (ej. lo que hizo la IA en una respuesta). */
  const batch = useCallback(async (label: string, fn: () => Promise<void>) => {
    const from = past.current.length;
    if (from) past.current[from - 1].at = 0; // lo de antes no se mezcla con este paso
    try {
      await fn();
    } finally {
      const steps = past.current.slice(from);
      if (steps.length > 1 || (steps.length === 1 && steps[0].label !== label)) {
        past.current = [...past.current.slice(0, from), { label, at: 0, key: `batch:${Date.now()}`, undo: [...steps].reverse().flatMap((x) => x.undo), redo: steps.flatMap((x) => x.redo) }];
        setHistoryTick((t) => t + 1);
      }
    }
  }, []);
  /** Un cambio hecho fuera del horario (ej. un evento del calendario) que igual se puede deshacer aquí. */
  const recordExternal = useCallback((label: string, undoFn: () => Promise<unknown>, redoFn: () => Promise<unknown>) => record(label, `x:${Date.now()}:${Math.random()}`, undoFn, redoFn), [record]);
  const undo = useCallback(() => replay(past, future, 'undo'), [replay]);
  const redo = useCallback(() => replay(future, past, 'redo'), [replay]);
  const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k] ?? null])) as Partial<T>;
  const rawItem = useCallback(async (id: string, p: Partial<Item>) => {
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
    await db.update('organiza_items', { id }, p);
  }, [db]);
  const putItem = useCallback(async (it: Item) => {
    setItems((l) => [...l.filter((x) => x.id !== it.id), it]);
    await db.insert('organiza_items', it);
  }, [db]);
  const dropItem = useCallback(async (id: string) => {
    setItems((l) => l.filter((i) => i.id !== id));
    await db.remove('organiza_items', { id });
  }, [db]);

  const load = useCallback(async () => {
    const [s, l, p] = await Promise.all([db.select<Schedule>('organiza_schedules', { space }), db.select<Label>('organiza_labels', { space }), db.select<DayPlan>('organiza_day_plans', { space })]);
    setPlans(p);
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
    const was = schedules.find((x) => x.id === id);
    if (was) {
      const prev = pick(was, Object.keys(p));
      const raw = (v: Partial<Schedule>) => async () => {
        setSchedules((l) => l.map((s) => (s.id === id ? { ...s, ...v } : s)));
        await db.update('organiza_schedules', { id }, v);
      };
      record('Cambio del horario', `s:${id}:${Object.keys(p).join()}`, raw(prev), raw(p));
    }
    setSchedules((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));
    await db.update('organiza_schedules', { id }, p);
  }, [db, record, schedules]);

  const patchItem = useCallback(async (id: string, p: Partial<Item>) => {
    const it = items.find((i) => i.id === id);
    if (it) record(`Cambio en «${it.title}»`, `i:${id}:${Object.keys(p).join()}`, () => rawItem(id, pick(it, Object.keys(p))), () => rawItem(id, p));
    setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
    await db.update('organiza_items', { id }, p);
    if (it) touch(it.schedule_id);
  }, [db, items, rawItem, record, touch]);

  const addItem = useCallback(async (scheduleId: string, weekday: number, p: Partial<Item> = {}) => {
    const sameDay = items.filter((i) => i.schedule_id === scheduleId && i.weekday === weekday);
    const sort = sameDay.length;
    const title = p.title ?? 'Nueva tarea';
    // Nace en la primera hora libre desde las 9:00 (no encima de otra acción).
    const time = freeTime(sameDay, p.time ?? '09:00', p.minutes ?? 30);
    const [made] = await db.insert<Item>('organiza_items', { schedule_id: scheduleId, weekday, sort, minutes: 30, title, icon: '', cover_url: null, stage: 'sin_empezar', progress: 0, label_id: null, description: '', alarm: 'no', alarm_before: 0, focus: false, modules: [], flex: 'flexible', category: '', priority: 2, block: '', ...p, time });
    if (made) {
      setItems((l) => [...l, made]);
      record(`Nueva «${made.title}»`, `n:${made.id}`, () => dropItem(made.id), () => putItem(made));
    }
    touch(scheduleId);
    return made ?? null;
  }, [db, dropItem, items, putItem, record, touch]);

  const removeItem = useCallback(async (id: string) => {
    const it = items.find((i) => i.id === id);
    if (it) record(`Borrar «${it.title}»`, `d:${id}`, () => putItem(it), () => dropItem(id));
    setItems((l) => l.filter((i) => i.id !== id));
    await db.remove('organiza_items', { id });
    await db.remove('calendar_events', { source: 'horario', source_ref: id });
    if (it) touch(it.schedule_id);
  }, [db, dropItem, items, putItem, record, touch]);

  const ensureLabel = useCallback(async (name: string, color: string, icon = '') => {
    const found = labels.find((l) => l.name === name);
    if (found) return found;
    const [made] = await db.insert<Label>('organiza_labels', { space, name, color, icon, sort: Math.max(0, ...labels.map((l) => (l.sort ?? 0) + 1)) });
    if (made) setLabels((l) => [...l, made]);
    return made ?? null;
  }, [db, labels, space]);

  const patchLabel = useCallback(async (id: string, p: Partial<Label>) => {
    const was = labels.find((x) => x.id === id);
    if (was) {
      const raw = (v: Partial<Label>) => async () => {
        setLabels((l) => l.map((x) => (x.id === id ? { ...x, ...v } : x)));
        await db.update('organiza_labels', { id }, v);
      };
      record(`Categoría «${was.name}»`, `l:${id}:${Object.keys(p).join()}`, raw(pick(was, Object.keys(p))), raw(p));
    }
    setLabels((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_labels', { id }, p);
  }, [db, labels, record]);

  /** Nuevo orden de las categorías (la primera es la que más se cuida). */
  const orderLabels = useCallback(async (ids: string[]) => {
    setLabels((l) => l.map((x) => ({ ...x, sort: ids.indexOf(x.id) })));
    for (const [sort, id] of ids.entries()) await db.update('organiza_labels', { id }, { sort });
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

  /** Un horario importado nace en borrador, como todos. */
  const createImported = useCallback(async (name: string, list: Pick<Item, 'weekday' | 'time' | 'minutes' | 'title' | 'icon' | 'description'>[]) => {
    const [sch] = await db.insert<Schedule>('organiza_schedules', { space, name, cover_url: null, status: 'borrador', alarms: 'elegidas', updated_at: new Date().toISOString() });
    if (!sch) return null;
    if (list.length) await db.insert('organiza_items', list.map((it, sort) => ({ ...it, sort, schedule_id: sch.id, label_id: null, cover_url: null, stage: 'sin_empezar', progress: 0, alarm: 'notificacion', alarm_before: 0, focus: false, modules: modulesFor(it.title), flex: 'flexible', category: '', priority: 2, block: '' })));
    await load();
    choose(sch.id);
    return sch;
  }, [choose, db, load, space]);

  /** Repite una actividad en otro día de este horario, o la quita de él. */
  const repeatOn = useCallback(async (item: Item, weekday: number, on: boolean) => {
    const same = items.filter((i) => i.schedule_id === item.schedule_id && refOf(i.title) === refOf(item.title));
    const there = same.find((i) => i.weekday === weekday);
    if (on && !there) {
      const { id: _id, ...copy } = item;
      await addItem(item.schedule_id, weekday, { ...copy, weekday });
    } else if (!on && there && same.length > 1) await removeItem(there.id);
  }, [addItem, items, removeItem]);

  /** El sueño es un bloque por día que sigue a su configuración. */
  const setSleep = useCallback(async (id: string, sleep: Sleep) => {
    await patchSchedule(id, { sleep });
    const start = toMinutes(sleep.bed);
    const minutes = ((toMinutes(sleep.wake) - start + 1440) % 1440) || 480;
    const have = items.filter((i) => i.schedule_id === id && i.block === 'sueno');
    for (const d of ALL_DAYS) {
      const it = have.find((i) => i.weekday === d);
      if (it) await db.update('organiza_items', { id: it.id }, { time: sleep.bed, minutes });
      else await db.insert('organiza_items', { schedule_id: id, weekday: d, sort: 0, time: sleep.bed, minutes, title: 'Dormir', icon: '😴', cover_url: null, stage: 'sin_empezar', progress: 0, label_id: null, description: '', alarm: 'no', alarm_before: 0, focus: false, modules: [], flex: 'obligatorio', category: 'personal', priority: 1, block: 'sueno' });
    }
    await load();
  }, [db, items, load, patchSchedule]);

  /** Cambia solo ese día: la plantilla queda igual. */
  const setPlan = useCallback(async (day: string, p: Partial<DayPlan>) => {
    const base = plans.find((x) => x.day === day) ?? { day, schedule_id: null, moves: {}, extras: [] };
    const next = { ...base, ...p };
    const put = (v: DayPlan) => async () => {
      setPlans((l) => [...l.filter((x) => x.day !== day), v]);
      await db.upsert('organiza_day_plans', { day: v.day, schedule_id: v.schedule_id, moves: v.moves, extras: v.extras, space, updated_at: new Date().toISOString() }, 'owner_id,space,day');
    };
    record(`Reacomodar el ${day.slice(8)}/${day.slice(5, 7)}`, `p:${day}`, put(base), put(next));
    await put(next)();
  }, [db, plans, record, space]);
  const planOf = useCallback((date: Date) => plans.find((x) => x.day === iso(date)) ?? null, [plans]);
  const itemsOn = useCallback((date: Date) => {
    const s = scheduleFor(date, schedules, planOf(date));
    return dayItems(date, schedules, items, planOf(date)).map((i) => (s ? withAlarm(s, i) : i));
  }, [items, planOf, schedules]);

  /** Copia un horario con sus tareas. La copia nace en borrador. */
  const duplicate = useCallback(async (id: string, p: Partial<Schedule> = {}) => {
    const from = schedules.find((s) => s.id === id);
    if (!from) return null;
    const [sch] = await db.insert<Schedule>('organiza_schedules', { space, name: `${from.name} (copia)`, cover_url: from.cover_url, status: 'borrador', alarms: from.alarms, mode: from.mode, phase: from.phase, color: from.color, days: daysOf(from), updated_at: new Date().toISOString(), ...p });
    if (!sch) return null;
    const list = items.filter((i) => i.schedule_id === id);
    if (list.length) await db.insert('organiza_items', list.map(({ id: _id, ...i }) => ({ ...i, schedule_id: sch.id })));
    await load();
    choose(sch.id);
    return sch;
  }, [choose, db, items, load, schedules, space]);

  /** Los eventos semanales salen de lo publicado, cada horario solo en sus días. */
  const syncEvents = useCallback(async (next: Schedule[]) => {
    if (!userId) return false;
    await db.remove('calendar_events', { source: 'horario', space, owner_id: userId });
    const list = next.filter((s) => s.status === 'publicado').flatMap((s) => items.filter((i) => i.schedule_id === s.id && daysOf(s).includes(i.weekday)));
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
    return true;
  }, [db, items, labels, space, userId]);

  /**
   * Un horario activo no se «vuelve a publicar» (Emanuel, 2026-11-04): cada cambio queda al tiro.
   * Cuando cambian sus tareas, el Calendario se pone al día solo, 2 s después del último cambio.
   */
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const live = schedules.filter((s) => s.status === 'publicado');
    const key = JSON.stringify([live.map((s) => [s.id, daysOf(s)]), items.filter((i) => live.some((s) => s.id === i.schedule_id)).map((i) => [i.id, i.weekday, i.time, i.minutes, i.title, i.icon, i.description, labels.find((l) => l.id === i.label_id)?.color ?? ''])]);
    if (synced.current === null) {
      // Al abrir: si quedó algo sin pasar al Calendario (de antes de este cambio), se pasa ahora.
      synced.current = live.some((s) => s.published_at && new Date(s.updated_at).getTime() > new Date(s.published_at).getTime() + 2000) ? '' : key;
    }
    if (key === synced.current) return;
    const t = setTimeout(async () => {
      synced.current = key;
      if (await syncEvents(schedules)) {
        const at = new Date().toISOString();
        for (const s of live) await db.update('organiza_schedules', { id: s.id }, { published_at: at, updated_at: at });
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [ready, items, labels, schedules, syncEvents, db]);

  /** Guarda quién usa cada día y deja el calendario igual a eso. Un horario sin días vuelve a borrador. */
  const applyWeek = useCallback(async (next: Schedule[]) => {
    const at = new Date().toISOString();
    const settled = next.map((s) => (s.status === 'publicado' && !daysOf(s).length ? { ...s, status: 'borrador' as const } : s));
    for (const s of settled) {
      const old = schedules.find((x) => x.id === s.id);
      if (old && (old.status !== s.status || old.alarms !== s.alarms || daysOf(old).join() !== daysOf(s).join())) await db.update('organiza_schedules', { id: s.id }, { status: s.status, alarms: s.alarms, days: daysOf(s), published_at: s.status === 'publicado' ? (old.status === 'publicado' && s.published_at === old.published_at ? s.published_at : at) : s.published_at, updated_at: at });
    }
    const ok = await syncEvents(settled);
    await load();
    synced.current = null;
    return ok;
  }, [db, load, schedules, syncEvents]);

  /**
   * Publicar: este horario toma sus días y sus tareas se vuelven eventos semanales.
   * Los demás horarios publicados siguen en los días que le quedan libres.
   */
  const publish = useCallback((id: string, alarms: Schedule['alarms'], days?: number[]) => {
    const target = schedules.find((s) => s.id === id);
    const taken = days ?? (target ? daysOf(target) : ALL_DAYS);
    const at = new Date().toISOString();
    return applyWeek(schedules.map((s) => (s.id === id ? { ...s, status: 'publicado' as const, alarms, days: taken, published_at: at } : s.status === 'publicado' ? { ...s, days: daysOf(s).filter((d) => !taken.includes(d)) } : s)));
  }, [applyWeek, schedules]);

  /** Cambia solo ese día de la semana. `null` lo deja libre. */
  const assignDay = useCallback((weekday: number, id: string | null) =>
    applyWeek(schedules.map((s) => {
      const days = daysOf(s).filter((d) => d !== weekday);
      if (s.id !== id) return s.status === 'publicado' ? { ...s, days } : s;
      return { ...s, status: 'publicado' as const, days: s.status === 'publicado' ? [...days, weekday].sort() : [weekday] };
    })), [applyWeek, schedules]);

  /** Pasa de una fase a otra: la nueva toma los días de la actual. */
  const switchPhase = useCallback((fromId: string, toId: string) => {
    const from = schedules.find((s) => s.id === fromId);
    if (!from) return Promise.resolve(false);
    return applyWeek(schedules.map((s) => (s.id === fromId ? { ...s, status: 'borrador' as const } : s.id === toId ? { ...s, status: 'publicado' as const, alarms: from.alarms, days: daysOf(from) } : s)));
  }, [applyWeek, schedules]);

  const unpublish = useCallback(async (id: string) => {
    await applyWeek(schedules.map((s) => (s.id === id ? { ...s, status: 'borrador' as const } : s)));
  }, [applyWeek, schedules]);

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
  // Lo que rige la semana: cada horario publicado en sus días, con la alarma que eligió al publicarse.
  const publishedItems = useMemo(
    () =>
      schedules
        .filter((s) => s.status === 'publicado')
        .flatMap((s) =>
          items
            .filter((i) => i.schedule_id === s.id && daysOf(s).includes(i.weekday))
            .map((i) => withAlarm(s, i))
        ),
    [items, schedules]
  );

  return { ready, batch, recordExternal, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, undoLabel: past.current[past.current.length - 1]?.label, redoLabel: future.current[future.current.length - 1]?.label, schedules, active, activeItems, labels, published, publishedItems, choose, patchSchedule, patchItem, addItem, removeItem, ensureLabel, patchLabel, removeLabel, orderLabels, createFrom, createImported, duplicate, repeatOn, setSleep, setPlan, planOf, itemsOn, publish, assignDay, switchPhase, unpublish, removeSchedule, reload: load };
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
