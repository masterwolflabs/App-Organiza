'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * 🏋️ Workout Pro (Emanuel, 2026-11-17, Daily workout-pro): el entrenamiento de Master Planner.
 * - Rutinas en galería (`organiza_routines`, SQL 44), cada una con versión COMPLETA y CORTA (30 min = solo
 *   los ejercicios ⭐ clave). Vienen de fábrica con el plan de 6 días de Emanuel; todo se edita.
 * - Cada músculo tiene sus 2 ejercicios más importantes (⭐ clave) y otros de detalle.
 * - La semana (`organiza_prefs.training`): qué rutina va cada día y en qué versión, según la modalidad
 *   (Mínimo 3 · Semi 4–5 · Pro 6 · Express 30 min · Mixta · Descanso). Una semana sin entrenar también vale.
 * - Cada entreno terminado (`organiza_workout_logs`) pinta los músculos de la figura en los últimos 7 días
 *   y guarda pesos y reps (progreso de fuerza). Calidad = clave hechos / clave totales, no cuánto duró.
 * - «Mínimo = éxito»: con los 3 días masivos (D1, D2, D3) la semana está CUMPLIDA. Nunca se muestra fracaso.
 */

/* ── Músculos ─────────────────────────────────────────────────────────────────────── */

export type MuscleId =
  | 'pecho' | 'hombros' | 'biceps' | 'triceps' | 'antebrazos' | 'trapecio' | 'dorsales' | 'lumbares'
  | 'abdominales' | 'oblicuos' | 'gluteos' | 'cuadriceps' | 'femorales' | 'pantorrillas';

