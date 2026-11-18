'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { MUSCLES, muscleLabel, type WorkoutLog } from '@/components/organiza/workoutData';
import { METRICS, type BodyLog } from '@/components/organiza/bodyData';
import { exercises, iso, muscleStimulus, totals } from '@/components/organiza/progressData';

/**
 * 🎯 Objetivos inteligentes de Workout Pro (MODIFICACIÓN 04, Emanuel 2026-11-18) — SQL 51 (`organiza_workout_goals`;
 * ojo: `organiza_goals` es otra tabla, la de metas del Horario).
 * La IA (nube, /api/organiza/workout-goals) solo PROPONE metas con su porqué. El progreso lo calcula la app con los
 * entrenos y el perfil físico (`currentValue`), nunca la IA. Ningún objetivo cambia la rutina.
 */

export type GoalType = 'masa' | 'fuerza' | 'resistencia' | 'grasa' | 'musculo' | 'equilibrio' | 'mantener';
export const GOAL_TYPES: { id: GoalType; label: string; emoji: string }[] = [
  { id: 'masa', label: 'Ganar masa muscular', emoji: '💪' },
  { id: 'fuerza', label: 'Aumentar fuerza', emoji: '🏋️' },
  { id: 'resistencia', label: 'Mejorar resistencia', emoji: '🏃' },
  { id: 'grasa', label: 'Reducir grasa corporal', emoji: '🔥' },
  { id: 'musculo', label: 'Desarrollar un músculo', emoji: '🎯' },
  { id: 'equilibrio', label: 'Equilibrio muscular', emoji: '⚖️' },
  { id: 'mantener', label: 'Mantener resultados', emoji: '🛟' },
];

export type MetricKind = 'exercise_weight' | 'weekly_frequency' | 'weekly_minutes' | 'muscle_sets' | 'body';
export type Direction = 'up' | 'down' | 'keep';
export type GoalMetric = { kind: MetricKind; exercise?: string; muscle?: string; body?: string; direction: Direction };
export type GoalStatus = 'propuesto' | 'activo' | 'pausado' | 'completado' | 'rechazado';
export type GoalEvent = { at: string; what: string };
export type Goal = {
  id: string;
  type: GoalType;
  title: string;
  outcome: string;
  metric: GoalMetric;
  unit: string;
  baseline: number | null;
  target: number | null;
  period_weeks: number | null;
  started_at: string | null;
  review_at: string | null;
  status: GoalStatus;
  why: string;
  how: string;
  next_action: string;
  source: 'ia' | 'usuario';
  events: GoalEvent[];
  completed_at: string | null;
  created_at?: string;
};

export const METRIC_KINDS: { id: MetricKind; label: string; unit: string }[] = [
  { id: 'exercise_weight', label: 'Peso en un ejercicio', unit: 'kg' },
  { id: 'weekly_frequency', label: 'Días de entreno por semana', unit: 'días/sem' },
  { id: 'weekly_minutes', label: 'Minutos de entreno por semana', unit: 'min/sem' },
  { id: 'muscle_sets', label: 'Series semanales de un músculo', unit: 'series/sem' },
  { id: 'body', label: 'Medida del perfil físico', unit: '' },
];

export const unitOf = (m: GoalMetric) => (m.kind === 'body' ? METRICS.find((x) => x.id === m.body)?.unit ?? '' : METRIC_KINDS.find((x) => x.id === m.kind)?.unit ?? '');

export function metricLabel(m: GoalMetric): string {
  if (m.kind === 'exercise_weight') return `Peso más alto en ${m.exercise || 'un ejercicio'} (últimas 4 semanas)`;
  if (m.kind === 'weekly_frequency') return 'Días entrenados por semana (promedio de 4 semanas)';
  if (m.kind === 'weekly_minutes') return 'Minutos entrenados por semana (promedio de 4 semanas)';
  if (m.kind === 'muscle_sets') return `Series efectivas por semana de ${m.muscle ? muscleLabel(m.muscle).toLowerCase() : 'un músculo'} (promedio de 4 semanas)`;
  return `${METRICS.find((x) => x.id === m.body)?.label ?? 'Medida'} (último registro del perfil físico)`;
}

const DAY = 86_400_000;
const last4 = (today = new Date()) => ({ from: iso(new Date(today.getTime() - 27 * DAY)), to: iso(today) });

