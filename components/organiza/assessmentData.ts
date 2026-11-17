'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * 🧪 Motor de la evaluación personalizada de Workout Pro (MODIFICACIÓN 04, 2026-11-17).
 *
 * Las preguntas son DATOS (`QUESTIONS`): se agregan, quitan, cambian o reordenan en esa lista sin tocar la
 * pantalla (`Assessment.tsx`). Dos niveles: 'basica' (la primera, corta) y 'avanzada' (opcional).
 * Las respuestas se guardan en `organiza_prefs.assessment` (SQL 49), básica y avanzada por separado, y además
 * en el navegador al instante para no perder nada si se cierra antes de que llegue a la nube.
 *
 * ⚠️ Las preguntas de abajo son PROVISIONALES (solo para probar el motor). El repertorio definitivo lo entrega
 * Emanuel; al reemplazarlo, sube `QUESTIONS_VERSION`.
 */

export type Level = 'basica' | 'avanzada';
export type QType = 'single' | 'multi' | 'text' | 'number' | 'scale';
/** Para la pantalla de resultados: en qué parte del perfil cae la respuesta. */
export type Section = 'objetivos' | 'experiencia' | 'disponibilidad' | 'equipamiento' | 'salud' | 'fisico' | 'preferencias' | 'habitos';

export type Option = { id: string; label: string; emoji?: string; help?: string };

/** Condición para mostrar una pregunta según otra respuesta. */
export type Condition =
  | { q: string; equals?: string | string[]; includes?: string; gte?: number; lte?: number; answered?: boolean }
  | { all: Condition[] }
  | { any: Condition[] };

export type Question = {
  id: string;
  level: Level;
  section: Section;
  /** Lo que se lee en pantalla. */
  title: string;
  /** Explicación corta debajo (opcional). */
  help?: string;
  /** Lo que dice la voz de entrenador (si falta, lee el título). */
  say?: string;
  type: QType;
  options?: Option[];
  required: boolean;
  /** Número: rango y unidad. Escala: min/max con etiquetas en los extremos. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  minLabel?: string;
  maxLabel?: string;
  placeholder?: string;
  /** Se puede responder hablando (por defecto sí). */
  voice?: boolean;
  showIf?: Condition;
};

export type Answer = string | string[] | number | null;
export type Answers = Record<string, Answer>;
export type LevelState = { answers: Answers; step: number; done_at: string | null; updated_at: string | null };
export type AssessmentState = { version: string; basica: LevelState; avanzada: LevelState };

export const QUESTIONS_VERSION = 'provisional-1';
export const PROVISIONAL = QUESTIONS_VERSION.startsWith('provisional');

export const SECTION_LABEL: Record<Section, string> = {
  objetivos: '🎯 Objetivos',
  experiencia: '🏅 Experiencia',
  disponibilidad: '🗓️ Disponibilidad',
  equipamiento: '🏋️ Lugar y equipamiento',
  salud: '🩹 Lesiones y limitaciones',
  fisico: '📏 Características físicas',
  preferencias: '💪 Preferencias',
  habitos: '😴 Recuperación y hábitos',
};

/* ── Preguntas PROVISIONALES (para probar el motor; no son la evaluación real) ──────────── */