export const MUSCLES: { id: MuscleId; label: string }[] = [
  { id: 'pecho', label: 'Pecho' },
  { id: 'dorsales', label: 'Espalda (dorsales)' },
  { id: 'trapecio', label: 'Trapecio' },
  { id: 'lumbares', label: 'Espalda baja' },
  { id: 'hombros', label: 'Hombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'antebrazos', label: 'Antebrazos' },
  { id: 'abdominales', label: 'Abdominales' },
  { id: 'oblicuos', label: 'Oblicuos' },
  { id: 'cuadriceps', label: 'Cuádriceps' },
  { id: 'femorales', label: 'Femorales' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'pantorrillas', label: 'Pantorrillas' },
];
export const muscleLabel = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;

/* ── Ejercicios ───────────────────────────────────────────────────────────────────── */

/** `key` = de los 2 más importantes de su músculo (van en la versión corta). `weight` = el último peso usado (kg). */
export type RoutineExercise = { id: string; name: string; muscles: MuscleId[]; key: boolean; sets: number; reps: string; rest: number; weight?: number | null; video?: string };

/** La biblioteca: por músculo, primero los 2 ⭐ clave y después los de detalle. */
export const LIBRARY: Record<MuscleId, { name: string; muscles: MuscleId[]; key?: boolean }[]> = {
  pecho: [
    { name: 'Press banca con barra', muscles: ['pecho', 'triceps', 'hombros'], key: true },
    { name: 'Press inclinado con mancuernas', muscles: ['pecho', 'hombros'], key: true },
    { name: 'Aperturas en polea', muscles: ['pecho'] },
    { name: 'Fondos en paralelas', muscles: ['pecho', 'triceps'] },
    { name: 'Flexiones de brazos', muscles: ['pecho', 'triceps'] },
  ],
  dorsales: [
    { name: 'Dominadas o jalón al pecho', muscles: ['dorsales', 'biceps'], key: true },
    { name: 'Remo con barra', muscles: ['dorsales', 'trapecio', 'biceps'], key: true },
    { name: 'Remo con mancuerna a una mano', muscles: ['dorsales'] },
    { name: 'Pullover en polea', muscles: ['dorsales'] },
    { name: 'Remo en máquina', muscles: ['dorsales', 'trapecio'] },
  ],
  trapecio: [
    { name: 'Encogimientos con mancuernas', muscles: ['trapecio'], key: true },
    { name: 'Face pull en polea', muscles: ['trapecio', 'hombros'], key: true },
    { name: 'Remo al mentón', muscles: ['trapecio', 'hombros'] },
  ],
  lumbares: [
    { name: 'Hiperextensiones', muscles: ['lumbares', 'gluteos'], key: true },
    { name: 'Peso muerto rumano', muscles: ['femorales', 'gluteos', 'lumbares'], key: true },
    { name: 'Buenos días con barra', muscles: ['lumbares', 'femorales'] },
  ],
  hombros: [
    { name: 'Press militar', muscles: ['hombros', 'triceps'], key: true },
    { name: 'Elevaciones laterales', muscles: ['hombros'], key: true },
    { name: 'Pájaros (deltoide posterior)', muscles: ['hombros', 'trapecio'] },
    { name: 'Elevaciones frontales', muscles: ['hombros'] },
    { name: 'Press Arnold', muscles: ['hombros'] },
  ],
  biceps: [
    { name: 'Curl con barra', muscles: ['biceps'], key: true },
    { name: 'Curl inclinado con mancuernas', muscles: ['biceps'], key: true },
    { name: 'Curl concentrado', muscles: ['biceps'] },
    { name: 'Curl en polea', muscles: ['biceps'] },
  ],
  triceps: [
    { name: 'Press francés', muscles: ['triceps'], key: true },
    { name: 'Extensión de tríceps en polea', muscles: ['triceps'], key: true },
    { name: 'Fondos en banco', muscles: ['triceps', 'pecho'] },
    { name: 'Patada de tríceps', muscles: ['triceps'] },
  ],
  antebrazos: [
    { name: 'Curl martillo', muscles: ['antebrazos', 'biceps'], key: true },
    { name: 'Curl de muñeca', muscles: ['antebrazos'], key: true },
    { name: 'Paseo del granjero', muscles: ['antebrazos', 'trapecio'] },
  ],
  abdominales: [
    { name: 'Elevación de piernas colgado', muscles: ['abdominales'], key: true },
    { name: 'Plancha', muscles: ['abdominales', 'oblicuos'], key: true },
    { name: 'Crunch en polea', muscles: ['abdominales'] },
    { name: 'Rueda abdominal', muscles: ['abdominales'] },
  ],
  oblicuos: [
    { name: 'Plancha lateral', muscles: ['oblicuos'], key: true },
    { name: 'Pallof press', muscles: ['oblicuos', 'abdominales'], key: true },
    { name: 'Russian twist', muscles: ['oblicuos'] },
  ],
  cuadriceps: [
    { name: 'Sentadilla', muscles: ['cuadriceps', 'gluteos'], key: true },
    { name: 'Prensa de piernas', muscles: ['cuadriceps', 'gluteos'], key: true },
    { name: 'Extensión de cuádriceps', muscles: ['cuadriceps'] },
    { name: 'Zancadas', muscles: ['cuadriceps', 'gluteos'] },
  ],
  femorales: [
    { name: 'Peso muerto rumano', muscles: ['femorales', 'gluteos', 'lumbares'], key: true },
    { name: 'Curl femoral', muscles: ['femorales'], key: true },
    { name: 'Buenos días con barra', muscles: ['femorales', 'lumbares'] },
  ],
  gluteos: [
    { name: 'Hip thrust', muscles: ['gluteos'], key: true },
    { name: 'Sentadilla búlgara', muscles: ['gluteos', 'cuadriceps'], key: true },
    { name: 'Patada de glúteo en polea', muscles: ['gluteos'] },
    { name: 'Abducción de cadera', muscles: ['gluteos'] },
  ],
  pantorrillas: [
    { name: 'Elevación de talones de pie', muscles: ['pantorrillas'], key: true },
    { name: 'Elevación de talones sentado', muscles: ['pantorrillas'], key: true },
  ],
};

/* ── Rutinas ──────────────────────────────────────────────────────────────────────── */

export type RoutineKind = 'fuerza' | 'cardio' | 'cerro';
export type Routine = {
  id: string;
  /** «D1»…«D6», «cerro»: el lugar en el plan de fábrica (vacío en las nuevas). */
  code: string;
  title: string;
  emoji: string;
  cover_url: string | null;
  kind: RoutineKind;
  /** Día masivo: con los masivos hechos la semana está cumplida (D1, D2, D3). */
  core: boolean;
  exercises: RoutineExercise[];
  full_minutes: number | null;
  short_minutes: number | null;
  notes: string;
  sort: number;
};
export type { Version } from './planData';
import type { Version } from './planData';
import { estimateMinutes, planOf, type PlanCtx } from './planData';
import { activePlanCtx } from './planCtx';

const xid = () => Math.random().toString(36).slice(2, 9);
const ex = (name: string, muscles: MuscleId[], key: boolean, sets: number, reps: string, rest = 90): RoutineExercise => ({ id: xid(), name, muscles, key, sets, reps, rest, weight: null });

type Seed = Omit<Routine, 'id' | 'sort'>;
/** El plan de 6 días de Emanuel (17 nov 2026). */
export const DEFAULT_ROUTINES: Seed[] = [
  {
    code: 'D1', title: 'Pecho a fondo', emoji: '🦍', cover_url: null, kind: 'fuerza', core: true, full_minutes: 75, short_minutes: 30,
    notes: 'Pecho a fondo, con algo de espalda y abdomen.',
    exercises: [
      ex('Press banca con barra', ['pecho', 'triceps', 'hombros'], true, 4, '8-10', 120),
      ex('Press inclinado con mancuernas', ['pecho', 'hombros'], true, 4, '10', 90),
      ex('Aperturas en polea', ['pecho'], false, 3, '12-15', 60),
      ex('Fondos en paralelas', ['pecho', 'triceps'], false, 3, '10', 90),
      ex('Remo con barra', ['dorsales', 'trapecio', 'biceps'], true, 3, '10', 90),
      ex('Elevación de piernas colgado', ['abdominales'], true, 3, '12', 60),
      ex('Plancha', ['abdominales', 'oblicuos'], false, 3, '45 s', 45),
    ],
  },
  {
    code: 'D2', title: 'Hombro a fondo + brazos cortos', emoji: '🦾', cover_url: null, kind: 'fuerza', core: true, full_minutes: 90, short_minutes: 30,
    notes: 'Día largo: hombro a fondo, bíceps y tríceps cortos, y antebrazo.',
    exercises: [
      ex('Press militar', ['hombros', 'triceps'], true, 4, '8', 120),
      ex('Elevaciones laterales', ['hombros'], true, 4, '12-15', 60),
      ex('Face pull en polea', ['trapecio', 'hombros'], false, 3, '15', 60),
      ex('Pájaros (deltoide posterior)', ['hombros', 'trapecio'], false, 3, '12', 60),
      ex('Encogimientos con mancuernas', ['trapecio'], false, 3, '12', 60),
      ex('Curl con barra', ['biceps'], true, 3, '10', 75),
      ex('Press francés', ['triceps'], true, 3, '10', 75),
      ex('Curl martillo', ['antebrazos', 'biceps'], false, 3, '12', 60),
      ex('Curl de muñeca', ['antebrazos'], false, 3, '15', 45),
    ],
  },
  {
    code: 'D3', title: 'Pierna completa', emoji: '🦵', cover_url: null, kind: 'fuerza', core: true, full_minutes: 90, short_minutes: 30,
    notes: 'Cuádriceps, femorales, glúteos y pantorrillas.',
    exercises: [
      ex('Sentadilla', ['cuadriceps', 'gluteos'], true, 4, '8', 150),
      ex('Peso muerto rumano', ['femorales', 'gluteos', 'lumbares'], true, 4, '10', 120),
      ex('Hip thrust', ['gluteos'], true, 3, '10', 90),
      ex('Prensa de piernas', ['cuadriceps', 'gluteos'], false, 3, '12', 90),
      ex('Curl femoral', ['femorales'], false, 3, '12', 60),
      ex('Sentadilla búlgara', ['gluteos', 'cuadriceps'], false, 3, '10', 75),
      ex('Extensión de cuádriceps', ['cuadriceps'], false, 3, '15', 60),
      ex('Elevación de talones de pie', ['pantorrillas'], true, 4, '15', 45),
      ex('Elevación de talones sentado', ['pantorrillas'], false, 3, '15', 45),
    ],
  },
  {
    code: 'D4', title: 'Cardio + abdominales', emoji: '🔥', cover_url: null, kind: 'cardio', core: false, full_minutes: 30, short_minutes: 30,
    notes: '30 minutos: cardio y abdominales.',
    exercises: [
      ex('Cardio (trote, bici o escaladora)', [], true, 1, '20 min', 0),
      ex('Elevación de piernas colgado', ['abdominales'], true, 3, '12', 45),
      ex('Plancha lateral', ['oblicuos'], false, 3, '30 s por lado', 30),
      ex('Russian twist', ['oblicuos'], false, 3, '20', 30),
    ],
  },
  {
    code: 'D5', title: 'Espalda a fondo + pecho', emoji: '🐺', cover_url: null, kind: 'fuerza', core: false, full_minutes: 75, short_minutes: 30,
    notes: 'Al revés del D1: espalda a fondo y algo de pecho.',
    exercises: [
      ex('Dominadas o jalón al pecho', ['dorsales', 'biceps'], true, 4, '8-10', 120),
      ex('Remo con barra', ['dorsales', 'trapecio', 'biceps'], true, 4, '10', 90),
      ex('Remo con mancuerna a una mano', ['dorsales'], false, 3, '10', 75),
      ex('Pullover en polea', ['dorsales'], false, 3, '12', 60),
      ex('Hiperextensiones', ['lumbares', 'gluteos'], false, 3, '15', 60),
      ex('Press banca con barra', ['pecho', 'triceps', 'hombros'], true, 3, '10', 90),
      ex('Press inclinado con mancuernas', ['pecho', 'hombros'], false, 3, '10', 90),
    ],
  },
  {
    code: 'D6', title: 'Brazos (corto)', emoji: '💪', cover_url: null, kind: 'fuerza', core: false, full_minutes: 45, short_minutes: 30,
    notes: 'Corto: bíceps, tríceps y antebrazo.',
    exercises: [
      ex('Curl con barra', ['biceps'], true, 3, '10', 60),
      ex('Press francés', ['triceps'], true, 3, '10', 60),
      ex('Curl inclinado con mancuernas', ['biceps'], false, 3, '12', 60),
      ex('Extensión de tríceps en polea', ['triceps'], false, 3, '12', 60),
      ex('Curl martillo', ['antebrazos', 'biceps'], true, 3, '12', 45),
    ],
  },
  {
    code: 'cerro', title: 'Cerro / descanso activo', emoji: '⛰️', cover_url: null, kind: 'cerro', core: false, full_minutes: 90, short_minutes: 45,
    notes: 'Subir el cerro a tu ritmo. Cuenta como descanso activo.',
    exercises: [ex('Subir el cerro', ['cuadriceps', 'gluteos', 'pantorrillas'], true, 1, 'a tu ritmo', 0)],
  },
];

/** La versión corta = solo los ⭐ clave. */
/** La versión `v` de una rutina (MOD 06: calculada, la rutina no cambia). Usa el contexto de la evaluación si no se pasa uno. */
export const exercisesOf = (r: Pick<Routine, 'exercises'>, v: Version, ctx: PlanCtx = activePlanCtx) => planOf(r.exercises, v, ctx);
/** Minutos de una versión: la estimación del motor escalada a los minutos que le pusiste a la completa (MOD 06). */
export const minutesFor = (r: Pick<Routine, 'exercises' | 'full_minutes'>, v: Version) => {
  const full = estimateMinutes(exercisesOf(r, 'completa'));
  const est = estimateMinutes(exercisesOf(r, v));
  return Math.max(10, Math.round(((r.full_minutes ?? full) * est) / Math.max(1, full) / 5) * 5);
};

/* ── La semana: modalidades ───────────────────────────────────────────────────────── */

export type DayPlan = { routine: string | null; version: Version };
export type Mode = 'minimo' | 'semi' | 'pro' | 'express' | 'mixta' | 'descanso';
/** Dónde entrenas (MODIFICACIÓN 01, 17 nov): por ahora solo se elige y se guarda; la lógica de rutinas por lugar viene después. */
export type Place = 'casa' | 'aire_libre' | 'gimnasio';
export const PLACES: { id: Place; label: string; img: string; emoji: string }[] = [
  { id: 'casa', label: 'En casa', img: '/workout/casa.webp', emoji: '🏠' },
  { id: 'aire_libre', label: 'Al aire libre', img: '/workout/aire-libre.webp', emoji: '🌳' },
  { id: 'gimnasio', label: 'Gimnasio', img: '/workout/gimnasio.webp', emoji: '🏋️' },
];
export type Training = { mode?: Mode; week?: Record<string, DayPlan>; place?: Place };

export const MODES: { id: Mode; label: string; emoji: string; help: string }[] = [
  { id: 'minimo', label: 'Mínimo', emoji: '🛟', help: '3 días largos (los masivos). Con esto la semana está cumplida.' },
  { id: 'semi', label: 'Semi', emoji: '⚖️', help: '4 a 5 días.' },
  { id: 'pro', label: 'Pro', emoji: '🔥', help: '6 días cortos.' },
  { id: 'express', label: 'Express', emoji: '⚡', help: '30 minutos al día, solo lo clave.' },
  { id: 'mixta', label: 'Mixta', emoji: '🧩', help: 'Tú eliges cada día (ej. 5 días con dos de 30 min).' },
  { id: 'descanso', label: 'Semana sin entrenar', emoji: '🌿', help: 'También vale: descansar es parte del plan.' },
];

/** Arma la semana de una modalidad con las rutinas de fábrica (por su código D1…D6 / cerro). */
export function weekFor(mode: Mode, routines: Routine[]): Record<string, DayPlan> {
  const byCode = (c: string) => routines.find((r) => r.code === c)?.id ?? null;
  const d = (code: string | null, version: Version = 'completa'): DayPlan => ({ routine: code ? byCode(code) : null, version });
  const rest = d(null);
  const plans: Record<Exclude<Mode, 'mixta'>, DayPlan[]> = {
    minimo: [d('D1'), rest, d('D2'), rest, d('D3'), d('cerro'), rest],
    semi: [d('D1'), d('D2'), d('D3'), d('D4'), d('D5'), d('cerro'), rest],
    pro: [d('D1', 'corta'), d('D2', 'corta'), d('D3', 'corta'), d('D4', 'corta'), d('D5', 'corta'), d('D6', 'corta'), d('cerro')],
    express: [d('D1', 'corta'), d('D2', 'corta'), d('D3', 'corta'), d('D5', 'corta'), d('D6', 'corta'), rest, rest],
    descanso: [rest, rest, rest, rest, rest, rest, rest],
  };
  const list = mode === 'mixta' ? plans.semi : plans[mode];
  return Object.fromEntries(list.map((p, i) => [String(i), p]));
}

/* ── Registro: cada entreno terminado ─────────────────────────────────────────────── */

/**
 * Una serie anotada. `kind` (Workout Focus 2.0, 18 nov): 'warmup' = aproximación (no cuenta para músculos ni
 * fuerza), 'work' = efectiva (por defecto, también en registros antiguos), 'drop' = descarga / bajada de peso.
 * `rir` = repeticiones que quedaban en reserva (0 = al fallo). Todo opcional: los registros viejos siguen valiendo.
 */
export type SetKind = 'warmup' | 'work' | 'drop';
export type LoggedSet = { weight: number | null; reps: number | null; done: boolean; kind?: SetKind; rir?: number | null };
export const isWork = (s: LoggedSet) => s.kind !== 'warmup';
export type LoggedExercise = { name: string; muscles: MuscleId[]; key: boolean; sets: LoggedSet[] };
export type Feel = 'facil' | 'bien' | 'duro';
export type WorkoutLog = {
  id: string;
  routine_id: string | null;
  day: string;
  title: string;
  core: boolean;
  version: Version;
  exercises: LoggedExercise[];
  quality_done: number;
  quality_total: number;
  minutes: number | null;
  feel: Feel | null;
  notes: string;
  /** MOD 07: entreno de un plan experimental (no cuenta como «habitual» al comparar). */
  experiment_id?: string | null;
};

/** Fecha local «AAAA-MM-DD». */
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Lunes de la semana de `d`. */
export const mondayOf = (d = new Date()) => addDays(d, -((d.getDay() + 6) % 7));

/** Cuántas veces se trabajó cada músculo en los entrenos de los últimos 7 días (una vez por entreno). */
export function muscleCounts(logs: WorkoutLog[], today = new Date()): Record<string, number> {
  const from = isoDay(addDays(today, -6));
  const to = isoDay(today);
  const out: Record<string, number> = {};
  for (const l of logs) {
    if (l.day < from || l.day > to) continue;
    const hit = new Set<string>();
    for (const e of l.exercises) if (e.sets.some((s) => s.done && isWork(s))) e.muscles.forEach((m) => hit.add(m));
    hit.forEach((m) => (out[m] = (out[m] ?? 0) + 1));
  }
  return out;
}

/** Cómo va la semana (lunes a hoy). Nunca dice «fallaste»: el mínimo (3 masivos) ya es cumplida. */
export function weekStatus(logs: WorkoutLog[], mode: Mode | undefined, planned: number, today = new Date()) {
  const from = isoDay(mondayOf(today));
  const mine = logs.filter((l) => l.day >= from && l.day <= isoDay(today));
  const cores = new Set(mine.filter((l) => l.core).map((l) => l.routine_id ?? l.title)).size;
  const done = mine.length;
  if (mode === 'descanso') return { done, cores, met: true, text: '🌿 Semana de descanso: también vale. Recuperarse es entrenar.' };
  if (cores >= 3 || (planned && done >= planned)) return { done, cores, met: true, text: `✅ Semana cumplida${done > 3 ? ` y de sobra (${done} entrenos)` : ''}. ¡Bien hecho!` };
  const left = Math.max(0, 3 - cores);
  return { done, cores, met: false, text: done ? `💪 Vas ${done} ${done === 1 ? 'entreno' : 'entrenos'}. Con ${left} masivo${left === 1 ? '' : 's'} más tu semana queda cumplida.` : '🛟 Con los 3 días masivos (D1, D2, D3) tu semana ya está cumplida.' };
}

/** 📈 Fuerza: el mejor peso de cada ejercicio, esta semana vs. antes. */
export function strength(logs: WorkoutLog[], today = new Date()) {
  const from = isoDay(mondayOf(today));
  const best = new Map<string, { now: number; before: number; reps: number }>();
  for (const l of logs) {
    for (const e of l.exercises) {
      const top = Math.max(0, ...e.sets.filter((s) => s.done && s.weight && isWork(s)).map((s) => s.weight ?? 0));
      if (!top) continue;
      const b = best.get(e.name) ?? { now: 0, before: 0, reps: 0 };
      if (l.day >= from) {
        if (top > b.now) b.reps = e.sets.find((s) => s.weight === top)?.reps ?? 0;
        b.now = Math.max(b.now, top);
      } else b.before = Math.max(b.before, top);
      best.set(e.name, b);
    }
  }
  return [...best.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.now - b.before) - (a.now - a.before) || a.name.localeCompare(b.name, 'es'));
}

