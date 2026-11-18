/**
 * 🧍 Tu cuerpo en 3D (MODIFICACIÓN 09, Emanuel 2026-11-18) — solo cálculos, sin React ni three.js.
 *
 * Por músculo y para una fecha D:
 *  · ESTÍMULO (7 días hasta D): puntaje estimado = series efectivas × papel × intensidad (mismo cálculo que el Centro
 *    de Progreso, `muscleStimulus`). Nivel por series directas: 0 · 1–4 · 5–10 · más de 10.
 *  · FRECUENCIA (28 días hasta D): días distintos por semana en que se trabajó.
 *  · RECUPERACIÓN: desde la última sesión con 3 o más series del músculo. Menos de 48 h → recuperando; menos de
 *    72 h si esa sesión fue muy cargada (8+ series o 3+ al fallo). Si no, listo. Los entrenos tienen solo fecha:
 *    se cuentan como hechos a mediodía.
 * NADA de esto es crecimiento ni una medición médica: es el entrenamiento que hiciste, resumido.
 *
 * Proporciones del mono: medida / referencia por estatura, limitadas a 0,85–1,2. Lo que no mediste queda en 1
 * (forma estándar del modelo) y se marca como estimado.
 */
import type { WorkoutLog } from './workoutData';
import { muscleStimulus } from './progressData';

const DAY = 86_400_000;
const parse = (s: string) => new Date(`${s}T12:00:00`).getTime();
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDays = (s: string, n: number) => iso(parse(s) + n * DAY);

export type Recovery = 'recuperando' | 'listo' | 'sin_dato';
export type MuscleState = {
  id: string;
  /** Puntaje estimado de 7 días. */
  score: number;
  /** Series directas (el músculo como principal) en 7 días. */
  sets: number;
  /** 0 nada · 1 bajo (1–4) · 2 medio (5–10) · 3 alto (más de 10). */
  level: 0 | 1 | 2 | 3;
  /** Días por semana en que se trabajó (promedio de 28 días). */
  perWeek: number;
  recovery: Recovery;
  /** Horas desde la última sesión que cuenta para la recuperación (null = nunca o hace más de 28 días). */
  hoursSince: number | null;
  /** Horas que faltan para «listo» (0 si ya está). */
  hoursLeft: number;
};

export const stimulusLevel = (sets: number): MuscleState['level'] => (sets <= 0 ? 0 : sets <= 4 ? 1 : sets <= 10 ? 2 : 3);

/** Estado de cada músculo en la fecha `day` (`now` = hora actual si `day` es hoy, para la recuperación). */
export function muscleStates(logs: WorkoutLog[], day: string, ids: string[], now?: number): MuscleState[] {
  const week = muscleStimulus(logs, { from: addDays(day, -6), to: day }, ids);
  const month = muscleStimulus(logs, { from: addDays(day, -27), to: day }, ids);
  const at = now ?? parse(day) + DAY / 2 - 1; // fin del día por defecto (mirar una fecha pasada = cómo quedó ese día)
  return ids.map((id) => {
    const w = week.find((x) => x.id === id)!;
    const m = month.find((x) => x.id === id)!;
    // Última sesión con 3+ series directas del músculo (hasta `day`, dentro de 28 días).
    let last: { day: string; sets: number; failure: number } | null = null;
    for (const l of logs) {
      if (l.day > day || l.day < addDays(day, -27)) continue;
      let sets = 0;
      let failure = 0;
      for (const e of l.exercises) {
        if (e.muscles[0] !== id) continue;
        for (const s of e.sets) {
          if (!s.done || s.kind === 'warmup') continue;
          sets += s.kind === 'drop' ? 0.5 : 1;
          if (s.rir === 0) failure++;
        }
      }
      if (sets >= 3 && (!last || l.day > last.day)) last = { day: l.day, sets, failure };
    }
    const hoursSince = last ? Math.max(0, Math.round((at - parse(last.day)) / 3_600_000)) : null;
    const need = last ? (last.sets >= 8 || last.failure >= 3 ? 72 : 48) : 0;
    const recovery: Recovery = hoursSince === null ? 'sin_dato' : hoursSince < need ? 'recuperando' : 'listo';
    return { id, score: w.score, sets: w.sets, level: stimulusLevel(w.sets), perWeek: +(m.days / 4).toFixed(1), recovery, hoursSince, hoursLeft: recovery === 'recuperando' ? need - hoursSince! : 0 };
  });
}

