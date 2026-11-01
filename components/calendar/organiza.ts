'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { addDays, AREA_INFO, minutesOf, MONTHS, sameDay, startOfDay, startOfWeek, type Occurrence } from './model';

/**
 * Lo propio de Organiza (supabase/24-organiza.sql en la nube). Área = filtro de
 * vida (Mi relación, Dios, Familia…). Meta = lo variable: "una vez al mes", sin
 * fecha; cada vez que se agenda nace un evento con `goal_id`, y esos eventos
 * son su avance.
 */
export type Area = { id: string; name: string; emoji: string; color: string; sort_order: number };
export type GoalPeriod = 'semana' | 'mes';
export type Goal = {
  id: string;
  area_id: string | null;
  title: string;
  times: number;
  period: GoalPeriod;
  all_day: boolean;
  minutes: number;
  notes: string | null;
};

const DEFAULT_AREAS = [
  { name: 'Mi relación', emoji: '❤️', color: '#f472b6' },
  { name: 'Dios', emoji: '🙏', color: '#a78bfa' },
  { name: 'Familia', emoji: '🏡', color: '#fbbf24' },
  { name: 'Trabajo', emoji: '💼', color: '#38bdf8' },
  { name: 'Salud', emoji: '🌿', color: '#34d399' },
  { name: 'Yo', emoji: '✨', color: '#fb923c' },
];

const publishAreas = (areas: Area[]) => {
  AREA_INFO.clear();
  for (const a of areas) AREA_INFO.set(a.id, { color: a.color, label: `${a.emoji} ${a.name}`.trim() });
};

/** Áreas y metas de la persona. `missing` = aún no se corre el SQL 24 en Supabase. */
export function useOrganiza() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      let a = await supabase.from('organiza_areas').select('*').order('sort_order');
      if (a.error) { if (alive) setStatus('missing'); return; }
      if (!a.data?.length) {
        const rows = DEFAULT_AREAS.map((x, i) => ({ ...x, sort_order: i, owner_id: auth.user.id }));
        await supabase.from('organiza_areas').upsert(rows, { onConflict: 'owner_id,name', ignoreDuplicates: true });
        a = await supabase.from('organiza_areas').select('*').order('sort_order');
      }
      const g = await supabase.from('organiza_goals').select('*').is('archived_at', null).order('created_at');
      if (!alive) return;
      const list = (a.data ?? []) as Area[];
      publishAreas(list);
      setAreas(list);
      setGoals((g.data ?? []) as Goal[]);
      setStatus('ready');
    })();
    return () => { alive = false; };
  }, []);

  const saveArea = useCallback(async (patch: Partial<Area>): Promise<boolean> => {
    const { id, ...rest } = patch;
    const q = id
      ? supabase.from('organiza_areas').update(rest).eq('id', id).select().single()
      : supabase.from('organiza_areas').insert(rest).select().single();
    const { data, error } = await q;
    if (error) return false;
    setAreas((list) => {
      const next = id ? list.map((a) => (a.id === id ? (data as Area) : a)) : [...list, data as Area];
      publishAreas(next);
      return next;
    });
    return true;
  }, []);

  const removeArea = useCallback(async (id: string) => {
    const { error } = await supabase.from('organiza_areas').delete().eq('id', id);
    if (error) return;
    setAreas((list) => {
      const next = list.filter((a) => a.id !== id);
      publishAreas(next);
      return next;
    });
  }, []);

  const saveGoal = useCallback(async (patch: Partial<Goal>): Promise<boolean> => {
    const { id, ...rest } = patch;
    const q = id
      ? supabase.from('organiza_goals').update(rest).eq('id', id).select().single()
      : supabase.from('organiza_goals').insert(rest).select().single();
    const { data, error } = await q;
    if (error) return false;
    setGoals((list) => (id ? list.map((g) => (g.id === id ? (data as Goal) : g)) : [...list, data as Goal]));
    return true;
  }, []);

  /** Archiva: los eventos que ya nacieron de la meta se quedan en el calendario. */
  const removeGoal = useCallback(async (id: string) => {
    const { error } = await supabase.from('organiza_goals').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (!error) setGoals((list) => list.filter((g) => g.id !== id));
  }, []);

  return { areas, goals, status, saveArea, removeArea, saveGoal, removeGoal };
}

