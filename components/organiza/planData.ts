/**
 * 🧩 Planificación adaptable de Workout Pro (MODIFICACIÓN 06, Emanuel 2026-11-18) — solo cálculos, sin React.
 * Cada versión se CALCULA desde la rutina: nunca se guarda ni cambia la rutina original.
 *
 * Principal vs complementario (con su porqué): ⭐ clave de la rutina, o trabaja como músculo principal una de tus
 * prioridades (evaluación). Con menos tiempo se recortan PRIMERO los complementarios y luego el volumen; el
 * calentamiento (series de aproximación del Focus) y la técnica no se recortan nunca.
 * El id 'corta' se mantiene (semanas ya guardadas) y se muestra como «Express».
 */
import type { RoutineExercise } from './workoutData';

export type Version = 'completa' | 'reducida' | 'corta' | 'mantenimiento' | 'desarrollo' | 'recuperacion';
export const VERSIONS: { id: Version; label: string; emoji: string; help: string }[] = [
  { id: 'completa', label: 'Completa', emoji: '🏋️', help: 'Toda la rutina, tal como la armaste.' },
  { id: 'reducida', label: 'Reducida', emoji: '✂️', help: 'Todos los principales y la mitad de los complementarios, con una serie menos en estos.' },
  { id: 'corta', label: 'Express', emoji: '⚡', help: 'Solo los principales, máximo 3 series. Para cuando hay poco tiempo.' },
  { id: 'mantenimiento', label: 'Mantenimiento', emoji: '🛟', help: 'El mínimo que conserva lo logrado: principales con menos series, sin ir al fallo.' },
  { id: 'desarrollo', label: 'Desarrollo', emoji: '📈', help: 'Toda la rutina con una serie más en tus músculos prioritarios.' },
  { id: 'recuperacion', label: 'Recuperación', emoji: '🌿', help: 'Solo principales, 2 series livianas y lejos del fallo. Para días de cansancio o después de mucha actividad.' },
];
export const versionLabel = (v: Version | string) => VERSIONS.find((x) => x.id === v) ?? VERSIONS[0];

export type Experience = 'principiante' | 'intermedio' | 'avanzado';
export type PlanCtx = {
  /** Músculos prioritarios (ids de Workout Pro), de la evaluación. */
  priorities?: string[];
  experience?: Experience | null;
  /** Equipo disponible en palabras clave (barra, mancuernas, poleas, maquinas, banco, kettlebell, barra_dominadas, paralelas). null = no se sabe / gimnasio completo. */
  equipment?: string[] | null;
};

export type Role = 'principal' | 'complementario';
export type PlannedExercise = RoutineExercise & { role: Role; why: string; baseSets: number; intensity?: string; warn?: string };

const NEEDS: [RegExp, string, string][] = [
  [/\bbarra\b(?! de dominadas)/i, 'barra', 'una barra'],
  [/mancuerna/i, 'mancuernas', 'mancuernas'],
  [/polea|face pull/i, 'poleas', 'una polea'],
  [/m[aá]quina|prensa|extensi[oó]n de cu[aá]driceps|curl femoral/i, 'maquinas', 'una máquina'],
  [/paralelas|fondos/i, 'paralelas', 'paralelas'],
  [/dominada|colgado/i, 'barra_dominadas', 'una barra de dominadas'],
  [/kettlebell/i, 'kettlebell', 'una kettlebell'],
];

const MUSCLE_ES: Record<string, string> = { pecho: 'pecho', hombros: 'hombros', biceps: 'bíceps', triceps: 'tríceps', antebrazos: 'antebrazos', trapecio: 'trapecio', dorsales: 'espalda', lumbares: 'espalda baja', abdominales: 'abdomen', oblicuos: 'oblicuos', gluteos: 'glúteos', cuadriceps: 'cuádriceps', femorales: 'femorales', pantorrillas: 'pantorrillas' };

/** Principal o complementario, con el porqué y avisos de equipo (no se quita nada: se avisa). */
export function classify(list: RoutineExercise[], ctx: PlanCtx = {}): PlannedExercise[] {
  const pri = new Set(ctx.priorities ?? []);
  return list.map((e) => {
    const primary = e.muscles[0];
    const isPriority = !!primary && pri.has(primary);
    const role: Role = e.key || isPriority ? 'principal' : 'complementario';
    const why = e.key
      ? `⭐ Ejercicio clave de la rutina${isPriority ? ` y trabaja ${MUSCLE_ES[primary] ?? primary}, tu prioridad` : ''}.`
      : isPriority
        ? `Trabaja ${MUSCLE_ES[primary] ?? primary}, que marcaste como prioridad.`
        : `Complementario: detalle de ${MUSCLE_ES[primary] ?? primary ?? 'la rutina'}.`;
    const missing = ctx.equipment ? NEEDS.filter(([re, key]) => re.test(e.name) && !ctx.equipment!.includes(key)).map(([, , label]) => label) : [];
    return { ...e, role, why, baseSets: e.sets, warn: missing.length ? `Necesitas ${missing.join(' y ')} y no lo marcaste en tu equipo: cámbialo por una variante con lo que tengas.` : undefined };
  });
}