/* ── Proporciones desde el perfil físico ──────────────────────────────────────────── */

export type ShapeKey = 'chest' | 'waist' | 'hip' | 'arm' | 'leg';
/** Referencia (cm por cm de estatura) de un cuerpo «promedio» como el del modelo. */
export const SHAPE_REF: Record<ShapeKey, number> = { chest: 0.55, waist: 0.47, hip: 0.53, arm: 0.19, leg: 0.31 };
export const SHAPE_LABEL: Record<ShapeKey, string> = { chest: 'Pecho', waist: 'Cintura', hip: 'Cadera', arm: 'Brazo', leg: 'Muslo' };
export type Ratios = Record<ShapeKey, number>;
export const NEUTRAL: Ratios = { chest: 1, waist: 1, hip: 1, arm: 1, leg: 1 };
const clamp = (x: number) => Math.min(1.2, Math.max(0.85, x));

type BodyRow = { day: string } & Partial<Record<'height' | ShapeKey, number | null>>;
export type Measured = { key: 'height' | ShapeKey; value: number; day: string };

/**
 * El cuerpo en la fecha `day`: la medida más reciente de cada cosa hasta esa fecha (cada una con su fecha).
 * Sin estatura no se puede comparar con la referencia → todo queda estándar.
 */
export function shapeAt(rows: BodyRow[], day: string): { ratios: Ratios; measured: Measured[]; estimated: ShapeKey[] } {
  const sorted = rows.filter((r) => r.day <= day).sort((a, b) => (a.day < b.day ? 1 : -1));
  const pick = (k: 'height' | ShapeKey): Measured | null => {
    const r = sorted.find((x) => typeof x[k] === 'number' && (x[k] as number) > 0);
    return r ? { key: k, value: r[k] as number, day: r.day } : null;
  };
  const h = pick('height');
  const keys = Object.keys(SHAPE_REF) as ShapeKey[];
  const measured: Measured[] = [];
  if (h) measured.push(h);
  const ratios = { ...NEUTRAL };
  const estimated: ShapeKey[] = [];
  for (const k of keys) {
    const m = pick(k);
    if (m) measured.push(m);
    if (m && h) ratios[k] = +clamp(m.value / (SHAPE_REF[k] * h.value)).toFixed(3);
    else estimated.push(k);
  }
  return { ratios, measured, estimated };
}

/* ── Línea de tiempo ──────────────────────────────────────────────────────────────── */

export type Stop = { day: string; label: string; body: boolean };
/**
 * Paradas de la línea de fechas: hoy, el cierre de cada una de las últimas `weeks` semanas (domingos) y las fechas
 * del perfil físico de ese tramo. Ordenadas de la más antigua a hoy, sin repetir.
 */
export function timeline(today: string, bodyDays: string[], weeks = 12): Stop[] {
  const dow = (new Date(parse(today)).getDay() + 6) % 7; // 0 = lunes
  const lastSunday = addDays(today, -(dow + 1));
  const from = addDays(lastSunday, -7 * (weeks - 1));
  const map = new Map<string, Stop>();
  for (let i = 0; i < weeks; i++) {
    const d = addDays(from, 7 * i);
    map.set(d, { day: d, label: `Semana al ${short(d)}`, body: false });
  }
  for (const d of bodyDays) if (d >= from && d <= today) map.set(d, { day: d, label: `📏 ${short(d)}`, body: true });
  map.set(today, { day: today, label: 'Hoy', body: bodyDays.includes(today) });
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const short = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