/* ── Metas: periodo, avance y sugerencia ────────────────────────────── */

export function periodRange(period: GoalPeriod, ref: Date): [Date, Date] {
  if (period === 'semana') {
    const s = startOfWeek(ref);
    return [s, addDays(s, 7)];
  }
  return [new Date(ref.getFullYear(), ref.getMonth(), 1), new Date(ref.getFullYear(), ref.getMonth() + 1, 1)];
}

export const goalDone = (goal: Goal, occ: Occurrence[], ref: Date) => {
  const [from, to] = periodRange(goal.period, ref);
  return occ.filter((o) => o.ev.goal_id === goal.id && o.start >= from && o.start < to).length;
};

export const goalFrequency = (g: Pick<Goal, 'times' | 'period'>) =>
  `${g.times === 1 ? 'Una vez' : `${g.times} veces`} ${g.period === 'semana' ? 'a la semana' : 'al mes'}`;

export const periodName = (period: GoalPeriod, ref: Date) => (period === 'semana' ? 'esta semana' : `en ${MONTHS[ref.getMonth()]}`);

const busyMinutes = (day: Date, occ: Occurrence[]) =>
  occ.filter((o) => sameDay(o.start, day)).reduce((sum, o) => sum + (o.ev.all_day ? 480 : Math.round((o.end.getTime() - o.start.getTime()) / 60_000)), 0);

/** El día más libre que queda en el periodo; lo largo prefiere fin de semana. */
export function suggestDay(goal: Goal, occ: Occurrence[], ref: Date, today: Date): Date | null {
  const [from, to] = periodRange(goal.period, ref);
  const long = goal.all_day || goal.minutes >= 240;
  let best: Date | null = null;
  let bestScore = Infinity;
  for (let d = from > today ? from : startOfDay(today); d < to; d = addDays(d, 1)) {
    if (occ.some((o) => o.ev.goal_id === goal.id && sameDay(o.start, d))) continue;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const score = busyMinutes(d, occ) - (long && weekend ? 600 : 0);
    if (score < bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Horas sin agendar entre las 6:00 y las 23:00 de ese día. */
export function freeHours(day: Date, occ: Occurrence[]) {
  const from = 6 * 60;
  const to = 23 * 60;
  const spans = occ
    .filter((o) => sameDay(o.start, day))
    .map((o) => (o.ev.all_day ? [from, to] : [Math.max(from, minutesOf(o.start)), Math.min(to, sameDay(o.start, o.end) ? minutesOf(o.end) : to)]))
    .sort((a, b) => a[0] - b[0]);
  let busy = 0;
  let at = from;
  for (const [a, b] of spans) {
    busy += Math.max(0, b - Math.max(a, at));
    at = Math.max(at, b);
  }
  return Math.round(((to - from - busy) / 60) * 2) / 2;
}

/** Rutinas que se pisan, una vez por pareja. */
export function clashes(occ: Occurrence[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  const timed = occ.filter((o) => !o.ev.all_day);
  timed.forEach((a, i) => {
    for (const b of timed.slice(i + 1)) {
      if (a.ev.id === b.ev.id || a.start >= b.end || b.start >= a.end) continue;
      const pair = [a.ev.id, b.ev.id].sort().join();
      if (seen.has(pair)) continue;
      seen.add(pair);
      out.push(`«${a.ev.title || 'Sin título'}» y «${b.ev.title || 'Sin título'}» se cruzan el ${a.start.toLocaleDateString('es-CL', { weekday: 'long' })}.`);
    }
  });
  return out;
}

/** Primer hueco del día (9:00–21:00) donde cabe la meta. */
export function freeSlot(day: Date, minutes: number, occ: Occurrence[]): Date {
  const taken = occ.filter((o) => sameDay(o.start, day) && !o.ev.all_day).sort((a, b) => a.start.getTime() - b.start.getTime());
  let at = 9 * 60;
  for (const o of taken) {
    const start = minutesOf(o.start);
    if (start - at >= minutes) break;
    at = Math.max(at, sameDay(o.start, o.end) ? minutesOf(o.end) : 24 * 60);
  }
  const min = at + minutes <= 21 * 60 ? at : 9 * 60;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min);
}
