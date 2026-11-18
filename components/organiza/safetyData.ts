/**
 * 🛟 Seguridad durante el entreno (MODIFICACIÓN 11, Emanuel 2026-11-18) — solo reglas, sin React ni IA: funciona sin
 * conexión y siempre explica por qué.
 *
 * Reglas de Emanuel: NUNCA diagnosticar ni recomendar seguir ante señales de riesgo; entrenar sostenible y seguro, no
 * completar la rutina a cualquier precio; alternativas solo cuando corresponde; lo futuro se ajusta solo con permiso.
 *
 * Niveles:
 *  · alarma   → señales de riesgo (pecho, falta de aire, mareo, palpitaciones, hormigueo o pérdida de fuerza, vista
 *               borrosa): terminar YA, sin opción de seguir, y buscar atención (SAMU 131).
 *  · zona     → dolor que no es «quemazón» normal (punzante, tirón, chasquido, hinchazón, empeora, no se pasa al parar,
 *               fuerte): parar todo lo que cargue esa zona hoy; seguir solo con lo que no la usa, si no duele.
 *  · leve     → molestia leve que no empeora y se pasa al parar, o quemazón muscular: modificar (menos carga, saltar,
 *               cambiar a otra variante).
 *  · cansancio → fatiga, sin energía o no te recuperas entre series: descansar más, bajar la versión o terminar antes.
 */

export type What = 'dolor' | 'articulacion' | 'fatiga' | 'sin_energia' | 'mareo' | 'no_recupero';
export const WHAT: { id: What; label: string; emoji: string }[] = [
  { id: 'dolor', label: 'Dolor repentino', emoji: '⚡' },
  { id: 'articulacion', label: 'Molestia en una articulación', emoji: '🦴' },
  { id: 'fatiga', label: 'Fatiga excesiva', emoji: '🥵' },
  { id: 'sin_energia', label: 'Me quedé sin energía', emoji: '🪫' },
  { id: 'mareo', label: 'Mareo o malestar', emoji: '😵' },
  { id: 'no_recupero', label: 'No me recupero entre series', emoji: '🫁' },
];
export const needsZone = (w: What | null) => w === 'dolor' || w === 'articulacion';

export type Zone = 'hombro' | 'codo' | 'muneca' | 'cuello' | 'espalda_baja' | 'espalda_alta' | 'cadera' | 'rodilla' | 'tobillo' | 'musculo';
export const ZONES: { id: Zone; label: string }[] = [
  { id: 'hombro', label: 'Hombro' },
  { id: 'codo', label: 'Codo' },
  { id: 'muneca', label: 'Muñeca' },
  { id: 'cuello', label: 'Cuello' },
  { id: 'espalda_alta', label: 'Espalda alta' },
  { id: 'espalda_baja', label: 'Espalda baja' },
  { id: 'cadera', label: 'Cadera' },
  { id: 'rodilla', label: 'Rodilla' },
  { id: 'tobillo', label: 'Tobillo' },
  { id: 'musculo', label: 'El músculo que estoy trabajando' },
];
export const zoneLabel = (z: Zone | string) => ZONES.find((x) => x.id === z)?.label.toLowerCase() ?? z;
/** Músculos (de Workout Pro) cuyos ejercicios suelen cargar cada zona. Es una guía para avisar, no un diagnóstico. */
export const ZONE_MUSCLES: Record<Exclude<Zone, 'musculo'>, string[]> = {
  hombro: ['hombros', 'pecho', 'triceps', 'dorsales', 'trapecio'],
  codo: ['biceps', 'triceps', 'antebrazos'],
  muneca: ['antebrazos', 'biceps', 'triceps', 'pecho'],
  cuello: ['trapecio', 'hombros'],
  espalda_alta: ['dorsales', 'trapecio', 'hombros'],
  espalda_baja: ['lumbares', 'femorales', 'gluteos'],
  cadera: ['gluteos', 'cuadriceps', 'femorales', 'lumbares'],
  rodilla: ['cuadriceps', 'femorales', 'pantorrillas', 'gluteos'],
  tobillo: ['pantorrillas', 'cuadriceps'],
};

export type Feel = 'quemazon' | 'punzante' | 'tiron' | 'chasquido' | 'sordo';
export const FEELS: { id: Feel; label: string; help: string }[] = [
  { id: 'quemazon', label: 'Quemazón en el músculo', help: 'Ardor que crece con las reps y se va al descansar' },
  { id: 'sordo', label: 'Molestia sorda', help: 'Una incomodidad leve, sin pinchazo' },
  { id: 'punzante', label: 'Punzante / pinchazo', help: 'Dolor agudo, localizado' },
  { id: 'tiron', label: 'Tirón', help: 'Como si algo se estirara de golpe' },
  { id: 'chasquido', label: 'Sentí un chasquido', help: 'Un «pop» o crujido con dolor' },
];

