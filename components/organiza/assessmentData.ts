'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * 🧪 Motor de la evaluación personalizada de Workout Pro (MODIFICACIÓN 04, 2026-11-17).
 *
 * Las preguntas son DATOS (`QUESTIONS`): se agregan, quitan, cambian o reordenan en esa lista sin tocar la
 * pantalla (`Assessment.tsx`). Tres niveles: 'basica' (la primera, corta), 'intermedia' y 'avanzada' (opcionales; no repiten lo respondido).
 * Las respuestas se guardan en `organiza_prefs.assessment` (SQL 49), básica y avanzada por separado, y además
 * en el navegador al instante para no perder nada si se cierra antes de que llegue a la nube.
 *
 * Nivel básico = el definitivo de Emanuel (17 nov). Intermedio: por diseñar. Avanzado: aún de prueba (`PROVISIONAL_LEVELS`).
 * Al cambiar preguntas, sube `QUESTIONS_VERSION`.
 */

export type Level = 'basica' | 'intermedia' | 'avanzada';
export const LEVELS: Level[] = ['basica', 'intermedia', 'avanzada'];
export type QType = 'single' | 'multi' | 'text' | 'number' | 'scale';
/** Para el perfil: en qué bloque cae la respuesta (en este orden se muestran). */
export type Section = 'objetivos' | 'experiencia' | 'equipamiento' | 'disponibilidad' | 'duracion' | 'prioridades' | 'salud' | 'alimentacion' | 'estilo' | 'ejercicios' | 'cardio' | 'habitos' | 'fisico';

/** `exclusive`: al marcarla se desmarcan las demás (ej. «Ninguna en especial»). */
export type Option = { id: string; label: string; emoji?: string; help?: string; exclusive?: boolean };

/**
 * Condición para mostrar una pregunta. Se mira contra TODAS las respuestas (de todos los niveles), así un nivel
 * puede saltarse lo ya respondido en otro (`{ q: 'x', answered: false }`).
 * `mentions`: el texto de esa respuesta nombra alguna de estas palabras (sin tildes ni mayúsculas).
 */
export type Condition =
  | { q: string; equals?: string | string[]; includes?: string; gte?: number; lte?: number; answered?: boolean; mentions?: string[] }
  | { all: Condition[] }
  | { not: Condition }
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
export type AssessmentState = { version: string; basica: LevelState; intermedia: LevelState; avanzada: LevelState };

/** Súbela al cambiar las preguntas: las respuestas que ya no calcen se limpian solas al cargar. */
export const QUESTIONS_VERSION = 'intermedia-1';
/** Niveles cuyas preguntas todavía son de prueba (se muestran con aviso 🧪). */
export const PROVISIONAL_LEVELS: Level[] = ['avanzada']; // 🧪 experimental hasta que Emanuel lo apruebe
export const PROVISIONAL = PROVISIONAL_LEVELS.length > 0;

export const SECTION_LABEL: Record<Section, string> = {
  objetivos: '🎯 Objetivo',
  experiencia: '🏅 Experiencia',
  equipamiento: '🏋️ Lugar y equipamiento',
  disponibilidad: '🗓️ Disponibilidad',
  duracion: '⏱️ Duración del entrenamiento',
  prioridades: '💪 Prioridades musculares',
  salud: '🩹 Molestias o limitaciones',
  alimentacion: '🥗 Alimentación',
  estilo: '🧭 Cómo entrenas',
  ejercicios: '🏋️ Ejercicios',
  cardio: '🏃 Cardio',
  habitos: '😴 Recuperación y hábitos',
  fisico: '📏 Características físicas',
};

/* ── Las preguntas (en orden). Para cambiar la evaluación se edita SOLO esta lista. ──────── */

const molestia = (palabras: string[]): Condition => ({ all: [{ q: 'molestias', equals: 'si' }, { q: 'molestias_detalle', mentions: palabras }] });
const LUMBAR = ['lumbar', 'lumbago', 'espalda baja', 'baja espalda', 'parte baja de la espalda', 'zona baja', 'cintura', 'ciatica', 'ciatico'];

/**
 * 🩹 Molestias por zona (Emanuel, 17 nov): cada zona tiene su pregunta «¿cuándo aparece?» y SOLO se muestra si la
 * persona la nombra al describir su molestia. Para sumar una zona, agrégala aquí (palabras sin tildes).
 * Si nombra una parte del cuerpo que no está en la lista, aparece una pregunta general.
 */
