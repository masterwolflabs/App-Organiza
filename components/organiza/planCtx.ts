'use client';

import { useMemo } from 'react';
import { allAnswers, useAssessment } from '@/components/organiza/assessmentData';
import type { Experience, PlanCtx } from '@/components/organiza/planData';

/**
 * 🧩 Contexto de la planificación (MOD 06): prioridades, experiencia y equipo, sacados de la evaluación de Workout Pro.
 * Sin evaluación → contexto vacío (los principales son los ⭐ de la rutina y no hay avisos de equipo).
 * `activePlanCtx` es el último contexto conocido, para que `exercisesOf` lo use sin pasarlo por cada componente.
 */
const PRIORITY: Record<string, string[]> = {
  pecho: ['pecho'], espalda: ['dorsales', 'trapecio'], hombros: ['hombros'], brazos: ['biceps', 'triceps'],
  abdomen: ['abdominales', 'oblicuos'], gluteos: ['gluteos'], piernas: ['cuadriceps', 'femorales'],
};
const EQUIP: Record<string, string[]> = {
  mancuernas: ['mancuernas'], kettlebell: ['kettlebell'], bandas: [], barra_dominadas: ['barra_dominadas'], banco: ['banco'],
  colchoneta: [], cuerda: [], barras_parque: ['barra_dominadas', 'paralelas'], escaleras: [], pista: [],
  pesas_libres: ['barra', 'mancuernas', 'banco'], maquinas: ['maquinas'], poleas: ['poleas'], rack: ['barra'], cardio: [],
};

export let activePlanCtx: PlanCtx = {};

export function usePlanCtx(): PlanCtx {
  const a = useAssessment();
  const ctx = useMemo<PlanCtx>(() => {
    const all = allAnswers(a.state);
    const pr = Array.isArray(all.prioridades) ? (all.prioridades as string[]).filter((x) => x !== 'ninguno').flatMap((x) => PRIORITY[x] ?? []) : [];
    const exp = typeof all.experiencia === 'string' && ['principiante', 'intermedio', 'avanzado'].includes(all.experiencia) ? (all.experiencia as Experience) : null;
    const lugar = all.lugar;
    const marked = (lugar === 'casa' ? all.equipo_casa : lugar === 'aire_libre' ? all.equipo_aire_libre : lugar === 'gimnasio' ? all.equipo_gimnasio : null) as string[] | null | undefined;
    // Gimnasio «completo» o sin datos de equipo → no se sabe: sin avisos (no se adivina).
    const equipment = !Array.isArray(marked) || !marked.length || marked.includes('completo') ? null : [...new Set(marked.flatMap((x) => EQUIP[x] ?? []))];
    return { priorities: pr, experience: exp, equipment };
  }, [a.state]);
  activePlanCtx = ctx;
  return ctx;
}