export type Flag = 'pecho' | 'falta_aire' | 'mareo' | 'palpitaciones' | 'hormigueo' | 'vista' | 'hinchazon';
export const FLAGS: { id: Flag; label: string; alarm: boolean }[] = [
  { id: 'pecho', label: 'Dolor, presión o apretón en el pecho', alarm: true },
  { id: 'falta_aire', label: 'Me falta el aire y no se pasa al parar', alarm: true },
  { id: 'mareo', label: 'Mareo fuerte, como que me voy a desmayar', alarm: true },
  { id: 'palpitaciones', label: 'Palpitaciones raras o el corazón irregular', alarm: true },
  { id: 'hormigueo', label: 'Hormigueo, adormecimiento o pierdo fuerza en un brazo o pierna', alarm: true },
  { id: 'vista', label: 'Visión borrosa o dolor de cabeza fuerte y repentino', alarm: true },
  { id: 'hinchazon', label: 'La zona se hinchó o no la puedo mover', alarm: false },
];

export type Report = {
  what: What | null;
  zone: Zone | null;
  feel: Feel | null;
  /** 0–10. */
  intensity: number | null;
  /** ¿Empeora al moverlo? */
  worse: boolean | null;
  /** ¿Se pasa al parar? */
  passes: boolean | null;
  flags: Flag[];
};
export const EMPTY: Report = { what: null, zone: null, feel: null, intensity: null, worse: null, passes: null, flags: [] };

export type Level = 'alarma' | 'zona' | 'leve' | 'cansancio';
export type Action =
  | 'terminar' // terminar y guardar lo hecho
  | 'llamar' // SAMU 131
  | 'saltar_zona' // saltar lo que carga la zona
  | 'saltar' // saltar este ejercicio
  | 'bajar_carga' // −15 % en las series que faltan de este ejercicio
  | 'menos_series' // quitar una serie que falta
  | 'variante' // cambiar a otro ejercicio del mismo músculo
  | 'descanso_largo' // +60 s de descanso
  | 'version_recuperacion' // pasar a la versión Recuperación
  | 'seguir'; // seguir con cuidado (solo leve / cansancio)

export type Verdict = {
  level: Level;
  title: string;
  /** Por qué (frases cortas, sin diagnósticos). */
  why: string[];
  actions: Action[];
  /** Zona a cuidar (para saltar ejercicios y proponer cuidarla los próximos días). */
  zone: Zone | null;
  /** Proponer cuidar la zona en los próximos entrenos (se aplica solo si aceptas). */
  proposeCaution: boolean;
};

/** La regla. Si falta información para decidir, se va al lado seguro. */
export function evaluate(r: Report): Verdict {
  const alarms = FLAGS.filter((f) => f.alarm && r.flags.includes(f.id));
  if (alarms.length || r.what === 'mareo') {
    const why = alarms.length ? [`Marcaste: ${alarms.map((f) => f.label.toLowerCase()).join('; ')}.`] : ['Mareo o malestar durante el ejercicio.'];
    why.push('Esto no es cansancio normal: no sigas entrenando hoy.');
    why.push('Siéntate o recuéstate, no manejes. Si es fuerte, aparece de golpe o no se pasa en unos minutos, llama al SAMU 131 o pide ayuda a alguien cerca.');
    return { level: 'alarma', title: '🚫 Detén el entreno ahora', why, actions: ['llamar', 'terminar'], zone: null, proposeCaution: false };
  }

  if (r.what === 'dolor' || r.what === 'articulacion') {
    const zone = r.zone ?? 'musculo';
    const where = zone === 'musculo' ? 'el músculo que trabajabas' : `tu ${zoneLabel(zone)}`;
    const reasons: string[] = [];
    if (r.flags.includes('hinchazon')) reasons.push('se hinchó o no la puedes mover');
    if (r.feel === 'punzante') reasons.push('es punzante');
    if (r.feel === 'tiron') reasons.push('fue un tirón');
    if (r.feel === 'chasquido') reasons.push('sentiste un chasquido');
    if (r.worse) reasons.push('empeora al moverlo');
    if (r.passes === false) reasons.push('no se pasa al parar');
    if ((r.intensity ?? 0) >= 6) reasons.push(`la intensidad es ${r.intensity}/10`);
    // Sin saber cómo es, en una articulación se trata como zona (lado seguro).
    if (r.what === 'articulacion' && r.feel === null && r.passes === null) reasons.push('es una articulación y no sabemos cómo es');
    const muscleBurn = zone === 'musculo' && r.feel === 'quemazon' && !reasons.length;
    if (reasons.length && !muscleBurn) {
      const why = [`En ${where}: ${reasons.join(', ')}. Eso no es la quemazón normal del esfuerzo.`, 'No entrenes «a través del dolor»: hoy no hagas nada que cargue esa zona.'];
      if (zone !== 'musculo') why.push('Puedes seguir solo con ejercicios que no la usen, si no duele al hacerlos. Si el dolor no baja en 2–3 días, se hincha o te despierta en la noche, que lo vea un profesional (kinesiólogo o médico).');
      else why.push('Si el dolor no baja en 2–3 días o aparece un moretón, que lo vea un profesional (kinesiólogo o médico).');
      return { level: 'zona', title: `⚠️ Para lo que carga ${where}`, why, actions: ['saltar_zona', 'terminar'], zone, proposeCaution: zone !== 'musculo' || (r.intensity ?? 0) >= 6 || r.feel === 'tiron' || r.feel === 'chasquido' };
    }
    const why = muscleBurn
      ? ['Quemazón en el músculo que trabajas: es el esfuerzo normal (se va al descansar).', 'Si quieres, baja un poco la carga o descansa más; si cambia a pinchazo o no se pasa, vuelve a avisar.']
      : [`Molestia leve en ${where} que no empeora${r.passes ? ' y se pasa al parar' : ''}.`, 'Puedes seguir con cuidado: baja la carga, cambia a una variante que no la provoque o salta este ejercicio. Si aumenta, para.'];
    return { level: 'leve', title: muscleBurn ? '✅ Es el esfuerzo normal' : '🔧 Ajusta y sigue con cuidado', why, actions: ['bajar_carga', 'variante', 'saltar', 'menos_series', 'seguir'], zone: zone === 'musculo' ? null : zone, proposeCaution: false };
  }

  // Cansancio: fatiga, sin energía, no me recupero.
  const why =
    r.what === 'no_recupero' ? ['No te recuperas entre series: el cuerpo pide más pausa.', 'Alarga el descanso. Si además te falta el aire en reposo o sientes el pecho, marca esa señal: es otra cosa.']
    : r.what === 'sin_energia' ? ['Te quedaste sin energía: lo que ya hiciste cuenta.', 'Puedes bajar a la versión Recuperación o terminar aquí. Come algo e hidrátate.']
    : ['Fatiga excesiva: no hay que completar la rutina a cualquier precio.', 'Descansa más, quita series o termina antes. Lo hecho hoy cuenta.'];
  return { level: 'cansancio', title: '🔋 Baja el ritmo', why, actions: r.what === 'no_recupero' ? ['descanso_largo', 'menos_series', 'version_recuperacion', 'terminar', 'seguir'] : ['version_recuperacion', 'menos_series', 'descanso_largo', 'terminar', 'seguir'], zone: null, proposeCaution: false };
}