type Zone = { id: string; label: string; words: string[]; options: Option[] };
const REPOSO: Option = { id: 'reposo', label: 'También en reposo', emoji: '🛋️' };
const ZONES: Zone[] = [
  { id: 'muneca', label: 'las muñecas', words: ['muneca', 'munecas'], options: [
    { id: 'empujar', label: 'Al empujar (flexiones, press)', emoji: '🤲' },
    { id: 'apoyar', label: 'Al apoyar peso en las manos', emoji: '✋' },
    { id: 'agarrar', label: 'Al agarrar barras o mancuernas', emoji: '🏋️' },
    { id: 'girar', label: 'Al girar la muñeca', emoji: '🔄' }, REPOSO] },
  { id: 'hombro', label: 'el hombro', words: ['hombro', 'hombros', 'manguito'], options: [
    { id: 'arriba', label: 'Al levantar el brazo sobre la cabeza', emoji: '🙋' },
    { id: 'empujar', label: 'Al empujar (press, flexiones)', emoji: '🤲' },
    { id: 'tirar', label: 'Al tirar (remos, dominadas)', emoji: '🪝' },
    { id: 'dormir', label: 'Al dormir de ese lado', emoji: '🛏️' }, REPOSO] },
  { id: 'rodilla', label: 'la rodilla', words: ['rodilla', 'rodillas', 'menisco', 'rotula'], options: [
    { id: 'sentadilla', label: 'Al agacharme o en sentadillas', emoji: '🧎' },
    { id: 'escaleras', label: 'Al subir o bajar escaleras', emoji: '🪜' },
    { id: 'correr', label: 'Al correr o saltar', emoji: '🏃' },
    { id: 'sentado', label: 'Después de estar mucho rato sentado', emoji: '🪑' }, REPOSO] },
  { id: 'codo', label: 'el codo', words: ['codo', 'codos'], options: [
    { id: 'flexionar', label: 'Al doblar el brazo con peso (curl)', emoji: '💪' },
    { id: 'extender', label: 'Al estirar el brazo con peso (tríceps, press)', emoji: '🤲' },
    { id: 'agarrar', label: 'Al agarrar o apretar', emoji: '✊' }, REPOSO] },
  { id: 'cuello', label: 'el cuello', words: ['cuello', 'cervical', 'cervicales', 'nuca'], options: [
    { id: 'peso_arriba', label: 'Con peso sobre los hombros o la cabeza', emoji: '🏋️' },
    { id: 'abdominales', label: 'Haciendo abdominales', emoji: '🔥' },
    { id: 'girar', label: 'Al girar la cabeza', emoji: '🔄' },
    { id: 'pantalla', label: 'Después de mucho rato en el computador o celular', emoji: '💻' }, REPOSO] },
  { id: 'tobillo', label: 'el tobillo', words: ['tobillo', 'tobillos', 'talon', 'aquiles'], options: [
    { id: 'correr', label: 'Al correr o saltar', emoji: '🏃' },
    { id: 'sentadilla', label: 'Al agacharme', emoji: '🧎' },
    { id: 'caminar', label: 'Caminando', emoji: '🚶' }, REPOSO] },
  { id: 'cadera', label: 'la cadera', words: ['cadera', 'caderas', 'ingle'], options: [
    { id: 'sentadilla', label: 'Al agacharme o en sentadillas', emoji: '🧎' },
    { id: 'abrir', label: 'Al abrir las piernas', emoji: '↔️' },
    { id: 'correr', label: 'Al correr', emoji: '🏃' },
    { id: 'sentado', label: 'Después de estar mucho rato sentado', emoji: '🪑' }, REPOSO] },
];
const ALL_ZONE_WORDS = [...LUMBAR, ...ZONES.flatMap((z) => z.words)];
const ZONE_QUESTIONS: Question[] = [
  ...ZONES.map((z): Question => ({
    id: `${z.id}_cuando`, level: 'basica', section: 'salud', type: 'multi', required: false,
    title: `¿Cuándo aparece la molestia en ${z.label}?`, help: 'Marca todas las que te pasen.',
    say: `Mencionaste ${z.label}. ¿Cuándo aparece la molestia?`,
    showIf: molestia(z.words), options: z.options,
  })),
  {
    id: 'molestia_cuando', level: 'basica', section: 'salud', type: 'multi', required: false,
    title: '¿Cuándo aparece esa molestia?', help: 'Marca todas las que te pasen.',
    say: '¿Y cuándo suele aparecer esa molestia?',
    showIf: { all: [{ q: 'molestias', equals: 'si' }, { q: 'molestias_detalle', answered: true }, { not: { q: 'molestias_detalle', mentions: ALL_ZONE_WORDS } }] },
    options: [
      { id: 'entrenando', label: 'Entrenando con peso', emoji: '🏋️' },
      { id: 'impacto', label: 'Con impacto (correr, saltar)', emoji: '🏃' },
      { id: 'dia_a_dia', label: 'En el día a día', emoji: '🚶' },
      { id: 'despues', label: 'Después de entrenar', emoji: '⏳' }, REPOSO,
    ],
  },
];

