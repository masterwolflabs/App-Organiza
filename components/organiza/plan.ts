'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * Alimentación y Entrenamiento (Emanuel, 2026-11-03): Organiza no da pautas, organiza lo que vas a
 * comer y entrenar. Cada fila es un plato o una sesión en un día (0 = lunes) y un momento («slot»).
 * Tablas: organiza_meals, organiza_workouts y organiza_nutrition (metas), docs/sql/34.
 */

export type Ingredient = { name: string; qty: string };
export type Meal = {
  id: string;
  weekday: number;
  slot: string;
  sort: number;
  title: string;
  cover_url: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  ingredients: Ingredient[];
  steps: string;
  fast_hours: number | null;
  notes: string;
};

export type Exercise = { name: string; sets: string; reps: string; weight: string; rest: string };
export type Workout = {
  id: string;
  weekday: number;
  slot: string;
  sort: number;
  title: string;
  cover_url: string | null;
  muscles: string[];
  exercises: Exercise[];
  minutes: number | null;
  kcal: number | null;
  notes: string;
};

export type PlanKind = 'meals' | 'workouts';
export const TABLE: Record<PlanKind, string> = { meals: 'organiza_meals', workouts: 'organiza_workouts' };

export const MEAL_SLOTS = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'colacion-am', label: 'Colación AM', emoji: '🍎' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍽️' },
  { id: 'colacion-pm', label: 'Colación PM', emoji: '🥜' },
  { id: 'cena', label: 'Cena', emoji: '🌙' },
  { id: 'ayuno', label: 'Ayuno', emoji: '⏳' },
];
export const WORKOUT_SLOTS = [
  { id: 'sesion-1', label: 'Sesión 1', emoji: '🏋️' },
  { id: 'sesion-2', label: 'Sesión 2', emoji: '🏃' },
];
export const MUSCLES = ['Pecho', 'Espalda', 'Hombros', 'Brazos', 'Piernas', 'Glúteos', 'Core', 'Cardio', 'Cuerpo completo', 'Movilidad'];

export type Goals = { kcal?: number; protein?: number; carbs?: number; fat?: number };
export const sum = (list: Meal[], k: 'kcal' | 'protein' | 'carbs' | 'fat') => list.reduce((s, m) => s + (Number(m[k]) || 0), 0);

/** Qué momento corresponde a una acción del Horario por su nombre («Desayuno» → desayuno). */
export function slotFor(title: string): string | null {
  const t = title.toLowerCase();
  if (/desayun/.test(t)) return 'desayuno';
  if (/almuerz/.test(t)) return 'almuerzo';
  if (/cena|comida de la noche/.test(t)) return 'cena';
  if (/colaci|snack|merienda|once/.test(t)) return null;
  return null;
}

/** Filas de una semana (platos o sesiones) de la base actual (Persona / Empresa). */
export function usePlan<T extends { id: string; weekday: number; slot: string; sort: number }>(kind: PlanKind) {
  const db = useDb();
  const { space } = useSpace();
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const r = await db.select<T>(TABLE[kind], { space });
    setRows(r.sort((a, b) => a.weekday - b.weekday || a.sort - b.sort));
    setReady(true);
  }, [db, kind, space]);
  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (weekday: number, slot: string, p: Partial<T> = {}) => {
    const sort = rows.filter((x) => x.weekday === weekday && x.slot === slot).length;
    const [made] = await db.insert<T>(TABLE[kind], { space, weekday, slot, sort, ...p });
    if (made) setRows((l) => [...l, made]);
    return made ?? null;
  }, [db, kind, rows, space]);

  const patch = useCallback(async (id: string, p: Partial<T>) => {
    setRows((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update(TABLE[kind], { id }, p as Record<string, unknown>);
  }, [db, kind]);

  const remove = useCallback(async (id: string) => {
    setRows((l) => l.filter((x) => x.id !== id));
    await db.remove(TABLE[kind], { id });
  }, [db, kind]);

  /** Copia una fila a otros días (mismo momento), sin repetir donde ya hay una igual. */
  const copyTo = useCallback(async (id: string, days: number[]) => {
    const src = rows.find((x) => x.id === id);
    if (!src) return;
    const { id: _id, weekday: _w, sort: _s, ...rest } = src as T & Record<string, unknown>;
    for (const d of days) {
      if (d === src.weekday) continue;
      if (rows.some((x) => x.weekday === d && x.slot === src.slot && (x as unknown as { title: string }).title === (src as unknown as { title: string }).title)) continue;
      await add(d, src.slot, rest as Partial<T>);
    }
  }, [add, rows]);

  return { rows, ready, add, patch, remove, copyTo, reload: load };
}

/** Metas diarias de comida. */
export function useNutrition() {
  const db = useDb();
  const { space } = useSpace();
  const [goals, setGoals] = useState<Goals>({});
  useEffect(() => {
    db.select<{ goals: Goals }>('organiza_nutrition', { space }).then((r) => setGoals(r[0]?.goals ?? {}));
  }, [db, space]);
  const save = useCallback(async (g: Goals) => {
    setGoals(g);
    await db.upsert('organiza_nutrition', { space, goals: g }, 'owner_id,space');
  }, [db, space]);
  return { goals, save };
}