/** ¿Este ejercicio carga la zona? (por sus músculos). «El músculo que trabajas» = mismo músculo principal. */
export function loadsZone(muscles: string[], zone: Zone, current?: string[]): boolean {
  if (zone === 'musculo') return !!current?.[0] && muscles[0] === current[0];
  return muscles.some((m) => ZONE_MUSCLES[zone].includes(m));
}

/* ── Cuidar una zona en los próximos entrenos (solo con permiso) ──────────────────── */

/** `zone: 'musculo'` lleva `muscle` (el músculo principal del ejercicio en que pasó). */
export type Caution = { zone: Zone; muscle?: string; since: string; until: string; reason: string };
const parse = (s: string) => new Date(`${s}T12:00:00`).getTime();
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDays = (s: string, n: number) => iso(parse(s) + n * 86_400_000);
/** Propuesta: cuidar la zona 7 días (revisable). */
export const proposal = (zone: Zone, today: string, reason: string, muscle?: string): Caution => ({ zone, ...(zone === 'musculo' && muscle ? { muscle } : {}), since: today, until: addDays(today, 7), reason });
const sameTarget = (a: Caution, b: Caution) => a.zone === b.zone && (a.zone !== 'musculo' || a.muscle === b.muscle);
/** Cómo se llama lo que se cuida («tu rodilla», «tu pecho»). */
export const cautionLabel = (c: Caution, muscleLabel: (m: string) => string = (m) => m) => (c.zone === 'musculo' ? muscleLabel(c.muscle ?? '').toLowerCase() : zoneLabel(c.zone));
export const activeCautions = (list: Caution[] | undefined, today: string) => (list ?? []).filter((c) => c.until >= today);
/** Agrega (o reemplaza la de la misma zona) y limpia las vencidas. */
export const withCaution = (list: Caution[] | undefined, c: Caution, today: string) => [...activeCautions(list, today).filter((x) => !sameTarget(x, c)), c];
/** El aviso para un ejercicio que carga una zona en cuidado (null si no aplica). */
export function cautionFor(muscles: string[], list: Caution[] | undefined, today: string): Caution | null {
  return activeCautions(list, today).find((c) => (c.zone === 'musculo' ? !!c.muscle && muscles[0] === c.muscle : loadsZone(muscles, c.zone))) ?? null;
}

/** Texto para el historial del entreno (queda en las notas). */
export function incidentText(r: Report, v: Verdict, exercise: string | null, chosen: string): string {
  const w = WHAT.find((x) => x.id === r.what)?.label ?? 'Aviso';
  const parts = [`🛟 ${w}${r.zone ? ` (${zoneLabel(r.zone)})` : ''}${exercise ? ` en ${exercise}` : ''}`];
  if (r.feel) parts.push(FEELS.find((f) => f.id === r.feel)!.label.toLowerCase());
  if (r.intensity !== null) parts.push(`${r.intensity}/10`);
  if (r.flags.length) parts.push(r.flags.map((f) => FLAGS.find((x) => x.id === f)!.label.toLowerCase()).join(', '));
  return `${parts.join(' · ')} → ${v.level === 'alarma' ? 'ALARMA' : v.level}: ${chosen}.`;
}