/** Valor actual del indicador con tus datos. null = todavía no hay datos (no se inventa). `note` dice de dónde sale. */
export function currentValue(m: GoalMetric, logs: WorkoutLog[], body: BodyLog[], today = new Date()): { value: number | null; note: string } {
  const r = last4(today);
  if (m.kind === 'exercise_weight') {
    const ex = exercises(logs).find((x) => x.name.toLowerCase() === (m.exercise ?? '').trim().toLowerCase());
    if (!ex) return { value: null, note: 'Sin registros de este ejercicio todavía.' };
    const recent = ex.sessions.filter((s) => s.day >= r.from && s.day <= r.to && s.top > 0);
    if (recent.length) return { value: Math.max(...recent.map((s) => s.top)), note: `Mejor de las últimas 4 semanas (${recent.length} ${recent.length === 1 ? 'sesión' : 'sesiones'}).` };
    const last = [...ex.sessions].reverse().find((s) => s.top > 0);
    return last ? { value: last.top, note: `Última vez: ${new Date(`${last.day}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} (no lo hiciste en las últimas 4 semanas).` } : { value: null, note: 'Sin series con peso de este ejercicio.' };
  }
  if (m.kind === 'weekly_frequency') return { value: +(totals(logs, r).days / 4).toFixed(1), note: 'Promedio de las últimas 4 semanas.' };
  if (m.kind === 'weekly_minutes') return { value: Math.round(totals(logs, r).minutes / 4), note: 'Promedio de las últimas 4 semanas.' };
  if (m.kind === 'muscle_sets') {
    const st = muscleStimulus(logs, r, MUSCLES.map((x) => x.id)).find((x) => x.id === m.muscle);
    return { value: st ? +(st.sets / 4).toFixed(1) : null, note: 'Series donde es el músculo principal, promedio de 4 semanas.' };
  }
  const withV = body.filter((b) => typeof b[m.body as keyof BodyLog] === 'number').sort((a, b) => (a.day < b.day ? 1 : -1));
  return withV.length ? { value: withV[0][m.body as keyof BodyLog] as number, note: `Registro del ${new Date(`${withV[0].day}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}.` } : { value: null, note: 'Aún no registras esta medida en tu perfil físico.' };
}

/** Avance 0–100 entre el punto de partida y la meta. «Mantener»: 100 si sigue dentro de ±5 % del punto de partida. */
export function progressOf(g: Goal, current: number | null): { pct: number | null; reached: boolean; text: string } {
  if (current === null || g.baseline === null || g.target === null) return { pct: null, reached: false, text: 'Sin datos suficientes todavía.' };
  if (g.metric.direction === 'keep') {
    const ok = Math.abs(current - g.target) <= Math.max(0.5, Math.abs(g.target) * 0.05);
    return { pct: ok ? 100 : 50, reached: false, text: ok ? 'Dentro de lo que quieres mantener.' : 'Se está alejando de lo que quieres mantener.' };
  }
  const span = g.target - g.baseline;
  if (span === 0) return { pct: 100, reached: true, text: 'Ya estás en la meta.' };
  const pct = Math.max(0, Math.min(100, ((current - g.baseline) / span) * 100));
  const reached = g.metric.direction === 'up' ? current >= g.target : current <= g.target;
  return { pct: Math.round(pct), reached, text: reached ? '¡Llegaste a la meta!' : pct > 0 ? 'Avanzando.' : 'Aún sin avance medible.' };
}

/* ── Datos ────────────────────────────────────────────────────────────────────────── */

const addWeeks = (d: Date, w: number) => iso(new Date(d.getTime() + w * 7 * DAY));

export function useGoals() {
  const db = useDb();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const rows = await db.select<Goal>('organiza_workout_goals'); // RLS: solo los tuyos
    setGoals(rows.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1)));
    setReady(true);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(async (id: string, p: Partial<Goal>, what?: string) => {
    let next: Goal | undefined;
    setGoals((l) => l.map((g) => {
      if (g.id !== id) return g;
      next = { ...g, ...p, events: what ? [...(g.events ?? []), { at: new Date().toISOString(), what }] : g.events };
      return next;
    }));
    const cur = goals.find((g) => g.id === id);
    const events = what ? [...(cur?.events ?? []), { at: new Date().toISOString(), what }] : cur?.events;
    return db.update('organiza_workout_goals', { id }, { ...p, ...(events ? { events } : {}), updated_at: new Date().toISOString() });
  }, [db, goals]);

  const add = useCallback(async (g: Omit<Goal, 'id' | 'events' | 'completed_at'>, what: string) => {
    const [made] = await db.insert<Goal>('organiza_workout_goals', { ...g, events: [{ at: new Date().toISOString(), what }] });
    if (made) setGoals((l) => [made, ...l]);
    return made ?? null;
  }, [db]);

  /** Aceptar: el punto de partida es tu valor de HOY; la revisión, en las semanas estimadas (revisable). */
  const accept = useCallback((g: Goal, current: number | null) => {
    const now = new Date();
    return patch(g.id, { status: 'activo', baseline: current ?? g.baseline, started_at: iso(now), review_at: g.period_weeks ? addWeeks(now, g.period_weeks) : null }, 'Aceptado');
  }, [patch]);

  const remove = useCallback(async (id: string) => {
    setGoals((l) => l.filter((g) => g.id !== id));
    await db.remove('organiza_workout_goals', { id });
  }, [db]);

  return { goals, ready, load, patch, add, accept, remove };
}
export type GoalsApi = ReturnType<typeof useGoals>;