/** 🔁 La última vez que hiciste este ejercicio (para mostrarlo como referencia; nunca sube el peso solo). */
export function lastTime(logs: WorkoutLog[], name: string, before?: string): { day: string; sets: LoggedSet[] } | null {
  const key = name.trim().toLowerCase();
  for (const l of logs) {
    if (before && l.day > before) continue;
    const e = l.exercises.find((x) => x.name.trim().toLowerCase() === key);
    const sets = e?.sets.filter((s) => s.done && s.kind !== 'warmup') ?? [];
    if (sets.length) return { day: l.day, sets };
  }
  return null;
}

/* ── Datos ─────────────────────────────────────────────────────────────────────────── */

/** Entrenos que no se pudieron subir (sin conexión): quedan en el equipo y se suben solos al volver. */
const PENDING = (uid: string, space: string) => `wp-pending-logs:${uid}:${space}`;
const readPending = (k: string): Omit<WorkoutLog, 'id'>[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]');
  } catch {
    return [];
  }
};
const writePending = (k: string, v: Omit<WorkoutLog, 'id'>[]) => {
  try {
    if (v.length) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {}
};

const SEEDED = (space: string) => `workout-pro-de-fabrica:${space}`;
// Si dos pantallas abren Workout Pro a la vez la primera vez, el plan de fábrica se crea UNA sola vez.
const seeding = new Map<string, Promise<Routine[]>>();

export function useWorkoutPro() {
  const db = useDb();
  const { space, userId } = useSpace();
  const uid = userId ?? 'local';
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [training, setTraining] = useState<Training>({});
  const [body, setBody] = useState<'hombre' | 'mujer' | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    // Primero sube lo que quedó pendiente sin conexión.
    const pk = PENDING(uid, space);
    const waiting = readPending(pk);
    if (waiting.length) {
      const still: Omit<WorkoutLog, 'id'>[] = [];
      for (const p of waiting) if (!(await db.insert<WorkoutLog>('organiza_workout_logs', { ...p, space }))[0]) still.push(p);
      writePending(pk, still);
    }
    let r = await db.select<Routine>('organiza_routines', { space });
    let seeded = false;
    try {
      seeded = !!localStorage.getItem(SEEDED(space));
    } catch {}
    // La primera vez: el plan de fábrica (si borras todas, no vuelven).
    if (!r.length && !seeded) {
      const k = `${uid}:${space}`;
      if (!seeding.has(k)) seeding.set(k, db.insert<Routine>('organiza_routines', DEFAULT_ROUTINES.map((x, i) => ({ ...x, space, sort: i }))));
      r = [...(await seeding.get(k)!)];
    }
    try {
      localStorage.setItem(SEEDED(space), '1');
    } catch {}
    const l = await db.select<WorkoutLog>('organiza_workout_logs', { space });
    const [p] = await db.select<{ training?: Training; body?: string | null }>('organiza_prefs', { owner_id: uid });
    setRoutines(r.sort((a, b) => a.sort - b.sort));
    setLogs(l.sort((a, b) => (a.day < b.day ? 1 : -1)));
    let t = p?.training ?? {};
    // Sin semana armada: Semi con el plan de fábrica.
    if (!t.week && r.length) t = { mode: 'semi', week: weekFor('semi', r) };
    setTraining(t);
    setBody(p?.body === 'hombre' || p?.body === 'mujer' ? p.body : null);
    setReady(true);
  }, [db, space, uid]);
  useEffect(() => {
    load();
  }, [load]);

  const saveTraining = useCallback(async (t: Training) => {
    setTraining(t);
    await db.upsert('organiza_prefs', { owner_id: uid, training: t, updated_at: new Date().toISOString() }, 'owner_id');
  }, [db, uid]);

  const addRoutine = useCallback(async (p: Partial<Routine> = {}) => {
    const [made] = await db.insert<Routine>('organiza_routines', { space, code: '', title: 'Rutina nueva', emoji: '🏋️', kind: 'fuerza', core: false, exercises: [], full_minutes: 60, short_minutes: 30, notes: '', sort: routines.length, ...p });
    if (made) setRoutines((l) => [...l, made]);
    return made ?? null;
  }, [db, routines.length, space]);

  const patchRoutine = useCallback(async (id: string, p: Partial<Routine>) => {
    setRoutines((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_routines', { id }, { ...p, updated_at: new Date().toISOString() } as Record<string, unknown>);
  }, [db]);

  const removeRoutine = useCallback(async (id: string) => {
    setRoutines((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_routines', { id });
    // Los días que la tenían quedan en descanso.
    const week = Object.fromEntries(Object.entries(training.week ?? {}).map(([k, v]) => [k, v.routine === id ? { routine: null, version: v.version } : v]));
    await saveTraining({ ...training, week });
  }, [db, saveTraining, training]);

  /** Guarda un entreno. Sin conexión queda en el equipo (`pending: true`) y se sube solo la próxima vez. */
  const addLog = useCallback(async (p: Omit<WorkoutLog, 'id'>): Promise<{ log: WorkoutLog | null; pending: boolean }> => {
    const [made] = await db.insert<WorkoutLog>('organiza_workout_logs', { ...p, space }).catch(() => [] as WorkoutLog[]);
    if (made) {
      setLogs((l) => [made, ...l]);
      return { log: made, pending: false };
    }
    const pk = PENDING(uid, space);
    writePending(pk, [...readPending(pk), p]);
    setLogs((l) => [{ ...p, id: `pendiente-${Date.now()}` } as WorkoutLog, ...l]);
    return { log: null, pending: true };
  }, [db, space, uid]);

  const removeLog = useCallback(async (id: string) => {
    setLogs((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_workout_logs', { id });
  }, [db]);

  const counts = useMemo(() => muscleCounts(logs), [logs]);
  return { routines, logs, training, body, ready, counts, saveTraining, addRoutine, patchRoutine, removeRoutine, addLog, removeLog, reload: load };
}
export type WorkoutApi = ReturnType<typeof useWorkoutPro>;