export const QUESTIONS: Question[] = [
  /* ═══ NIVEL BÁSICO ═══ */
  // 1 · Objetivo
  {
    id: 'objetivo', level: 'basica', section: 'objetivos', type: 'single', required: true,
    title: '¿Cuál es tu objetivo principal?',
    say: '¡Partamos! Cuéntame, ¿cuál es tu objetivo principal?',
    options: [
      { id: 'hipertrofia', label: 'Ganar músculo (hipertrofia)', emoji: '💪' },
      { id: 'fuerza', label: 'Ganar fuerza', emoji: '🏋️' },
      { id: 'resistencia', label: 'Resistencia', emoji: '🏃' },
      { id: 'grasa', label: 'Perder grasa', emoji: '🔥' },
      { id: 'salud', label: 'Salud general', emoji: '❤️' },
      { id: 'otro', label: 'Otro', emoji: '✨' },
    ],
  },
  {
    id: 'objetivo_otro', level: 'basica', section: 'objetivos', type: 'text', required: true,
    title: '¿Cuál es tu objetivo?', say: '¡Buenísimo! Cuéntame con tus palabras qué quieres lograr.',
    placeholder: 'Ej.: prepararme para una carrera, verme mejor para el verano…',
    showIf: { q: 'objetivo', equals: 'otro' },
  },
  // 2 · Experiencia
  {
    id: 'experiencia', level: 'basica', section: 'experiencia', type: 'single', required: true,
    title: '¿Cuánta experiencia tienes entrenando?',
    say: 'Muy bien. ¿Cuánta experiencia tienes entrenando?',
    options: [
      { id: 'principiante', label: 'Principiante', emoji: '🌱', help: 'Estoy empezando o volviendo después de mucho tiempo' },
      { id: 'intermedio', label: 'Intermedio', emoji: '⚡', help: 'Entreno hace un tiempo y conozco los ejercicios básicos' },
      { id: 'avanzado', label: 'Avanzado', emoji: '🏆', help: 'Entreno hace años y de forma constante' },
    ],
  },
  // 3 · Lugar
  {
    id: 'lugar', level: 'basica', section: 'equipamiento', type: 'single', required: true,
    title: '¿Dónde vas a entrenar?', say: '¿Y dónde vas a entrenar?',
    options: [
      { id: 'casa', label: 'En casa', emoji: '🏠' },
      { id: 'gimnasio', label: 'Gimnasio', emoji: '🏋️' },
      { id: 'aire_libre', label: 'Al aire libre', emoji: '🌳' },
    ],
  },
  // 4 · Equipamiento (según el lugar) + algo más
  {
    id: 'equipo_casa', level: 'basica', section: 'equipamiento', type: 'multi', required: false,
    title: '¿Qué tienes en casa?', help: 'Marca todo lo que tengas. Si no tienes nada, también se entrena con el cuerpo.',
    say: '¿Qué tienes en casa para entrenar? Marca todo lo que tengas.',
    showIf: { q: 'lugar', equals: 'casa' },
    options: [
      { id: 'nada', label: 'Nada, solo mi cuerpo', emoji: '🙌', exclusive: true },
      { id: 'mancuernas', label: 'Mancuernas', emoji: '🏋️' },
      { id: 'kettlebell', label: 'Kettlebell', emoji: '🔔' },
      { id: 'bandas', label: 'Bandas elásticas', emoji: '🎗️' },
      { id: 'barra_dominadas', label: 'Barra de dominadas', emoji: '🪜' },
      { id: 'banco', label: 'Banco', emoji: '🪑' },
      { id: 'colchoneta', label: 'Colchoneta', emoji: '🧘' },
      { id: 'cuerda', label: 'Cuerda para saltar', emoji: '🪢' },
    ],
  },
  {
    id: 'equipo_gimnasio', level: 'basica', section: 'equipamiento', type: 'multi', required: false,
    title: '¿Qué tiene tu gimnasio?', help: 'Marca lo que sueles tener a mano.',
    say: '¿Qué tiene tu gimnasio? Marca lo que sueles tener a mano.',
    showIf: { q: 'lugar', equals: 'gimnasio' },
    options: [
      { id: 'completo', label: 'Gimnasio completo', emoji: '🏟️', exclusive: true },
      { id: 'pesas_libres', label: 'Pesas libres (barras y mancuernas)', emoji: '🏋️' },
      { id: 'maquinas', label: 'Máquinas', emoji: '⚙️' },
      { id: 'poleas', label: 'Poleas', emoji: '🪝' },
      { id: 'rack', label: 'Rack para sentadillas', emoji: '🧱' },
      { id: 'cardio', label: 'Máquinas de cardio', emoji: '🚴' },
    ],
  },
  {
    id: 'equipo_aire_libre', level: 'basica', section: 'equipamiento', type: 'multi', required: false,
    title: '¿Con qué cuentas al aire libre?', help: 'Marca lo que tengas cerca o lleves contigo.',
    say: '¿Con qué cuentas al aire libre? Marca lo que tengas cerca o lleves contigo.',
    showIf: { q: 'lugar', equals: 'aire_libre' },
    options: [
      { id: 'nada', label: 'Nada, solo mi cuerpo', emoji: '🙌', exclusive: true },
      { id: 'barras_parque', label: 'Barras o calistenia del parque', emoji: '🤸' },
      { id: 'escaleras', label: 'Escaleras o cerro', emoji: '⛰️' },
      { id: 'pista', label: 'Pista o lugar para correr', emoji: '🏃' },
      { id: 'bandas', label: 'Bandas elásticas', emoji: '🎗️' },
      { id: 'mancuernas', label: 'Mancuernas o kettlebell', emoji: '🏋️' },
    ],
  },
  {
    id: 'equipo_extra', level: 'basica', section: 'equipamiento', type: 'text', required: false,
    title: '¿Tienes algo más para entrenar?', help: 'Opcional. Cualquier equipo que no esté en la lista.',
    say: '¿Tienes algo más que no esté en la lista? Si no, sigue nomás.',
    placeholder: 'Ej.: TRX, bicicleta, saco de boxeo…',
  },
  // 5 · Días
  {
    id: 'dias', level: 'basica', section: 'disponibilidad', type: 'number', required: true, min: 1, max: 7, step: 1, unit: 'días',
    title: '¿Cuántos días a la semana puedes entrenar?',
    say: '¡Vamos! Cuéntame, ¿cuántos días a la semana puedes entrenar?',
  },
  // 6 · Duración (puede ser variable)
  {
    id: 'duracion', level: 'basica', section: 'duracion', type: 'single', required: true,
    title: '¿Cuánto dura normalmente tu entrenamiento?', help: 'Si cambia según el día, elige «Varía».',
    say: '¿Y cuánto tiempo sueles tener para entrenar? Si cambia según el día, no hay problema.',
    options: [
      { id: '30', label: 'Unos 30 minutos', emoji: '⚡' },
      { id: '45', label: 'Unos 45 minutos', emoji: '⏱️' },
      { id: '60', label: 'Alrededor de 1 hora', emoji: '🕐' },
      { id: '90', label: '1 hora y media o más', emoji: '🔥' },
      { id: 'varia', label: 'Varía, depende del día', emoji: '🔄' },
    ],
  },
  {
    id: 'duracion_rango', level: 'basica', section: 'duracion', type: 'multi', required: false,
    title: '¿Qué duraciones se te dan en la semana?', help: 'Marca todas las que suelen tocarte. Opcional.',
    say: 'Perfecto. ¿Qué duraciones se te suelen dar en la semana? Marca todas las que te toquen.',
    showIf: { q: 'duracion', equals: 'varia' },
    options: [
      { id: '30', label: 'Unos 30 minutos', emoji: '⚡' },
      { id: '45', label: 'Unos 45 minutos', emoji: '⏱️' },
      { id: '60', label: 'Alrededor de 1 hora', emoji: '🕐' },
      { id: '90', label: '1 hora y media o más', emoji: '🔥' },
    ],
  },
  // 7 · Prioridades musculares
  {
    id: 'prioridades', level: 'basica', section: 'prioridades', type: 'multi', required: true,
    title: '¿Qué músculos quieres priorizar?', help: 'Puedes marcar varios.',
    say: '¿Hay músculos que quieras priorizar? Puedes marcar varios.',
    options: [
      { id: 'ninguno', label: 'Ninguno en especial, todo parejo', emoji: '⚖️', exclusive: true },
      { id: 'pecho', label: 'Pecho', emoji: '🦍' },
      { id: 'espalda', label: 'Espalda', emoji: '🐺' },
      { id: 'hombros', label: 'Hombros', emoji: '🥥' },
      { id: 'brazos', label: 'Brazos', emoji: '💪' },
      { id: 'abdomen', label: 'Abdomen', emoji: '🔥' },
      { id: 'gluteos', label: 'Glúteos', emoji: '🍑' },
      { id: 'piernas', label: 'Piernas', emoji: '🦵' },
    ],
  },
  // 8 · Molestias (sin diagnosticar)
  {
    id: 'molestias', level: 'basica', section: 'salud', type: 'single', required: true,
    title: '¿Tienes algún dolor, molestia o limitación física?',
    help: 'Nos sirve para cuidarte al armar tus entrenamientos.',
    say: 'Importante para cuidarte: ¿tienes algún dolor, molestia o limitación física?',
    options: [
      { id: 'no', label: 'No, ninguna', emoji: '✅' },
      { id: 'si', label: 'Sí, tengo algo', emoji: '🩹' },
    ],
  },
  {
    id: 'molestias_detalle', level: 'basica', section: 'salud', type: 'text', required: true,
    title: 'Cuéntame qué sientes y dónde',
    help: 'Con tus palabras. Ej.: «me molesta la espalda baja al agacharme» o «me duelen las muñecas en las flexiones».',
    say: 'Cuéntame con tus palabras qué sientes y en qué parte del cuerpo.',
    placeholder: 'Ej.: molestia en la espalda baja, rodilla derecha al bajar escaleras…',
    showIf: { q: 'molestias', equals: 'si' },
  },
  {
    id: 'lumbar_zona', level: 'basica', section: 'salud', type: 'single', required: false,
    title: 'En la espalda baja, ¿dónde la sientes?',
    say: 'Mencionaste la espalda baja. ¿Dónde la sientes exactamente?',
    showIf: molestia(LUMBAR),
    options: [
      { id: 'centro', label: 'Al centro', emoji: '🎯' },
      { id: 'un_lado', label: 'Hacia un lado', emoji: '↔️' },
      { id: 'ambos', label: 'A ambos lados', emoji: '⬌' },
      { id: 'no_se', label: 'No sabría decir', emoji: '🤷' },
    ],
  },
  {
    id: 'lumbar_extiende', level: 'basica', section: 'salud', type: 'single', required: false,
    title: '¿Esa molestia se extiende hacia otras zonas?',
    say: '¿Y esa molestia se queda ahí o se extiende hacia otras zonas?',
    showIf: molestia(LUMBAR),
    options: [
      { id: 'no', label: 'No, se queda en la espalda baja', emoji: '📍' },
      { id: 'gluteo', label: 'Sí, hacia el glúteo', emoji: '🍑' },
      { id: 'pierna', label: 'Sí, baja por la pierna', emoji: '🦵' },
      { id: 'no_se', label: 'No estoy seguro', emoji: '🤷' },
    ],
  },
  ...ZONE_QUESTIONS,
  // 9 · Alimentación
  {
    id: 'alimentacion', level: 'basica', section: 'alimentacion', type: 'single', required: true,
    title: '¿Cómo describirías tu alimentación hoy?',
    say: 'Ahora hablemos de comida, sin juicios. ¿Cómo describirías tu alimentación hoy?',
    options: [
      { id: 'ordenada', label: 'Ordenada, como bastante bien', emoji: '🥗' },
      { id: 'mas_o_menos', label: 'Más o menos', emoji: '🙂' },
      { id: 'desordenada', label: 'Desordenada', emoji: '🍔' },
    ],
  },
  {
    id: 'proteina', level: 'basica', section: 'alimentacion', type: 'single', required: true,
    title: '¿Sientes que comes suficiente proteína?',
    help: 'Carnes, huevos, lácteos, legumbres, suplementos…',
    say: '¿Y sientes que comes suficiente proteína?',
    options: [
      { id: 'si', label: 'Sí, creo que sí', emoji: '🍗' },
      { id: 'no_se', label: 'No sé', emoji: '🤷' },
      { id: 'no', label: 'Creo que me falta', emoji: '📉' },
    ],
  },
  {
    id: 'energia', level: 'basica', section: 'alimentacion', type: 'single', required: true,
    title: '¿Cómo está tu energía durante el día?',
    say: '¿Cómo sientes tu energía durante el día?',
    options: [
      { id: 'buena', label: 'Buena', emoji: '⚡' },
      { id: 'varia', label: 'Depende del día', emoji: '🔄' },
      { id: 'poca', label: 'Poca', emoji: '🪫' },
    ],
  },
  {
    id: 'energia_frecuencia', level: 'basica', section: 'alimentacion', type: 'single', required: false,
    title: 'Esa poca energía, ¿es algo frecuente u ocasional?',
    say: 'Esa falta de energía, ¿te pasa seguido o solo de vez en cuando?',
    showIf: { q: 'energia', equals: 'poca' },
    options: [
      { id: 'frecuente', label: 'Frecuente, casi siempre', emoji: '🔁' },
      { id: 'ocasional', label: 'Ocasional, algunos días', emoji: '📆' },
    ],
  },
  {
    id: 'habitos_comida', level: 'basica', section: 'alimentacion', type: 'text', required: false,
    title: '¿Algo de tus hábitos de comida que quieras contar?',
    help: 'Opcional. Ej.: cuántas veces comes, ayuno, vegetariano, alergias, poco tiempo para cocinar…',
    say: 'Última: ¿hay algo de tus hábitos de comida que quieras contarme? Si no, terminamos.',
    placeholder: 'Ej.: como 3 veces al día, no como carne, ceno tarde…',
  },

  /* ═══ NIVEL INTERMEDIO ═══ (Emanuel, 17 nov) — complementa lo básico, sin repetir lo ya guardado. */
  {
    id: 'organizacion', level: 'intermedia', section: 'estilo', type: 'single', required: true,
    title: '¿Cómo prefieres organizar tus entrenamientos en la semana?',
    say: '¡Subimos de nivel! ¿Cómo prefieres organizar tus entrenamientos durante la semana?',
    options: [
      { id: 'grupos', label: 'Por grupos musculares', emoji: '🧩', help: 'Ej.: un día pecho, otro espalda…' },
      { id: 'full_body', label: 'Cuerpo completo', emoji: '🧍', help: 'Todo el cuerpo en cada sesión' },
      { id: 'torso_pierna', label: 'Tren superior / inferior', emoji: '↕️', help: 'Un día arriba, otro abajo' },
      { id: 'sistema', label: 'Que el sistema lo organice', emoji: '🤖' },
    ],
  },
  {
    id: 'ejercicios_conocidos', level: 'intermedia', section: 'ejercicios', type: 'text', required: false,
    title: '¿Qué ejercicios conoces y cuáles haces habitualmente?',
    help: 'Con tus palabras, sin preocuparte de los nombres exactos.',
    say: 'Cuéntame, ¿qué ejercicios conoces y cuáles haces habitualmente?',
    placeholder: 'Ej.: press banca, sentadilla, remo con mancuerna, dominadas…',
  },
  {
    id: 'equipo_detalle', level: 'intermedia', section: 'equipamiento', type: 'text', required: false,
    title: '¿Qué equipamiento específico tienes?',
    help: 'Detalla lo que ya marcaste: máquinas, mancuernas (hasta qué peso), barras y discos, poleas y accesorios.',
    say: 'Ahora en detalle: ¿qué equipamiento específico tienes? Máquinas, mancuernas, barras, poleas, accesorios.',
    placeholder: 'Ej.: mancuernas de 5 a 25 kg, barra olímpica con 80 kg en discos, polea alta…',
    // No se pregunta si en lo básico dijo que entrena solo con su cuerpo.
    showIf: { not: { any: [{ q: 'equipo_casa', includes: 'nada' }, { q: 'equipo_aire_libre', includes: 'nada' }] } },
  },
  {
    id: 'intensidad', level: 'intermedia', section: 'estilo', type: 'single', required: true,
    title: '¿Cómo sueles entrenar?',
    say: '¿Y con qué intensidad sueles entrenar?',
    options: [
      { id: 'ligero', label: 'Ligero', emoji: '🍃', help: 'Termino fresco, podría hacer mucho más' },
      { id: 'moderado', label: 'Moderado', emoji: '🙂', help: 'Me exijo, pero me quedan varias repeticiones' },
      { id: 'intenso', label: 'Intenso', emoji: '🔥', help: 'Termino las series con poco resto' },
      { id: 'fallo', label: 'Cerca del fallo muscular', emoji: '💥', help: 'Casi no puedo hacer otra repetición' },
      { id: 'no_se', label: 'No sabría decir', emoji: '🤷' },
    ],
  },
  {
    id: 'series_reps', level: 'intermedia', section: 'estilo', type: 'single', required: true,
    title: '¿Sabes cuántas series y repeticiones haces normalmente?',
    say: '¿Sabes cuántas series y repeticiones haces normalmente? Si no lo sabes, no pasa nada.',
    options: [
      { id: 'si', label: 'Sí, lo sé', emoji: '✅' },
      { id: 'mas_o_menos', label: 'Más o menos', emoji: '🤏' },
      { id: 'no', label: 'No lo sé', emoji: '🤷' },
    ],
  },
  {
    id: 'series_reps_detalle', level: 'intermedia', section: 'estilo', type: 'text', required: false,
    title: '¿Cuántas series y repeticiones sueles hacer?',
    say: 'Buenísimo. ¿Cuántas series y repeticiones sueles hacer?',
    placeholder: 'Ej.: 4 series de 8 a 12, o 3 x 10',
    showIf: { q: 'series_reps', equals: ['si', 'mas_o_menos'] },
  },
  {
    id: 'progresion', level: 'intermedia', section: 'estilo', type: 'single', required: true,
    title: '¿Registras los pesos que levantas y buscas subirlos poco a poco?',
    say: '¿Registras los pesos que levantas y buscas subirlos de a poco?',
    options: [
      { id: 'si', label: 'Sí, registro y voy subiendo', emoji: '📈' },
      { id: 'registro', label: 'Registro, pero no subo de forma ordenada', emoji: '📝' },
      { id: 'subo', label: 'No registro, pero subo cuando me siento capaz', emoji: '💪' },
      { id: 'no', label: 'No, ninguna de las dos', emoji: '➖' },
    ],
  },
  {
    id: 'ejercicios_gusto', level: 'intermedia', section: 'ejercicios', type: 'text', required: false,
    title: '¿Qué ejercicios disfrutas?', help: 'Opcional.',
    say: '¿Qué ejercicios disfrutas hacer?',
    placeholder: 'Ej.: peso muerto, dominadas, bici…',
  },
  {
    id: 'ejercicios_evitar', level: 'intermedia', section: 'ejercicios', type: 'text', required: false,
    title: '¿Y cuáles prefieres evitar?', help: 'Opcional. Por gusto, comodidad o lo que sea.',
    say: '¿Y hay ejercicios que prefieras evitar?',
    placeholder: 'Ej.: burpees, sentadilla con barra…',
  },
  {
    id: 'cardio', level: 'intermedia', section: 'cardio', type: 'single', required: true,
    title: '¿Haces cardio?',
    say: '¿Haces cardio?',
    options: [
      { id: 'si', label: 'Sí', emoji: '🏃' },
      { id: 'a_veces', label: 'A veces', emoji: '🔄' },
      { id: 'no', label: 'No', emoji: '➖' },
    ],
  },
  {
    id: 'cardio_tipo', level: 'intermedia', section: 'cardio', type: 'multi', required: false,
    title: '¿Qué tipo de cardio?', help: 'Marca todos los que hagas.',
    say: '¿Qué tipo de cardio haces?',
    showIf: { q: 'cardio', equals: ['si', 'a_veces'] },
    options: [
      { id: 'caminar', label: 'Caminar', emoji: '🚶' },
      { id: 'correr', label: 'Correr', emoji: '🏃' },
      { id: 'bici', label: 'Bicicleta', emoji: '🚴' },
      { id: 'eliptica', label: 'Elíptica o escaladora', emoji: '⚙️' },
      { id: 'nadar', label: 'Natación', emoji: '🏊' },
      { id: 'hiit', label: 'HIIT o intervalos', emoji: '⚡' },
      { id: 'cerro', label: 'Cerro o trekking', emoji: '⛰️' },
      { id: 'deporte', label: 'Algún deporte', emoji: '⚽' },
    ],
  },
  {
    id: 'cardio_frecuencia', level: 'intermedia', section: 'cardio', type: 'single', required: false,
    title: '¿Con qué frecuencia?',
    say: '¿Y con qué frecuencia?',
    showIf: { q: 'cardio', equals: ['si', 'a_veces'] },
    options: [
      { id: '1', label: '1 vez a la semana o menos', emoji: '1️⃣' },
      { id: '2_3', label: '2 a 3 veces a la semana', emoji: '🔁' },
      { id: '4', label: '4 o más veces a la semana', emoji: '🔥' },
    ],
  },
  {
    id: 'recuperacion', level: 'intermedia', section: 'habitos', type: 'single', required: true,
    title: '¿Cómo es tu recuperación después de entrenar?',
    say: '¿Cómo te recuperas después de entrenar?',
    options: [
      { id: 'bien', label: 'Bien, al día siguiente estoy listo', emoji: '✅' },
      { id: 'adolorido', label: 'Quedo adolorido 2 o 3 días', emoji: '😣' },
      { id: 'cansado', label: 'Me cuesta, quedo muy cansado', emoji: '🪫' },
      { id: 'varia', label: 'Depende de la semana', emoji: '🔄' },
    ],
  },
  {
    id: 'recuperacion_detalle', level: 'intermedia', section: 'habitos', type: 'text', required: false,
    title: '¿Algo más sobre cómo te recuperas?', help: 'Opcional. Ej.: duermo poco, trabajo de pie, me cuesta con las piernas…',
    say: '¿Quieres contarme algo más sobre cómo te recuperas?',
    showIf: { q: 'recuperacion', equals: ['adolorido', 'cansado', 'varia'] },
  },
  {
    id: 'poco_tiempo', level: 'intermedia', section: 'estilo', type: 'single', required: true,
    title: 'Cuando tienes poco tiempo, ¿qué prefieres?',
    say: 'Última de este nivel: cuando tienes poco tiempo, ¿qué prefieres hacer?',
    options: [
      { id: 'menos_ejercicios', label: 'Hacer menos ejercicios', emoji: '✂️' },
      { id: 'menos_series', label: 'Hacer menos series', emoji: '➖' },
      { id: 'express', label: 'Una rutina express adaptada', emoji: '⚡' },
      { id: 'sistema', label: 'Que el sistema decida', emoji: '🤖' },
    ],
  },

  /* ═══ NIVEL AVANZADO ═══ — 🧪 EXPERIMENTAL (PROVISIONAL_LEVELS): no son definitivas todavía. */
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
    title: '¿Cómo ha sido tu historial de entrenamiento?', help: 'Deportes, gimnasio, pausas largas… lo que quieras contar.',
    say: 'Cuéntame tu historia. ¿Cómo ha sido tu entrenamiento hasta ahora?',
  },
  {
    id: 'sueno', level: 'avanzada', section: 'habitos', type: 'scale', required: false, min: 1, max: 5,
    minLabel: 'Duermo mal', maxLabel: 'Duermo excelente',
    title: '¿Cómo es tu descanso?', say: 'Del uno al cinco, ¿cómo es tu descanso?',
  },
];