/** Una versión de la rutina (series ajustadas y qué se recortó). La rutina original no se toca. */
export function planOf(list: RoutineExercise[], v: Version, ctx: PlanCtx = {}): PlannedExercise[] {
  const all = classify(list, ctx);
  const main = all.filter((e) => e.role === 'principal');
  const comp = all.filter((e) => e.role === 'complementario');
  const pri = new Set(ctx.priorities ?? []);
  const keep = (ids: Set<string>) => all.filter((e) => ids.has(e.id));
  const ids = (l: PlannedExercise[]) => new Set(l.map((e) => e.id));
  // Si una rutina no tiene principales marcados, los 2 primeros hacen de principales en las versiones cortas.
  const core = main.length ? main : all.slice(0, 2);
  // En las versiones cortas, como máximo 4 principales (primero los ⭐ de la rutina): si todo es prioridad, nada lo es.
  const top = (n: number) => [...core].sort((a, b) => Number(b.key) - Number(a.key)).slice(0, n);

  if (v === 'completa') return all;
  if (v === 'reducida') {
    const half = comp.slice(0, Math.ceil(comp.length / 2));
    return keep(new Set([...ids(main), ...ids(half)])).map((e) => (e.role === 'complementario' ? { ...e, sets: Math.max(2, e.baseSets - 1) } : { ...e, sets: Math.min(4, e.baseSets) }));
  }
  if (v === 'corta') return keep(ids(top(4))).map((e) => ({ ...e, sets: Math.min(3, e.baseSets) }));
  if (v === 'mantenimiento') {
    // Principales con ~60 % de las series; un complementario solo si su músculo no lo cubre ningún principal.
    const base = top(5);
    const covered = new Set(base.flatMap((e) => e.muscles.slice(0, 1)));
    const extra = comp.filter((e) => e.muscles[0] && !covered.has(e.muscles[0]) && (covered.add(e.muscles[0]), true)).slice(0, 2);
    return keep(new Set([...ids(base), ...ids(extra)])).map((e) => ({ ...e, sets: Math.max(2, Math.ceil(e.baseSets * 0.6)), intensity: 'Deja 2–3 repeticiones en reserva' }));
  }
  if (v === 'desarrollo') {
    const beginner = ctx.experience === 'principiante';
    return all.map((e) => (!beginner && e.muscles[0] && pri.has(e.muscles[0]) ? { ...e, sets: Math.min(5, e.baseSets + 1), intensity: 'Deja 1–2 repeticiones en reserva' } : { ...e, intensity: 'Deja 1–2 repeticiones en reserva' }));
  }
  // recuperación
  return keep(ids(top(4))).map((e) => ({ ...e, sets: 2, intensity: 'Liviano: ~60–70 % de tu peso habitual, 3–4 repeticiones en reserva' }));
}

/** Minutos estimados: series × (descanso + ~40 s de trabajo) + 5 min de calentamiento. Es una estimación. */
export const estimateMinutes = (plan: Pick<RoutineExercise, 'sets' | 'rest'>[]) => Math.round(plan.reduce((a, e) => a + e.sets * ((e.rest || 60) + 40), 0) / 60 + 5);

/** Qué cambia respecto de la completa (para explicarlo en una línea). */
export function diffText(list: RoutineExercise[], v: Version, ctx: PlanCtx = {}): string {
  if (v === 'completa') return 'Sin cambios.';
  const full = classify(list, ctx);
  const p = planOf(list, v, ctx);
  const out = full.filter((e) => !p.some((x) => x.id === e.id)).length;
  const sFull = full.reduce((a, e) => a + e.sets, 0);
  const sNow = p.reduce((a, e) => a + e.sets, 0);
  const parts = [];
  if (out) parts.push(`${out} complementario${out === 1 ? '' : 's'} fuera`);
  if (sNow !== sFull) parts.push(`${sNow} series en vez de ${sFull}`);
  return parts.length ? `${parts.join(' · ')}.` : 'Mismos ejercicios y series.';
}