/* ── Lo que se le cuenta a la IA (solo números reales, ya calculados) ────────────── */

export function aiContext(logs: WorkoutLog[], body: BodyLog[], profile: Record<string, string>, goals: Goal[]): { context: string; exercises: string[] } {
  const now = new Date();
  const r4 = last4(now);
  const r12 = { from: iso(new Date(now.getTime() - 83 * DAY)), to: iso(now) };
  const t4 = totals(logs, r4);
  const t12 = totals(logs, r12);
  const ex = exercises(logs).filter((x) => x.sessions.some((s) => s.day >= r12.from));
  const ms = muscleStimulus(logs, r4, MUSCLES.map((m) => m.id));
  const lines: string[] = [];
  lines.push(`Hoy: ${iso(now)}.`);
  lines.push(`Últimas 4 semanas: ${t4.days} días entrenados (${(t4.days / 4).toFixed(1)}/sem), ${t4.sets} series efectivas, ${Math.round(t4.minutes / 4)} min/sem.`);
  lines.push(`Últimas 12 semanas: ${t12.days} días entrenados, ${t12.sets} series.`);
  lines.push(ex.length ? 'Ejercicios (peso más alto por sesión, más antiguo → más nuevo, últimas 12 semanas):' : 'Sin ejercicios con peso registrados en 12 semanas.');
  for (const x of ex.slice(0, 15)) {
    const ss = x.sessions.filter((s) => s.day >= r12.from && s.top > 0).slice(-8);
    lines.push(`- ${x.name} (${x.muscles.map(muscleLabel).join(', ')}): ${ss.map((s) => `${s.day.slice(5)} ${s.top}kg×${s.topReps ?? '?'}`).join(' · ') || 'sin peso'}${x.recordWeight ? ` · récord ${x.recordWeight.weight}kg×${x.recordWeight.reps ?? '?'}` : ''}`);
  }
  lines.push(`Series efectivas por semana por músculo principal (4 semanas): ${ms.map((m) => `${muscleLabel(m.id)} ${(m.sets / 4).toFixed(1)}`).join(', ')}.`);
  const b = [...body].sort((a, z) => (a.day < z.day ? -1 : 1));
  if (b.length) {
    const fields = METRICS.filter((m) => b.some((x) => typeof x[m.id] === 'number'));
    lines.push(`Perfil físico (${b.length} registros): ${fields.map((m) => { const v = b.filter((x) => typeof x[m.id] === 'number'); return `${m.label} ${v[0][m.id]}→${v.at(-1)![m.id]} ${m.unit} (${v[0].day}→${v.at(-1)!.day})`; }).join('; ')}.`);
  } else lines.push('Sin registros en el perfil físico.');
  const p = Object.entries(profile).filter(([, v]) => v);
  lines.push(p.length ? `Evaluación de la persona: ${p.map(([k, v]) => `${k}: ${v}`).join(' · ')}.` : 'Sin evaluación respondida.');
  const active = goals.filter((g) => g.status === 'activo' || g.status === 'pausado' || g.status === 'propuesto');
  lines.push(active.length ? `Objetivos que ya tiene (no repetir): ${active.map((g) => `${g.title} [${g.status}]`).join('; ')}.` : 'Sin objetivos aún.');
  return { context: lines.join('\n'), exercises: exercises(logs).map((x) => x.name) };
}
