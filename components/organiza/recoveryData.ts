/**
 * 🔋 Recuperación de Workout Pro (MODIFICACIÓN 05, Emanuel 2026-11-18) — solo reglas, sin React ni IA: funciona sin
 * conexión y siempre explica por qué. Cruza: sueño (registro «Dormir» de Organiza), cómo llegas hoy (energía,
 * agujetas, dolor, señales de alerta), actividad extra (bici, caminatas… manual o Apple Salud) y entrenos recientes.
 *
 * Reglas de Emanuel: no diagnosticar; una sola mala noche NO cancela; separar cansancio, dolor y señales de riesgo;
 * explicar; la persona decide, salvo señales de alerta (ahí se recomienda no entrenar y buscar ayuda).
 */
import type { WorkoutLog } from './workoutData';

export type Level = 'normal' | 'ajustar' | 'suave' | 'cuidado' | 'alerta';
export const LEVEL_ORDER: Level[] = ['normal', 'ajustar', 'suave', 'cuidado', 'alerta'];
export type Pain = 'no' | 'molestia' | 'agudo';
/** Señales de alerta: NO son agujetas ni cansancio. */
export type Flag = 'pecho' | 'mareo' | 'fiebre' | 'hinchazon' | 'falta_aire';
export const FLAGS: { id: Flag; label: string; stop: boolean }[] = [
  { id: 'pecho', label: 'Dolor o presión en el pecho', stop: true },
  { id: 'falta_aire', label: 'Falta de aire en reposo', stop: true },
  { id: 'mareo', label: 'Mareo o desmayo', stop: true },
  { id: 'fiebre', label: 'Fiebre o me siento enfermo', stop: true },
  { id: 'hinchazon', label: 'Una articulación hinchada o que no puedo mover', stop: false },
];

export type Checkin = { energy: number | null; soreness: number | null; pain: Pain; pain_zone: string; flags: Flag[] };
export type Night = { day: string; hours: number | null; quality: number | null };
export type Activity = { day: string; kind: string; minutes: number | null; intensity: number | null; distance_km?: number | null; steps?: number | null };

export const ACTIVITY_KINDS: { id: string; label: string; emoji: string; legs: boolean }[] = [
  { id: 'bici', label: 'Bicicleta', emoji: '🚴', legs: true },
  { id: 'caminata', label: 'Caminata', emoji: '🚶', legs: true },
  { id: 'correr', label: 'Correr', emoji: '🏃', legs: true },
  { id: 'cerro', label: 'Cerro / trekking', emoji: '⛰️', legs: true },
  { id: 'nadar', label: 'Natación', emoji: '🏊', legs: false },
  { id: 'deporte', label: 'Deporte (fútbol, tenis…)', emoji: '⚽', legs: true },
  { id: 'otro', label: 'Otra', emoji: '✨', legs: false },
];
const LEG_MUSCLES = ['cuadriceps', 'femorales', 'gluteos', 'pantorrillas'];

export type Reason = { kind: 'sueno' | 'energia' | 'agujetas' | 'dolor' | 'alerta' | 'actividad' | 'entreno'; level: Level; text: string };
export type Option = 'normal' | 'menos_series' | 'corta' | 'cambiar' | 'movilidad' | 'descanso';
export type Advice = { level: Level; canTrain: boolean; reasons: Reason[]; options: Option[]; summary: string };

const DAY = 86_400_000;
const parse = (s: string) => new Date(`${s}T12:00:00`).getTime();
const max = (a: Level, b: Level) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a);
const n = (x: number) => String(+x.toFixed(1)).replace('.', ',');

/** Carga de piernas de la actividad extra (minutos × intensidad: suave 1 · moderada 1,5 · intensa 2). */
export function legLoad(acts: Activity[], today: string, hours = 36): { load: number; list: Activity[] } {
  const from = parse(today) - (hours / 24) * DAY;
  const list = acts.filter((a) => ACTIVITY_KINDS.find((k) => k.id === a.kind)?.legs && a.minutes && parse(a.day) >= from && a.day <= today);
  const f = (i: number | null) => (i === 3 ? 2 : i === 2 ? 1.5 : 1);
  return { load: list.reduce((s, a) => s + (a.minutes ?? 0) * f(a.intensity), 0), list };
}