/* ── Motor ───────────────────────────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function meets(c: Condition | undefined, a: Answers): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => meets(x, a));
  if ('any' in c) return c.any.some((x) => meets(x, a));
  if ('not' in c) return !meets(c.not, a);
  const v = a[c.q];
  if (c.answered !== undefined && c.answered !== isAnswered(v)) return false;
  if (c.equals !== undefined) {
    const want = Array.isArray(c.equals) ? c.equals : [c.equals];
    if (!(typeof v === 'string' && want.includes(v))) return false;
  }
  if (c.includes !== undefined && !(Array.isArray(v) && v.includes(c.includes))) return false;
  if (c.mentions !== undefined) {
    const t = ` ${norm(typeof v === 'string' ? v : '')} `;
    if (!c.mentions.some((w) => t.includes(` ${norm(w)}`))) return false;
  }
  if (c.gte !== undefined && !(typeof v === 'number' && v >= c.gte)) return false;
  if (c.lte !== undefined && !(typeof v === 'number' && v <= c.lte)) return false;
  return true;
}

export const isAnswered = (v: Answer | undefined) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Todas las respuestas juntas (para las condiciones entre niveles). */
export const allAnswers = (s: Pick<AssessmentState, Level>): Answers => ({ ...s.basica.answers, ...s.intermedia.answers, ...s.avanzada.answers });

