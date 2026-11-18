/**
 * 📈 Centro de Progreso de Workout Pro (MODIFICACIÓN 03, Emanuel 2026-11-18) — solo cálculos, sin React.
 * Lee lo que ya existe: los entrenos (`organiza_workout_logs`, del Focus) y el perfil físico
 * (`organiza_body_logs`). No guarda nada nuevo.
 *
 * Reglas: se cuentan las series HECHAS que no son de aproximación (efectivas y descargas). Volumen = peso × reps
 * (solo series con ambos datos). Nada se inventa: lo que es estimación (1RM, estímulo muscular) se marca así.
 */
import type { LoggedSet, WorkoutLog } from './workoutData';

export type PeriodId = 'semana' | 'mes' | '3m' | '6m' | 'ano' | 'custom';
export const PERIODS: { id: PeriodId; label: string; days: number }[] = [
  { id: 'semana', label: 'Semana', days: 7 },
  { id: 'mes', label: 'Mes', days: 30 },
  { id: '3m', label: '3 meses', days: 91 },
  { id: '6m', label: '6 meses', days: 182 },
  { id: 'ano', label: 'Año', days: 365 },
  { id: 'custom', label: 'Personalizado', days: 0 },
];

const DAY = 86_400_000;
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY) + 1;

export type Range = { from: string; to: string };
/** El período elegido y el anterior del mismo largo (para comparar). */
export function ranges(id: PeriodId, today: string, custom?: Range): { cur: Range; prev: Range } {
  const cur = id === 'custom' && custom ? custom : { from: addDays(today, -((PERIODS.find((p) => p.id === id)?.days ?? 30) - 1)), to: today };
  const len = daysBetween(cur.from, cur.to);
  return { cur, prev: { from: addDays(cur.from, -len), to: addDays(cur.from, -1) } };
}
const inRange = (day: string, r: Range) => day >= r.from && day <= r.to;

const counts = (s: LoggedSet) => s.done && s.kind !== 'warmup';
const vol = (s: LoggedSet) => (s.weight && s.reps ? s.weight * s.reps : 0);

/* ── Indicadores ──────────────────────────────────────────────────────────────────── */

export type Totals = { workouts: number; days: number; sets: number; reps: number; volume: number; minutes: number };
export function totals(logs: WorkoutLog[], r: Range): Totals {
  const t: Totals = { workouts: 0, days: 0, sets: 0, reps: 0, volume: 0, minutes: 0 };
  const days = new Set<string>();
  for (const l of logs) {
    if (!inRange(l.day, r)) continue;
    t.workouts++;
    days.add(l.day);
    t.minutes += l.minutes ?? 0;
    for (const e of l.exercises) for (const s of e.sets) if (counts(s)) {
      t.sets++;
      t.reps += s.reps ?? 0;
      t.volume += vol(s);
    }
  }
  t.days = days.size;
  return t;
}

/** Cambio porcentual (null si antes era 0: no se puede comparar sin inventar). */
export const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

/* ── Series en el tiempo (barras) ─────────────────────────────────────────────────── */

