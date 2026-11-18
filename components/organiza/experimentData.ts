/**
 * 🧪 Entrenamientos experimentales de Workout Pro (MODIFICACIÓN 07, Emanuel 2026-11-18) — solo cálculos, sin React.
 * Compara el período de prueba del experimento con un período HABITUAL del mismo largo justo antes, para los
 * músculos que el experimento trabaja. Los números los calcula la app; la IA solo los interpreta.
 */
import type { WorkoutLog } from './workoutData';

export type Checkin = { day: string; log_id?: string | null; enjoyment: number | null; effort: number | null; pain: 'no' | 'molestia' | 'dolor'; notes: string; soreness_next: number | null };
export type Side = { sessions: number; setsPerWeek: number; volumePerWeek: number; avgRir: number | null; feel: number | null; best: { name: string; weight: number; reps: number | null } | null; enjoyment: number | null; sorenessNext: number | null; painSessions: number };
export type Comparison = { trial: { from: string; to: string }; habitual: { from: string; to: string }; exp: Side; hab: Side; muscles: string[]; enoughData: boolean; notes: string[] };

const DAY = 86_400_000;
const parse = (s: string) => new Date(`${s}T12:00:00`).getTime();
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const avg = (l: number[]) => (l.length ? +(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2) : null);
const FEEL: Record<string, number> = { facil: 1, bien: 2, duro: 3 };

function side(logs: WorkoutLog[], muscles: Set<string>, from: string, to: string, checkins: Checkin[] = []): Side {
  const inR = logs.filter((l) => l.day >= from && l.day <= to);
  const weeks = Math.max(1, (parse(to) - parse(from) + DAY) / (7 * DAY));
  let sets = 0;
  let volume = 0;
  const rirs: number[] = [];
  const feels: number[] = [];
  let best: Side['best'] = null;
  let sessions = 0;
  for (const l of inR) {
    let touched = false;
    for (const e of l.exercises) {
      if (!e.muscles[0] || !muscles.has(e.muscles[0])) continue;
      for (const s of e.sets) {
        if (!s.done || s.kind === 'warmup') continue;
        touched = true;
        sets += s.kind === 'drop' ? 0.5 : 1;
        if (s.weight && s.reps) volume += s.weight * s.reps;
        if (s.rir !== null && s.rir !== undefined) rirs.push(s.rir);
        if (s.weight && s.kind !== 'drop' && (!best || s.weight > best.weight)) best = { name: e.name, weight: s.weight, reps: s.reps };
      }
    }
    if (touched) {
      sessions++;
      if (l.feel && FEEL[l.feel]) feels.push(FEEL[l.feel]);
    }
  }
  const ci = checkins.filter((c) => c.day >= from && c.day <= to);
  return {
    sessions,
    setsPerWeek: +(sets / weeks).toFixed(1),
    volumePerWeek: Math.round(volume / weeks),
    avgRir: avg(rirs),
    feel: avg(feels),
    best,
    enjoyment: avg(ci.map((c) => c.enjoyment).filter((x): x is number => x !== null)),
    sorenessNext: avg(ci.map((c) => c.soreness_next).filter((x): x is number => x !== null)),
    painSessions: ci.filter((c) => c.pain !== 'no').length,
  };
}

/**
 * Experimento vs habitual. `logs` = todos tus entrenos (con `experiment_id`). Período de prueba: desde que empezó
 * hasta hoy o el fin (lo que pase antes). Habitual: el mismo largo justo antes de empezar, sin entrenos de experimentos.
 */
export function compare(input: { logs: (WorkoutLog & { experiment_id?: string | null })[]; experimentId: string; muscles: string[]; started: string; ends: string | null; today: string; checkins: Checkin[] }): Comparison {
  const to = input.ends && input.ends < input.today ? input.ends : input.today;
  const len = Math.max(1, Math.round((parse(to) - parse(input.started)) / DAY) + 1);
  const habTo = iso(parse(input.started) - DAY);
  const habFrom = iso(parse(input.started) - len * DAY);
  const m = new Set(input.muscles);
  const expLogs = input.logs.filter((l) => l.experiment_id === input.experimentId);
  const habLogs = input.logs.filter((l) => !l.experiment_id);
  const exp = side(expLogs, m, input.started, to, input.checkins);
  const hab = side(habLogs, m, habFrom, habTo);
  const notes: string[] = [];
  if (exp.sessions < 2) notes.push('Todavía hay pocas sesiones del experimento: la comparación es preliminar.');
  if (!hab.sessions) notes.push('No hay entrenos habituales de estos músculos justo antes: no hay con qué comparar el volumen.');
  if (len < 14) notes.push('El período es corto (menos de 2 semanas): los cambios de fuerza aún no se notan.');
  return { trial: { from: input.started, to }, habitual: { from: habFrom, to: habTo }, exp, hab, muscles: input.muscles, enoughData: exp.sessions >= 2 && hab.sessions >= 1, notes };
}

/** Para mandarle a la IA: solo los números ya calculados, en texto simple. */
export function comparisonText(c: Comparison, label: (m: string) => string): string {
  const f = (s: Side) => `${s.sessions} sesiones · ${s.setsPerWeek} series/sem · ${s.volumePerWeek} kg/sem · RIR prom. ${s.avgRir ?? 's/d'} · esfuerzo prom. ${s.feel ?? 's/d'} (1 fácil–3 duro)${s.best ? ` · mejor ${s.best.name} ${s.best.weight}kg×${s.best.reps ?? '?'}` : ''}`;
  return [
    `Músculos: ${c.muscles.map(label).join(', ')}.`,
    `Experimento (${c.trial.from} a ${c.trial.to}): ${f(c.exp)} · disfrute prom. ${c.exp.enjoyment ?? 's/d'}/5 · agujetas al día siguiente ${c.exp.sorenessNext ?? 's/d'}/3 · sesiones con molestia/dolor ${c.exp.painSessions}.`,
    `Habitual (${c.habitual.from} a ${c.habitual.to}): ${f(c.hab)}.`,
    ...c.notes,
  ].join('\n');
}
