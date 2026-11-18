/**
 * 🎓 Entrenador visual 3D (MODIFICACIÓN 10, Emanuel 2026-11-18) — solo datos y cálculos, sin three.js.
 *
 * Por qué así (investigación del 18 nov): no hay paquetes GRATIS con licencia libre de ejercicios de gimnasio
 * (Quaternius CC0 no los trae; Mixamo es gratis pero prohíbe redistribuir los archivos y este repositorio es
 * público; las librerías de ejercicios cobran por clip o por año). Por eso el entrenador es un MANIQUÍ propio armado
 * con figuras simples y cada ejercicio es una plantilla de ángulos (inicio → final) escrita aquí: sin costos, sin
 * licencias de terceros y fácil de corregir. Es una guía visual, no reemplaza a un profesional.
 *
 * Ángulos en grados. Convenciones (vista de lado, la persona mira hacia adelante):
 *  · pitch: todo el cuerpo inclinado desde la cadera (0 de pie · 90 boca abajo horizontal · −90 boca arriba).
 *  · spine: tronco respecto de la pelvis (+ hacia adelante).
 *  · hip / knee: flexión de cadera (muslo adelante +) y de rodilla (+).
 *  · sh / abd / el: flexión de hombro (brazo adelante/arriba +), separación lateral (+) y flexión de codo (+).
 *  · ankle: ángulo del pie respecto de la pierna (+ = punta hacia abajo). Si no se da (null), el pie queda plano en el suelo.
 */

export type Pose = {
  pitch: number; spine: number;
  hipL: number; hipR: number; kneeL: number; kneeR: number; ankleL: number | null; ankleR: number | null;
  shL: number; shR: number; abdL: number; abdR: number; elL: number; elR: number;
  /** Separación de piernas (grados hacia afuera). */
  stance: number;
};
export const STAND: Pose = { pitch: 0, spine: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, ankleL: null, ankleR: null, shL: 0, shR: 0, abdL: 6, abdR: 6, elL: 5, elR: 5, stance: 6 };

type Half = Partial<Pose> & { sh?: number; abd?: number; el?: number; hip?: number; knee?: number; ankle?: number | null };
/** Atajos simétricos (sh = shL y shR…) → pose completa. */
export function full(p: Half, base: Pose = STAND): Pose {
  const o: Pose = { ...base };
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (k === 'sh' || k === 'abd' || k === 'el' || k === 'hip' || k === 'knee' || k === 'ankle') {
      (o as Record<string, unknown>)[`${k}L`] = v;
      (o as Record<string, unknown>)[`${k}R`] = v;
    } else (o as Record<string, unknown>)[k] = v;
  }
  return o;
}

export type Anchor = 'pies' | 'manos' | 'cadera';
export type Prop = 'barra' | 'mancuernas' | 'banco' | 'barra_alta' | 'paralelas';
export type Segment = 'torso' | 'brazos' | 'antebrazos' | 'gluteos' | 'muslos' | 'piernas';
export type Breath = 'inhala' | 'exhala' | 'normal';
export type Template = {
  id: string;
  label: string;
  match: RegExp;
  anchor: Anchor;
  /** Manos fijas donde empiezan (flexiones): los codos se calculan solos. */
  handsFixed?: boolean;
  props: Prop[];
  /** Vista sugerida para la cámara. */
  view: 'lado' | 'frente' | 'tres';
  start: Pose;
  end: Pose;
  startText: string;
  endText: string;
  /** Ida (inicio → final) y vuelta: cómo se llama y cómo se respira. */
  toEnd: { label: string; breath: Breath };
  toStart: { label: string; breath: Breath };
  /** Segundos: ida, pausa abajo/arriba, vuelta, pausa al inicio. */
  tempo: [number, number, number, number];
  /** Punto cuyo recorrido se dibuja. */
  track: 'barra' | 'manos' | 'cadera' | 'hombros';
  /** Partes del maniquí que se marcan como «en tensión». */
  tension: Segment[];
  cues: string[];
  errors: string[];
};