export const QUESTIONS: Question[] = [
  // Básica
  {
    id: 'objetivo', level: 'basica', section: 'objetivos', type: 'single', required: true,
    title: '¿Cuál es tu objetivo principal?',
    say: '¡Partamos! Cuéntame, ¿cuál es tu objetivo principal?',
    options: [
      { id: 'musculo', label: 'Ganar músculo', emoji: '💪' },
      { id: 'grasa', label: 'Bajar grasa', emoji: '🔥' },
      { id: 'salud', label: 'Salud y energía', emoji: '❤️' },
      { id: 'rendimiento', label: 'Rendimiento deportivo', emoji: '🏃' },
    ],
  },
  {
    id: 'experiencia', level: 'basica', section: 'experiencia', type: 'single', required: true,
    title: '¿Cuánta experiencia tienes entrenando?',
    say: 'Muy bien. ¿Cuánta experiencia tienes entrenando?',
    options: [
      { id: 'nueva', label: 'Estoy empezando', emoji: '🌱' },
      { id: 'media', label: 'Algo de experiencia', emoji: '⚡' },
      { id: 'alta', label: 'Entreno hace años', emoji: '🏆' },
    ],
  },
  {
    id: 'lugar', level: 'basica', section: 'equipamiento', type: 'single', required: true,
    title: '¿Dónde vas a entrenar?',
    say: '¿Y dónde vas a entrenar?',
    options: [
      { id: 'casa', label: 'En casa', emoji: '🏠' },
      { id: 'aire_libre', label: 'Al aire libre', emoji: '🌳' },
      { id: 'gimnasio', label: 'Gimnasio', emoji: '🏋️' },
    ],
  },
  {
    id: 'equipo_casa', level: 'basica', section: 'equipamiento', type: 'multi', required: false,
    title: '¿Qué tienes en casa?',
    help: 'Marca todo lo que tengas. Si no tienes nada, sigue: también se entrena con el cuerpo.',
    say: '¿Qué equipamiento tienes en casa? Marca todo lo que tengas.',
    showIf: { q: 'lugar', equals: 'casa' },
    options: [
      { id: 'mancuernas', label: 'Mancuernas', emoji: '🏋️' },
      { id: 'bandas', label: 'Bandas elásticas', emoji: '🎗️' },
      { id: 'barra', label: 'Barra de dominadas', emoji: '🪜' },
      { id: 'colchoneta', label: 'Colchoneta', emoji: '🧘' },
    ],
  },
  {
    id: 'dias', level: 'basica', section: 'disponibilidad', type: 'number', required: true, min: 1, max: 7, step: 1, unit: 'días',
    title: '¿Cuántos días a la semana puedes entrenar?',
    say: '¡Vamos! Cuéntame, ¿cuántos días a la semana puedes entrenar?',
  },
  {
    id: 'minutos', level: 'basica', section: 'disponibilidad', type: 'single', required: true,
    title: '¿Cuánto tiempo tienes por sesión?',
    say: '¿Y cuánto tiempo tienes por sesión?',
    options: [
      { id: '30', label: '30 minutos', emoji: '⚡' },
      { id: '60', label: '1 hora', emoji: '⏱️' },
      { id: '90', label: '1 hora y media o más', emoji: '🔥' },
    ],
  },
  {
    id: 'lesiones', level: 'basica', section: 'salud', type: 'single', required: true,
    title: '¿Tienes alguna lesión o limitación física?',
    say: 'Importante: ¿tienes alguna lesión o limitación física?',
    options: [
      { id: 'no', label: 'No', emoji: '✅' },
      { id: 'si', label: 'Sí', emoji: '🩹' },
    ],
  },
  {
    id: 'lesiones_detalle', level: 'basica', section: 'salud', type: 'text', required: true,
    title: 'Cuéntame cuál',
    help: 'Escríbelo o dilo con tu voz. Ej.: «me duele la rodilla derecha al bajar».',
    say: 'Cuéntame un poco más. ¿Qué te pasa?',
    placeholder: 'Ej.: rodilla derecha, espalda baja…',
    showIf: { q: 'lesiones', equals: 'si' },
  },
  // Avanzada
  {
    id: 'peso', level: 'avanzada', section: 'fisico', type: 'number', required: false, min: 30, max: 250, step: 0.5, unit: 'kg',
    title: '¿Cuánto pesas?', say: 'Vamos con algunos datos físicos. ¿Cuánto pesas?',
  },
  {
    id: 'estatura', level: 'avanzada', section: 'fisico', type: 'number', required: false, min: 120, max: 230, step: 1, unit: 'cm',
    title: '¿Cuánto mides?', say: '¿Y cuánto mides?',
  },
  {
    id: 'historial', level: 'avanzada', section: 'experiencia', type: 'text', required: false,
    title: '¿Cómo ha sido tu historial de entrenamiento?',
    help: 'Deportes, gimnasio, pausas largas… lo que quieras contar.',
    say: 'Cuéntame tu historia. ¿Cómo ha sido tu entrenamiento hasta ahora?',
  },
  {
    id: 'musculos', level: 'avanzada', section: 'preferencias', type: 'multi', required: false,
    title: '¿Qué músculos quieres priorizar?',
    say: '¿Hay músculos que quieras priorizar?',
    options: [
      { id: 'pecho', label: 'Pecho', emoji: '🦍' },
      { id: 'espalda', label: 'Espalda', emoji: '🐺' },
      { id: 'brazos', label: 'Brazos', emoji: '💪' },
      { id: 'piernas', label: 'Piernas', emoji: '🦵' },
      { id: 'abdomen', label: 'Abdomen', emoji: '🔥' },
    ],
  },
  {
    id: 'sueno', level: 'avanzada', section: 'habitos', type: 'scale', required: false, min: 1, max: 5,
    minLabel: 'Duermo mal', maxLabel: 'Duermo excelente',
    title: '¿Cómo es tu descanso?', say: 'Última. Del uno al cinco, ¿cómo es tu descanso?',
  },
];

/* ── Motor ───────────────────────────────────────────────────────────────────────── */

export function meets(c: Condition | undefined, a: Answers): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => meets(x, a));
  if ('any' in c) return c.any.some((x) => meets(x, a));
  const v = a[c.q];
  if (c.answered !== undefined) return c.answered === isAnswered(v);
  if (c.equals !== undefined) {
    const want = Array.isArray(c.equals) ? c.equals : [c.equals];
    return typeof v === 'string' && want.includes(v);
  }
  if (c.includes !== undefined) return Array.isArray(v) && v.includes(c.includes);
  if (c.gte !== undefined && !(typeof v === 'number' && v >= c.gte)) return false;
  if (c.lte !== undefined && !(typeof v === 'number' && v <= c.lte)) return false;
  return true;
}