/** Series efectivas por músculo en las últimas 48 h (para no repetir lo mismo muy cargado). */
export function recentSets(logs: WorkoutLog[], today: string, hours = 48): Record<string, { sets: number; failure: number }> {
  const from = parse(today) - (hours / 24) * DAY;
  const out: Record<string, { sets: number; failure: number }> = {};
  for (const l of logs) {
    if (parse(l.day) < from || l.day >= today) continue;
    for (const e of l.exercises) for (const s of e.sets) {
      if (!s.done || s.kind === 'warmup') continue;
      const m = e.muscles[0];
      if (!m) continue;
      out[m] = out[m] ?? { sets: 0, failure: 0 };
      out[m].sets++;
      if (s.rir === 0) out[m].failure++;
    }
  }
  return out;
}

/**
 * La recomendación del día para la rutina planificada (`muscles` = músculos de hoy; vacío = descanso/sin plan).
 * `nights` en orden cualquiera; se usan las 3 últimas antes o en `today`.
 */
export function advise(input: { today: string; muscles: string[]; checkin: Checkin | null; nights: Night[]; activities: Activity[]; logs: WorkoutLog[]; usualSleep?: number }): Advice {
  const { today, muscles, checkin, activities, logs } = input;
  const reasons: Reason[] = [];
  let level = 'normal' as Level;
  const push = (r: Reason) => {
    reasons.push(r);
    level = max(level, r.level);
  };

  // 1) Señales de alerta: no es cansancio ni agujetas.
  const flags = checkin?.flags ?? [];
  const stop = FLAGS.filter((f) => f.stop && flags.includes(f.id));
  if (stop.length) push({ kind: 'alerta', level: 'alerta', text: `Marcaste: ${stop.map((f) => f.label.toLowerCase()).join(', ')}. Eso no es cansancio normal: hoy no entrenes. Si es fuerte, aparece de golpe o no se va, busca atención médica (en Chile, SAMU 131).` });
  if (flags.includes('hinchazon')) push({ kind: 'alerta', level: 'cuidado', text: 'Una articulación hinchada o que no puedes mover no se entrena encima: evita esa zona y, si no mejora en unos días, que la vea un profesional.' });

  // 2) Dolor (distinto de agujetas).
  if (checkin?.pain === 'agudo') push({ kind: 'dolor', level: 'cuidado', text: `Dolor agudo o punzante${checkin.pain_zone ? ` en ${checkin.pain_zone}` : ''}: no lo entrenes «a través del dolor». Evita los ejercicios que lo provocan; si persiste, consúltalo.` });
  else if (checkin?.pain === 'molestia') push({ kind: 'dolor', level: 'ajustar', text: `Molestia${checkin.pain_zone ? ` en ${checkin.pain_zone}` : ''}: puedes entrenar si no aumenta. Baja la carga en lo que la provoque y prioriza la técnica.` });

  // 3) Sueño: una mala noche sola no cancela.
  const nights = input.nights.filter((x) => x.day <= today && x.hours !== null).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 3);
  const usual = input.usualSleep ?? 7;
  const short = (h: number | null) => h !== null && h < Math.min(6, usual - 1);
  const lastNight = nights[0]?.day === today ? nights[0] : null;
  const energy = checkin?.energy ?? null;
  if (lastNight && short(lastNight.hours)) {
    const streak = nights.filter((x, i) => i < 3 && short(x.hours)).length;
    if (streak >= 2) push({ kind: 'sueno', level: 'ajustar', text: `Llevas ${streak} noches cortas seguidas (anoche ${n(lastNight.hours!)} h). Mejor una sesión más corta o con menos series.` });
    else if (energy !== null && energy <= 2) push({ kind: 'sueno', level: 'ajustar', text: `Dormiste ${n(lastNight.hours!)} h y llegas con poca energía: baja el volumen hoy.` });
    else push({ kind: 'sueno', level: 'normal', text: `Dormiste ${n(lastNight.hours!)} h. Una mala noche sola no es razón para cancelar: calienta bien y mira cómo te sientes en las primeras series.` });
  } else if (!lastNight) reasons.push({ kind: 'sueno', level: 'normal', text: 'No hay registro de sueño de anoche (lo puedes anotar en «Dormir» del Horario).' });

  // 4) Energía y agujetas (cansancio).
  if (energy === 1) push({ kind: 'energia', level: 'suave', text: 'Energía muy baja: hoy rinde más algo suave (movilidad, caminar) o la versión corta.' });
  else if (energy === 2) push({ kind: 'energia', level: 'ajustar', text: 'Energía baja: la versión corta o menos series te deja entrenar sin vaciarte.' });
  if (checkin?.soreness === 3) push({ kind: 'agujetas', level: 'ajustar', text: 'Agujetas fuertes: es cansancio muscular normal, pero conviene bajar volumen en esos músculos.' });

  // 5) Actividad extra que carga las piernas (ej. horas de bici) + piernas programadas.
  const legsToday = muscles.some((m) => LEG_MUSCLES.includes(m));
  const ll = legLoad(activities, today);
  if (ll.load > 0 && legsToday) {
    const desc = ll.list.map((a) => `${ACTIVITY_KINDS.find((k) => k.id === a.kind)?.label.toLowerCase() ?? a.kind} ${a.minutes} min`).join(', ');
    if (ll.load >= 240) push({ kind: 'actividad', level: 'suave', text: `Hiciste mucha actividad de piernas en las últimas 36 h (${desc}). Hoy tienes piernas: mejor cambiar a tren superior o hacerla muy liviana.` });
    else if (ll.load >= 120) push({ kind: 'actividad', level: 'ajustar', text: `Hiciste ${desc} en las últimas 36 h y hoy tienes piernas: reduce el volumen de piernas (cerca de un tercio menos de series) o cambia el orden de tu semana.` });
  }

  // 6) Mismos músculos muy cargados hace poco.
  const rs = recentSets(logs, today);
  const repeat = muscles.filter((m) => (rs[m]?.sets ?? 0) >= 8 || (rs[m]?.failure ?? 0) >= 3);
  if (repeat.length) push({ kind: 'entreno', level: 'ajustar', text: `Entrenaste fuerte ${repeat.join(', ')} en las últimas 48 h: hoy menos series para esos músculos, o deja ese día para después.` });

  const options: Option[] =
    level === 'alerta' ? ['descanso'] :
    level === 'cuidado' ? ['cambiar', 'movilidad', 'descanso', 'normal'] :
    level === 'suave' ? ['movilidad', 'corta', 'cambiar', 'descanso', 'normal'] :
    level === 'ajustar' ? ['menos_series', 'corta', 'cambiar', 'normal', 'descanso'] :
    ['normal', 'corta', 'descanso'];
  const summary =
    level === 'alerta' ? '🚫 Hoy no entrenes: hay señales de alerta.' :
    level === 'cuidado' ? '⚠️ Puedes moverte, pero cuidando la zona con dolor.' :
    level === 'suave' ? '🌿 Hoy conviene algo suave.' :
    level === 'ajustar' ? '🔧 Puedes entrenar, mejor con menos volumen.' :
    '✅ Todo en orden para entrenar.';
  return { level, canTrain: level !== 'alerta', reasons, options, summary };
}

export const OPTION_LABEL: Record<Option, string> = {
  normal: 'Entrenar normal',
  menos_series: 'Entrenar con menos series',
  corta: 'Versión corta',
  cambiar: 'Cambiar la sesión de hoy',
  movilidad: 'Algo suave / movilidad',
  descanso: 'Descansar hoy',
};