const T = (t: Omit<Template, 'start' | 'end'> & { start: Half; end: Half; base?: Pose }): Template => {
  const base = t.base ?? STAND;
  const start = full(t.start, base);
  return { ...t, start, end: full(t.end, start) };
};

/** Plantillas. El orden importa: la primera que calza con el nombre gana (búlgara antes que sentadilla, etc.). */
export const TEMPLATES: Template[] = [
  T({
    id: 'bulgara', label: 'Sentadilla búlgara / zancada', match: /b[uú]lgara|zancada|estocada|lunge/i, anchor: 'pies', props: ['mancuernas'], view: 'lado',
    start: { hipL: 25, kneeL: 8, hipR: -28, kneeR: 12, ankleR: 35, el: 5, abd: 8 },
    end: { hipL: 92, kneeL: 95, hipR: -8, kneeR: 100, ankleR: 45, pitch: 8 },
    startText: 'De pie en paso largo, el peso en la pierna de adelante, tronco derecho.',
    endText: 'Baja hasta que el muslo de adelante quede casi paralelo al suelo y la rodilla de atrás cerca del piso.',
    toEnd: { label: 'Baja', breath: 'inhala' }, toStart: { label: 'Sube empujando con el talón de adelante', breath: 'exhala' },
    tempo: [2, 0.4, 1.2, 0.6], track: 'cadera', tension: ['muslos', 'gluteos'],
    cues: ['Baja en vertical, como si bajaras por un ascensor.', 'La rodilla de adelante sigue la línea de la punta del pie.', 'Empuja con todo el pie de adelante, sobre todo el talón.'],
    errors: ['La rodilla de adelante se va hacia adentro.', 'Inclinarse demasiado hacia adelante.', 'Paso muy corto: la rodilla pasa mucho la punta del pie y se levanta el talón.'],
  }),
  T({
    id: 'sentadilla', label: 'Sentadilla', match: /sentadilla|squat/i, anchor: 'pies', props: ['barra'], view: 'lado',
    start: { sh: 30, abd: 72, el: 125, stance: 12 },
    end: { pitch: 38, hip: 133, knee: 128, sh: 62, el: 125 },
    startText: 'De pie, pies al ancho de hombros, barra firme, pecho arriba y abdomen apretado.',
    endText: 'Cadera atrás y abajo hasta que el muslo quede al menos paralelo al suelo, talones apoyados.',
    toEnd: { label: 'Baja controlado', breath: 'inhala' }, toStart: { label: 'Sube empujando el suelo', breath: 'exhala' },
    tempo: [2, 0.4, 1.2, 0.6], track: 'barra', tension: ['muslos', 'gluteos'],
    cues: ['Toma aire y aprieta el abdomen antes de bajar.', 'Las rodillas siguen la dirección de las puntas de los pies.', 'Los talones no se despegan del suelo.'],
    errors: ['Rodillas hacia adentro al subir.', 'Talones que se levantan.', 'Redondear la espalda baja al final de la bajada.'],
  }),
  T({
    id: 'flexiones', label: 'Flexiones de brazos', match: /flexi[oó]n|push.?up|lagartija/i, anchor: 'pies', props: [], view: 'lado',
    start: { pitch: 71, sh: 76, abd: 20, el: 4, ankle: 20 },
    end: { pitch: 86, sh: 25, el: 130 },
    startText: 'Manos bajo los hombros, cuerpo en una línea recta de cabeza a talones.',
    endText: 'Baja el pecho hasta casi tocar el suelo, codos a unos 45° del cuerpo.',
    toEnd: { label: 'Baja', breath: 'inhala' }, toStart: { label: 'Empuja el suelo', breath: 'exhala' },
    tempo: [1.6, 0.3, 1, 0.5], track: 'hombros', tension: ['torso', 'brazos'],
    cues: ['Glúteos y abdomen apretados: el cuerpo es una tabla.', 'Codos hacia atrás en diagonal, no abiertos en T.', 'Baja el pecho, no la cabeza.'],
    errors: ['La cadera se hunde o queda muy arriba.', 'Codos abiertos a 90° del cuerpo.', 'Recorrido corto.'],
  }),
  T({
    id: 'banca', label: 'Press banca', match: /press (banca|inclinado|plano|declinado)|bench/i, anchor: 'cadera', props: ['barra', 'banco'], view: 'tres',
    start: { pitch: -90, hip: -15, knee: 75, sh: 90, abd: 14, el: 4 },
    end: { sh: 22, abd: 62, el: 92 },
    startText: 'Acostado, ojos bajo la barra, pies firmes en el suelo, omóplatos juntos y barra arriba con brazos estirados.',
    endText: 'Baja la barra hasta tocar suave la parte baja del pecho, codos a unos 45–70°.',
    toEnd: { label: 'Baja controlado', breath: 'inhala' }, toStart: { label: 'Empuja hacia arriba', breath: 'exhala' },
    tempo: [2, 0.3, 1.2, 0.5], track: 'barra', tension: ['torso', 'brazos'],
    cues: ['Omóplatos juntos y abajo durante toda la serie.', 'Muñecas derechas, la barra sobre el antebrazo.', 'Pies apoyados y glúteos en el banco.'],
    errors: ['Rebotar la barra en el pecho.', 'Codos totalmente abiertos (90°) que cargan el hombro.', 'Levantar los glúteos del banco.'],
  }),
  T({
    id: 'militar', label: 'Press militar', match: /press (militar|arnold|hombro)|overhead/i, anchor: 'pies', props: ['barra'], view: 'lado',
    start: { sh: 25, abd: 70, el: 130, stance: 10 },
    end: { sh: 172, abd: 14, el: 4 },
    startText: 'De pie, barra a la altura de la clavícula, codos un poco adelante, glúteos y abdomen apretados.',
    endText: 'Brazos estirados arriba, la barra sobre la mitad del pie y la cabeza «pasa» entre los brazos.',
    toEnd: { label: 'Empuja arriba', breath: 'exhala' }, toStart: { label: 'Baja controlado', breath: 'inhala' },
    tempo: [1.2, 0.4, 1.8, 0.5], track: 'barra', tension: ['brazos'],
    cues: ['Aprieta glúteos para no arquear la espalda.', 'La barra sube en línea recta, saca la cara del camino.', 'Al final, empuja «el techo».'],
    errors: ['Arquear mucho la espalda baja.', 'Empujar la barra hacia adelante en vez de arriba.', 'Usar impulso de piernas sin querer.'],
  }),
  T({
    id: 'dominadas', label: 'Dominadas', match: /dominada|jal[oó]n|pull.?up|chin/i, anchor: 'manos', props: ['barra_alta'], view: 'tres',
    start: { sh: 172, abd: 22, el: 4, knee: 30, hip: 10 },
    end: { sh: 60, abd: 48, el: 128 },
    startText: 'Colgado con brazos estirados, manos un poco más anchas que los hombros, hombros activos.',
    endText: 'Sube hasta que la barbilla pase la barra llevando los codos hacia abajo y atrás.',
    toEnd: { label: 'Sube', breath: 'exhala' }, toStart: { label: 'Baja controlado', breath: 'inhala' },
    tempo: [1.2, 0.4, 2, 0.5], track: 'hombros', tension: ['torso', 'brazos', 'antebrazos'],
    cues: ['Empieza bajando los hombros, lejos de las orejas.', 'Piensa en llevar los codos a los bolsillos.', 'Baja hasta estirar casi completo.'],
    errors: ['Balancearse con las piernas.', 'Medio recorrido arriba o abajo.', 'Encoger los hombros hacia las orejas.'],
  }),
  T({
    id: 'remo', label: 'Remo', match: /remo(?! al ment)|row/i, anchor: 'pies', props: ['barra'], view: 'lado',
    start: { pitch: 58, hip: 75, knee: 20, sh: 58, abd: 10, el: 4 },
    end: { sh: 8, abd: 22, el: 100 },
    startText: 'Cadera atrás, espalda recta inclinada, rodillas un poco flexionadas, barra colgando bajo los hombros.',
    endText: 'Lleva la barra al ombligo juntando los omóplatos, codos pegados al cuerpo.',
    toEnd: { label: 'Tira', breath: 'exhala' }, toStart: { label: 'Baja controlado', breath: 'inhala' },
    tempo: [1, 0.5, 1.6, 0.4], track: 'barra', tension: ['torso', 'brazos'],
    cues: ['La espalda no cambia de ángulo durante la serie.', 'Junta los omóplatos al final.', 'Tira con los codos, no con las manos.'],
    errors: ['Levantar el tronco para ayudarse.', 'Redondear la espalda.', 'Tirar hacia el pecho con los codos abiertos.'],
  }),
  T({
    id: 'rumano', label: 'Peso muerto rumano', match: /peso muerto|buenos d[ií]as|deadlift|rumano/i, anchor: 'pies', props: ['barra'], view: 'lado',
    start: { sh: 0, abd: 10, el: 3, knee: 8, hip: 8 },
    end: { pitch: 72, hip: 78, knee: 22, sh: 72 },
    startText: 'De pie, barra pegada a los muslos, rodillas apenas flexionadas, espalda neutra.',
    endText: 'Cadera atrás con la barra rozando las piernas hasta sentir el estiramiento atrás del muslo, espalda recta.',
    toEnd: { label: 'Cadera atrás', breath: 'inhala' }, toStart: { label: 'Sube empujando la cadera adelante', breath: 'exhala' },
    tempo: [2, 0.3, 1.2, 0.5], track: 'barra', tension: ['gluteos', 'muslos', 'torso'],
    cues: ['Es una bisagra: la cadera va atrás, no abajo.', 'La barra baja pegada a las piernas.', 'Espalda neutra todo el recorrido.'],
    errors: ['Redondear la espalda.', 'Doblar mucho las rodillas (se vuelve sentadilla).', 'Barra lejos del cuerpo.'],
  }),
  T({
    id: 'hipthrust', label: 'Hip thrust', match: /hip thrust|puente de gl[uú]teo/i, anchor: 'pies', props: ['banco', 'barra'], view: 'lado',
    start: { pitch: -62, hip: 63, knee: 125, sh: 20, abd: 40, el: 120 },
    end: { pitch: -88, hip: 5, knee: 90 },
    startText: 'Espalda alta apoyada en el banco, pies al ancho de cadera, barra sobre la cadera.',
    endText: 'Sube la cadera hasta que el tronco y los muslos queden en línea, rodillas a 90°, aprieta glúteos.',
    toEnd: { label: 'Sube la cadera', breath: 'exhala' }, toStart: { label: 'Baja controlado', breath: 'inhala' },
    tempo: [1, 1, 1.6, 0.4], track: 'cadera', tension: ['gluteos', 'muslos'],
    cues: ['Mentón hacia el pecho.', 'Aprieta los glúteos arriba 1 segundo.', 'Las rodillas no se cierran.'],
    errors: ['Arquear la espalda baja en vez de subir con la cadera.', 'Pies muy lejos o muy cerca.', 'Bajar sin control.'],
  }),
  T({
    id: 'fondos', label: 'Fondos', match: /fondos|dips?\b/i, anchor: 'manos', props: ['paralelas'], view: 'lado',
    start: { sh: -8, abd: 10, el: 4, knee: 60, hip: 10 },
    end: { sh: -50, el: 92, pitch: 18 },
    startText: 'Apoyado con brazos estirados, hombros lejos de las orejas.',
    endText: 'Baja hasta que los codos queden a unos 90°, tronco un poco inclinado.',
    toEnd: { label: 'Baja', breath: 'inhala' }, toStart: { label: 'Empuja arriba', breath: 'exhala' },
    tempo: [1.8, 0.3, 1, 0.5], track: 'hombros', tension: ['brazos', 'torso'],
    cues: ['Hombros abajo y atrás.', 'Codos hacia atrás, no abiertos.', 'Solo baja hasta donde el hombro esté cómodo.'],
    errors: ['Bajar demasiado y forzar el hombro.', 'Encoger los hombros.', 'Rebotar abajo.'],
  }),
  T({
    id: 'curl', label: 'Curl de bíceps', match: /curl(?! (femoral|de mu[nñ]eca))|martillo/i, anchor: 'pies', props: ['mancuernas'], view: 'lado',
    start: { sh: 4, abd: 8, el: 6 },
    end: { sh: 14, el: 138 },
    startText: 'De pie, brazos estirados al costado, codos pegados al cuerpo.',
    endText: 'Sube el peso doblando solo el codo hasta que el antebrazo quede casi vertical.',
    toEnd: { label: 'Sube', breath: 'exhala' }, toStart: { label: 'Baja lento', breath: 'inhala' },
    tempo: [1, 0.4, 2, 0.4], track: 'manos', tension: ['brazos', 'antebrazos'],
    cues: ['Los codos no se mueven: quedan al costado.', 'Baja lento y completo.', 'Tronco quieto.'],
    errors: ['Balancear el cuerpo para subir.', 'Adelantar los codos.', 'Media repetición abajo.'],
  }),
  T({
    id: 'laterales', label: 'Elevaciones laterales', match: /elevaci[oó]n(es)? lateral|p[aá]jaros/i, anchor: 'pies', props: ['mancuernas'], view: 'frente',
    start: { abd: 10, el: 14 },
    end: { abd: 86 },
    startText: 'De pie, mancuernas al costado, codos un poco doblados.',
    endText: 'Sube los brazos hacia los lados hasta la altura de los hombros, como vertiendo una jarra.',
    toEnd: { label: 'Sube', breath: 'exhala' }, toStart: { label: 'Baja lento', breath: 'inhala' },
    tempo: [1, 0.3, 2, 0.4], track: 'manos', tension: ['brazos'],
    cues: ['Sube con los codos, no con las manos.', 'Hombros lejos de las orejas.', 'Peso liviano y controlado.'],
    errors: ['Subir más allá de los hombros con impulso.', 'Encoger el trapecio.', 'Balancear el tronco.'],
  }),
  T({
    id: 'frontales', label: 'Elevaciones frontales', match: /elevaci[oó]n(es)? frontal/i, anchor: 'pies', props: ['mancuernas'], view: 'lado',
    start: { sh: 4, el: 8 },
    end: { sh: 92 },
    startText: 'De pie, mancuernas delante de los muslos.',
    endText: 'Sube los brazos al frente hasta la altura de los hombros.',
    toEnd: { label: 'Sube', breath: 'exhala' }, toStart: { label: 'Baja lento', breath: 'inhala' },
    tempo: [1, 0.3, 2, 0.4], track: 'manos', tension: ['brazos'],
    cues: ['Tronco quieto.', 'Brazos casi estirados.', 'Baja con control.'],
    errors: ['Usar impulso de la espalda.', 'Subir sobre la cabeza.'],
  }),
  T({
    id: 'frances', label: 'Press francés', match: /press franc[eé]s|skull/i, anchor: 'cadera', props: ['barra', 'banco'], view: 'lado',
    start: { pitch: -90, hip: -15, knee: 75, sh: 100, abd: 10, el: 4 },
    end: { el: 120 },
    startText: 'Acostado, barra arriba con brazos estirados apuntando un poco hacia atrás.',
    endText: 'Dobla solo los codos y baja la barra hacia la frente o detrás de la cabeza.',
    toEnd: { label: 'Baja', breath: 'inhala' }, toStart: { label: 'Estira', breath: 'exhala' },
    tempo: [2, 0.3, 1, 0.4], track: 'barra', tension: ['brazos'],
    cues: ['Los codos apuntan al techo y no se abren.', 'Solo se mueve el antebrazo.'],
    errors: ['Abrir los codos.', 'Mover el hombro para ayudarse.'],
  }),
  T({
    id: 'plancha', label: 'Plancha', match: /plancha(?! lateral)|plank/i, anchor: 'pies', props: [], view: 'lado',
    start: { pitch: 83, sh: 83, abd: 12, el: 90, ankle: 20 },
    end: { pitch: 83 },
    startText: 'Antebrazos en el suelo bajo los hombros, cuerpo recto de cabeza a talones.',
    endText: 'Mantén la posición: abdomen y glúteos apretados, sin hundir la cadera.',
    toEnd: { label: 'Mantén', breath: 'normal' }, toStart: { label: 'Mantén', breath: 'normal' },
    tempo: [2, 2, 2, 2], track: 'cadera', tension: ['torso', 'gluteos'],
    cues: ['Respira normal, sin aguantar el aire.', 'Empuja el suelo con los antebrazos.', 'Mirada al suelo.'],
    errors: ['Cadera hundida.', 'Cadera muy alta.', 'Aguantar la respiración.'],
  }),
];