export type Bucket = { key: string; label: string; from: string; to: string; volume: number; workouts: number; sets: number };
/** Agrupa por día (≤ 14 días), semana (≤ 6 meses) o mes. */
export function buckets(logs: WorkoutLog[], r: Range): { unit: 'día' | 'semana' | 'mes'; list: Bucket[] } {
  const len = daysBetween(r.from, r.to);
  const unit = len <= 14 ? 'día' : len <= 186 ? 'semana' : 'mes';
  const list: Bucket[] = [];
  let start = r.from;
  if (unit === 'semana') {
    const d = parse(r.from);
    start = addDays(r.from, -((d.getDay() + 6) % 7)); // lunes
  }
  if (unit === 'mes') start = `${r.from.slice(0, 7)}-01`;
  while (start <= r.to) {
    let end: string;
    if (unit === 'día') end = start;
    else if (unit === 'semana') end = addDays(start, 6);
    else {
      const d = parse(start);
      end = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    }
    const label = unit === 'mes' ? parse(start).toLocaleDateString('es-CL', { month: 'short' }) : parse(start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    list.push({ key: start, label, from: start < r.from ? r.from : start, to: end > r.to ? r.to : end, volume: 0, workouts: 0, sets: 0 });
    start = addDays(end, 1);
  }
  for (const l of logs) {
    const b = list.find((x) => l.day >= x.from && l.day <= x.to);
    if (!b) continue;
    b.workouts++;
    for (const e of l.exercises) for (const s of e.sets) if (counts(s)) {
      b.sets++;
      b.volume += vol(s);
    }
  }
  return { unit, list };
}

/* ── Récords y ejercicios ─────────────────────────────────────────────────────────── */

/** 1RM estimado (Epley). Es una ESTIMACIÓN: solo con 1 a 12 reps; si no, null. */
export const e1rm = (w: number | null, reps: number | null) => (w && reps && reps >= 1 && reps <= 12 ? (reps === 1 ? w : w * (1 + reps / 30)) : null);

export type Session = { day: string; top: number; topReps: number | null; sets: number; volume: number; best1rm: number | null };
export type ExerciseStat = { name: string; muscles: string[]; sessions: Session[]; recordWeight: { weight: number; reps: number | null; day: string } | null };

/** Cada ejercicio con sus sesiones (de todo el historial, ordenadas por fecha) y su récord de peso. */
export function exercises(logs: WorkoutLog[]): ExerciseStat[] {
  const map = new Map<string, ExerciseStat>();
  for (const l of [...logs].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    for (const e of l.exercises) {
      const done = e.sets.filter((s) => counts(s) && s.kind !== 'drop');
      const all = e.sets.filter(counts);
      if (!all.length) continue;
      const key = e.name.trim().toLowerCase();
      const st = map.get(key) ?? { name: e.name.trim(), muscles: e.muscles, sessions: [], recordWeight: null };
      const withW = done.filter((s) => s.weight);
      const top = withW.reduce<LoggedSet | null>((m, s) => (!m || (s.weight ?? 0) > (m.weight ?? 0) || ((s.weight ?? 0) === (m.weight ?? 0) && (s.reps ?? 0) > (m.reps ?? 0)) ? s : m), null);
      const best = Math.max(0, ...done.map((s) => e1rm(s.weight, s.reps) ?? 0));
      st.sessions.push({ day: l.day, top: top?.weight ?? 0, topReps: top?.reps ?? null, sets: all.length, volume: all.reduce((a, s) => a + vol(s), 0), best1rm: best || null });
      if (top?.weight && (!st.recordWeight || top.weight > st.recordWeight.weight || (top.weight === st.recordWeight.weight && (top.reps ?? 0) > (st.recordWeight.reps ?? 0))))
        st.recordWeight = { weight: top.weight, reps: top.reps ?? null, day: l.day };
      map.set(key, st);
    }
  }
  return [...map.values()];
}

/** Récords logrados DENTRO del período (el mejor peso histórico se hizo en esas fechas). */
export const recordsIn = (list: ExerciseStat[], r: Range) => list.filter((x) => x.recordWeight && inRange(x.recordWeight.day, r)).sort((a, b) => (a.recordWeight!.day < b.recordWeight!.day ? 1 : -1));

/* ── Músculos: estímulo (estimado) ────────────────────────────────────────────────── */

/**
 * Estímulo por músculo = series efectivas × peso por papel × intensidad. Es un PUNTAJE ESTIMADO, no una medición:
 *  · papel: el primer músculo del ejercicio cuenta 1; los demás 0,5 (trabajan, pero menos).
 *  · intensidad (repeticiones en reserva): 0–1 → 1 · 2–3 → 0,85 · 4 o más → 0,6 · sin dato → 0,85.
 *  · las descargas cuentan media serie; las aproximaciones no cuentan.
 * Además: series directas (sin ponderar) y en cuántos días distintos se trabajó (frecuencia).
 */
export type MuscleStat = { id: string; score: number; sets: number; days: number; perWeek: number };
export function muscleStimulus(logs: WorkoutLog[], r: Range, ids: string[]): MuscleStat[] {
  const acc = new Map<string, { score: number; sets: number; days: Set<string> }>(ids.map((id) => [id, { score: 0, sets: 0, days: new Set() }]));
  for (const l of logs) {
    if (!inRange(l.day, r)) continue;
    for (const e of l.exercises) {
      for (const s of e.sets) {
        if (!counts(s)) continue;
        const intensity = s.rir === null || s.rir === undefined ? 0.85 : s.rir <= 1 ? 1 : s.rir <= 3 ? 0.85 : 0.6;
        const unit = s.kind === 'drop' ? 0.5 : 1;
        e.muscles.forEach((m, i) => {
          const a = acc.get(m);
          if (!a) return;
          a.score += unit * intensity * (i === 0 ? 1 : 0.5);
          if (i === 0) a.sets += unit;
          a.days.add(l.day);
        });
      }
    }
  }
  const weeks = Math.max(1, daysBetween(r.from, r.to) / 7);
  return ids.map((id) => {
    const a = acc.get(id)!;
    return { id, score: +a.score.toFixed(2), sets: a.sets, days: a.days.size, perWeek: +(a.days.size / weeks).toFixed(1) };
  }).sort((x, y) => y.score - x.score);
}

/* ── Cuerpo ───────────────────────────────────────────────────────────────────────── */

export type BodyPoint = { day: string; value: number };
/** Puntos de una medida del perfil físico dentro del período (más el último anterior, como punto de partida). */
export function bodySeries(rows: { day: string; [k: string]: unknown }[], metric: string, r: Range): { points: BodyPoint[]; base: BodyPoint | null } {
  const all = rows.filter((x) => typeof x[metric] === 'number').map((x) => ({ day: x.day, value: x[metric] as number })).sort((a, b) => (a.day < b.day ? -1 : 1));
  const points = all.filter((p) => inRange(p.day, r));
  const before = all.filter((p) => p.day < r.from).at(-1) ?? null;
  return { points, base: before };
}