export const isAnswered = (v: Answer | undefined) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Las preguntas de un nivel que corresponden con lo que respondiste (las condicionales aparecen o se van solas). */
export const visibleQuestions = (level: Level, a: Answers, list = QUESTIONS) => list.filter((q) => q.level === level && meets(q.showIf, a));

export function valid(q: Question, v: Answer | undefined): boolean {
  if (!isAnswered(v)) return !q.required;
  if (q.type === 'number' || q.type === 'scale') return typeof v === 'number' && (q.min === undefined || v >= q.min) && (q.max === undefined || v <= q.max);
  return true;
}

export function answerLabel(q: Question, v: Answer | undefined): string {
  if (!isAnswered(v)) return '—';
  if (q.type === 'single') return q.options?.find((o) => o.id === v)?.label ?? String(v);
  if (q.type === 'multi') return (v as string[]).map((id) => q.options?.find((o) => o.id === id)?.label ?? id).join(', ');
  if (q.type === 'number') return `${String(v).replace('.', ',')}${q.unit ? ` ${q.unit}` : ''}`;
  if (q.type === 'scale') return `${v} de ${q.max ?? 5}`;
  return String(v);
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const WORDS: Record<string, number> = { cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Número dicho («cuatro días», «72,5») → 4 / 72.5. */
export function numberFromSpeech(t: string): number | null {
  const m = t.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (m) return Number(m[0]);
  for (const w of norm(t).split(' ')) if (w in WORDS) return WORDS[w];
  return null;
}

/** Opciones que calzan con lo dicho («gimnasio», «quiero bajar grasa»). */
export function optionsFromSpeech(q: Question, t: string): string[] {
  const said = ` ${norm(t)} `;
  return (q.options ?? [])
    .filter((o) => {
      const words = norm(o.label).split(' ').filter((w) => w.length > 3);
      return said.includes(` ${norm(o.label)} `) || (words.length > 0 && words.some((w) => said.includes(w)));
    })
    .map((o) => o.id);
}

/* ── Guardado ────────────────────────────────────────────────────────────────────── */

const empty = (): LevelState => ({ answers: {}, step: 0, done_at: null, updated_at: null });
const fresh = (): AssessmentState => ({ version: QUESTIONS_VERSION, basica: empty(), avanzada: empty() });
const LOCAL = (uid: string) => `wp-assessment:${uid}`;
const newer = (a: LevelState | undefined, b: LevelState | undefined) => ((a?.updated_at ?? '') >= (b?.updated_at ?? '') ? a : b) ?? empty();

/** Estado de la evaluación de la persona: lo más nuevo entre la nube y este navegador, guardado al tiro en ambos. */
export function useAssessment() {
  const db = useDb();
  const { userId } = useSpace();
  const uid = userId ?? 'local';
  const [state, setState] = useState<AssessmentState>(fresh);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);

  useEffect(() => {
    let on = true;
    (async () => {
      let local: Partial<AssessmentState> = {};
      try {
        local = JSON.parse(localStorage.getItem(LOCAL(uid)) ?? '{}');
      } catch {}
      let cloud: Partial<AssessmentState> = {};
      try {
        const [p] = await db.select<{ assessment?: Partial<AssessmentState> }>('organiza_prefs', { owner_id: uid });
        cloud = p?.assessment ?? {};
      } catch {}
      if (!on) return;
      const s: AssessmentState = { version: QUESTIONS_VERSION, basica: newer(cloud.basica, local.basica), avanzada: newer(cloud.avanzada, local.avanzada) };
      latest.current = s;
      setState(s);
      setReady(true);
    })();
    return () => { on = false; };
  }, [db, uid]);

  const push = useCallback(async () => {
    setSaving('saving');
    try {
      const ok = await db.upsert('organiza_prefs', { owner_id: uid, assessment: latest.current, updated_at: new Date().toISOString() }, 'owner_id');
      setSaving(ok ? 'saved' : 'error');
    } catch {
      setSaving('error');
    }
  }, [db, uid]);

  const save = useCallback((level: Level, patch: Partial<LevelState>, now = false) => {
    const s: AssessmentState = { ...latest.current, version: QUESTIONS_VERSION, [level]: { ...latest.current[level], ...patch, updated_at: new Date().toISOString() } };
    latest.current = s;
    setState(s);
    try {
      localStorage.setItem(LOCAL(uid), JSON.stringify(s));
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    if (now) push();
    else timer.current = setTimeout(push, 700);
  }, [push, uid]);

  // Al cerrar o cambiar de pestaña: que lo pendiente salga a la nube.
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        push();
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [push]);

  const reset = useCallback((level: Level) => save(level, { answers: {}, step: 0, done_at: null }, true), [save]);
  return { state, ready, saving, save, reset };
}
export type AssessmentApi = ReturnType<typeof useAssessment>;