export const templateFor = (name: string): Template | null => TEMPLATES.find((t) => t.match.test(name)) ?? null;

/* ── Tiempo, fases y poses ────────────────────────────────────────────────────────── */

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const o = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) {
    const x = a[key];
    const y = b[key];
    (o as Record<string, unknown>)[key] = x === null || y === null ? (k < 0.5 ? x : y) : (x as number) + ((y as number) - (x as number)) * k;
  }
  return o;
};

export type Phase = { name: 'ida' | 'pausa_final' | 'vuelta' | 'pausa_inicio'; label: string; breath: Breath; k: number };
/** Dónde está la repetición a los `sec` segundos (en bucle). `k` = 0 inicio … 1 final (con aceleración suave). */
export function phaseAt(t: Template, sec: number): Phase {
  const [a, b, c, d] = t.tempo;
  const total = a + b + c + d;
  let x = ((sec % total) + total) % total;
  if (x < a) return { name: 'ida', label: t.toEnd.label, breath: t.toEnd.breath, k: ease(x / a) };
  x -= a;
  if (x < b) return { name: 'pausa_final', label: 'Pausa', breath: t.toEnd.breath, k: 1 };
  x -= b;
  if (x < c) return { name: 'vuelta', label: t.toStart.label, breath: t.toStart.breath, k: 1 - ease(x / c) };
  return { name: 'pausa_inicio', label: 'Inicio', breath: 'normal', k: 0 };
}
export const repSeconds = (t: Template) => +t.tempo.reduce((s, x) => s + x, 0).toFixed(2);
export const poseAt = (t: Template, k: number) => lerpPose(t.start, t.end, Math.min(1, Math.max(0, k)));

/** El texto que narra la voz del dispositivo (gratis): inicio, final, claves y errores. */
export function narration(t: Template): string {
  return [
    `${t.label}.`,
    `Inicio: ${t.startText}`,
    `Final: ${t.endText}`,
    `${t.toEnd.label}${t.toEnd.breath === 'normal' ? '' : ` ${t.toEnd.breath === 'inhala' ? 'tomando aire' : 'botando el aire'}`}, y ${t.toStart.label.toLowerCase()}${t.toStart.breath === 'normal' ? '' : ` ${t.toStart.breath === 'inhala' ? 'tomando aire' : 'botando el aire'}`}.`,
    `Claves: ${t.cues.join(' ')}`,
    `Evita: ${t.errors.join(' ')}`,
  ].join(' ');
}