/** Las preguntas de un nivel que corresponden con lo respondido (las condicionales aparecen o se van solas). */
export const visibleQuestions = (level: Level, all: Answers, list = QUESTIONS) => list.filter((q) => q.level === level && meets(q.showIf, all));

export function valid(q: Question, v: Answer | undefined): boolean {
  if (!isAnswered(v)) return !q.required;
  if (q.type === 'number' || q.type === 'scale') return typeof v === 'number' && (q.min === undefined || v >= q.min) && (q.max === undefined || v <= q.max);
  if (q.type === 'text') return typeof v === 'string' && (!q.required || v.trim().length > 0);
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

/** Marca o desmarca una opción múltiple respetando las excluyentes («Ninguno en especial»). */
export function toggleMulti(q: Question, cur: string[], id: string): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  const opt = q.options?.find((o) => o.id === id);
  if (opt?.exclusive) return [id];
  const exclusive = new Set(q.options?.filter((o) => o.exclusive).map((o) => o.id));
  return [...cur.filter((x) => !exclusive.has(x)), id];
}

const WORDS: Record<string, number> = { cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Número dicho («cuatro días», «72,5») → 4 / 72.5. */
export function numberFromSpeech(t: string): number | null {
  const m = t.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (m) return Number(m[0]);
  for (const w of norm(t).split(' ')) if (w in WORDS) return WORDS[w];
  return null;
}

/** Opciones que calzan con lo dicho («gimnasio», «quiero perder grasa»). */
export function optionsFromSpeech(q: Question, t: string): string[] {
  const said = ` ${norm(t)} `;
  return (q.options ?? [])
    .filter((o) => {
      const words = norm(o.label).split(' ').filter((w) => w.length > 3);
      return said.includes(` ${norm(o.label)} `) || (words.length > 0 && words.some((w) => said.includes(w)));
    })
    .map((o) => o.id);
}

/** Quita respuestas que ya no calzan con las preguntas actuales (opciones que cambiaron, preguntas borradas). */
function clean(level: Level, st: LevelState, others: Answers = {}): LevelState {
  const out: Answers = {};
  for (const q of QUESTIONS.filter((x) => x.level === level)) {
    const v = st.answers[q.id];
    if (!isAnswered(v)) continue;
    const ids = new Set(q.options?.map((o) => o.id));
    if (q.type === 'single' && !(typeof v === 'string' && ids.has(v))) continue;
    if (q.type === 'multi') {
      const keep = Array.isArray(v) ? v.filter((x) => ids.has(x)) : [];
      if (keep.length) out[q.id] = keep;
      continue;
    }
    out[q.id] = v;
  }
  const qs = visibleQuestions(level, { ...others, ...out });
  const complete = qs.every((q) => valid(q, out[q.id]));
  return { ...st, answers: out, done_at: complete ? st.done_at : null, step: Math.min(st.step, Math.max(0, qs.length - 1)) };
}

/* ── Guardado ────────────────────────────────────────────────────────────────────── */

const empty = (): LevelState => ({ answers: {}, step: 0, done_at: null, updated_at: null });
const fresh = (): AssessmentState => ({ version: QUESTIONS_VERSION, basica: empty(), intermedia: empty(), avanzada: empty() });
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
      const raw = { basica: newer(cloud.basica, local.basica), intermedia: newer(cloud.intermedia, local.intermedia), avanzada: newer(cloud.avanzada, local.avanzada) };
      const every = allAnswers(raw);
      const s: AssessmentState = { version: QUESTIONS_VERSION, basica: clean('basica', raw.basica, every), intermedia: clean('intermedia', raw.intermedia, every), avanzada: clean('avanzada', raw.avanzada, every) };
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
