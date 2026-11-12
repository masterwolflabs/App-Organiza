/**
 * Sonidos de los avisos del Horario, hechos aquí mismo (no se copian archivos de Apple: son suyos).
 * La lista imita su interfaz: alarmas por un lado, notificaciones por otro. Se elige uno de cada uno
 * por dispositivo. La alarma suena en bucle hasta que se cierra (máximo 1 minuto).
 */
type Note = [freq: number, seconds: number, wave?: OscillatorType];
/** De fábrica (`phrase`, sintetizado aquí) o propio de la persona (`url`, archivo subido; id «u:<uuid>»). */
export type Sound = { id: string; label: string; phrase: Note[]; gap: number; url?: string; custom?: boolean; /** Del equipo (Epidemic, bucket privado; id «e:<uuid>»). */ team?: boolean };

export const ALARM_SOUNDS: Sound[] = [
  { id: 'amanecer', label: 'Amanecer', phrase: [[523, 0.18], [659, 0.18], [784, 0.18], [1046, 0.35]], gap: 0.5 },
  { id: 'faro', label: 'Faro', phrase: [[880, 0.12], [880, 0.12], [880, 0.12], [880, 0.12]], gap: 0.6 },
  { id: 'pulso', label: 'Pulso', phrase: [[740, 0.09, 'square'], [0, 0.06], [740, 0.09, 'square'], [0, 0.06], [740, 0.09, 'square']], gap: 0.55 },
  { id: 'cristal', label: 'Cristal', phrase: [[1318, 0.15, 'triangle'], [1568, 0.15, 'triangle'], [2093, 0.4, 'triangle']], gap: 0.6 },
  { id: 'brisa', label: 'Brisa', phrase: [[392, 0.3], [494, 0.3], [587, 0.5]], gap: 0.7 },
  { id: 'campanario', label: 'Campanario', phrase: [[784, 0.5, 'triangle'], [659, 0.5, 'triangle'], [523, 0.8, 'triangle']], gap: 0.4 },
  { id: 'orbita', label: 'Órbita', phrase: [[600, 0.1, 'sawtooth'], [900, 0.1, 'sawtooth'], [1200, 0.1, 'sawtooth'], [900, 0.1, 'sawtooth']], gap: 0.5 },
  { id: 'despertar', label: 'Despertar suave', phrase: [[330, 0.4], [392, 0.4], [440, 0.6]], gap: 1 },
];

export const NOTIF_SOUNDS: Sound[] = [
  { id: 'nota', label: 'Nota', phrase: [[988, 0.12], [1318, 0.25]], gap: 0 },
  { id: 'gota', label: 'Gota', phrase: [[1400, 0.06], [900, 0.18]], gap: 0 },
  { id: 'acorde', label: 'Acorde', phrase: [[523, 0.1], [659, 0.1], [784, 0.3]], gap: 0 },
  { id: 'burbuja', label: 'Burbuja', phrase: [[600, 0.07], [800, 0.07], [1000, 0.12]], gap: 0 },
  { id: 'destello', label: 'Destello', phrase: [[2093, 0.08, 'triangle'], [2637, 0.2, 'triangle']], gap: 0 },
  { id: 'teclas', label: 'Teclas', phrase: [[1046, 0.05, 'square'], [0, 0.04], [1175, 0.05, 'square'], [0, 0.04], [1318, 0.1, 'square']], gap: 0 },
];

export type SoundKind = 'alarma' | 'notificacion';

/**
 * Sonidos propios (Daily sonidos-subir-propios, 2026-11-11): los carga `customSounds.ts` desde la cuenta
 * y quedan aquí registrados. Van arriba en la lista, antes que los de fábrica.
 */
const custom: Record<SoundKind, Sound[]> = { alarma: [], notificacion: [] };
/** Sonidos del equipo (Emanuel, 2026-11-12): Epidemic, solo cuentas Master Wolf (SQL 37). Van entre los propios y los de fábrica. */
const team: Record<SoundKind, Sound[]> = { alarma: [], notificacion: [] };
export function setTeamSounds(k: SoundKind, list: { id: string; label: string; url: string }[]) {
  team[k] = list.map((x) => ({ id: x.id, label: x.label, url: x.url, phrase: [], gap: 0.4, team: true }));
  // Solo el elegido se baja al tiro (para que la alarma suene sin espera); los demás, al probarlos.
  const chosen = team[k].find((x) => x.id === getSound(k));
  if (chosen) void bufferOf(chosen);
  listeners.forEach((f) => f());
}
const listeners = new Set<() => void>();
export function setCustomSounds(k: SoundKind, list: { id: string; label: string; url: string }[]) {
  custom[k] = list.map((x) => ({ id: x.id, label: x.label, url: x.url, phrase: [], gap: 0.4, custom: true }));
  // Se bajan y decodifican al tiro: así la alarma propia suena sin espera cuando llega su hora.
  custom[k].forEach((x) => void bufferOf(x));
  listeners.forEach((f) => f());
}
/** Avisa cuando cambian los sonidos propios (para refrescar listas). */
export function onCustomSounds(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
export const factoryOf = (k: SoundKind) => (k === 'alarma' ? ALARM_SOUNDS : NOTIF_SOUNDS);
export const soundsOf = (k: SoundKind): Sound[] => [...custom[k], ...team[k], ...factoryOf(k)];
const KEY = (k: SoundKind) => `organiza-sonido-${k}`;

export function getSound(k: SoundKind): string {
  try {
    const v = localStorage.getItem(KEY(k));
    // Uno propio («u:…») vale aunque su lista todavía no termine de cargar.
    if (v && (v.startsWith('u:') || v.startsWith('e:') || soundsOf(k).some((s) => s.id === v))) return v;
  } catch {
    /* modo privado */
  }
  return factoryOf(k)[0].id;
}
export function setSound(k: SoundKind, id: string) {
  try {
    localStorage.setItem(KEY(k), id);
  } catch {
    /* modo privado */
  }
}

let shared: AudioContext | null = null;
let master: AudioNode | null = null;
const ctx = () => {
  shared ??= new AudioContext();
  // Si el navegador la dejó en pausa (sin un toque reciente), la despierta.
  if (shared.state === 'suspended') void shared.resume().catch(() => {});
  return shared;
};
/**
 * Salida fuerte (Emanuel, 2026-11-10: «que suene como cuando pones una canción en YouTube o Spotify»):
 * los tonos suenan casi al máximo, al nivel de la música, con un limitador para que no se saturen.
 */
const out = (c: AudioContext) => {
  if (!master) {
    // Limitador: los tonos van casi al máximo (antes ~15%) y esto evita que al sumarse se rompan.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -3;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.1;
    comp.connect(c.destination);
    master = comp;
  }
  return master;
};

/** Agenda una frase desde `at`; devuelve cuánto dura. */
function phrase(c: AudioContext, s: Sound, at: number) {
  let t = at;
  for (const [freq, dur, wave = 'sine'] of s.phrase) {
    if (freq) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      const vol = wave === 'square' || wave === 'sawtooth' ? 0.35 : 0.8;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      // Se sostiene casi entera y cae al final: más cuerpo que un «tic».
      gain.gain.setValueAtTime(vol, t + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(out(c));
      osc.start(t);
      osc.stop(t + dur + 0.02);
      // Una octava arriba, más suave: se oye con parlantes chicos y por encima de la música.
      if (wave === 'sine' || wave === 'triangle') {
        const hi = c.createOscillator();
        const hg = c.createGain();
        hi.type = 'sine';
        hi.frequency.value = freq * 2;
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.01);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        hi.connect(hg).connect(out(c));
        hi.start(t);
        hi.stop(t + dur + 0.02);
      }
    }
    t += dur;
  }
  return t - at;
}

const find = (k: SoundKind, id?: string) => soundsOf(k).find((s) => s.id === (id ?? getSound(k))) ?? factoryOf(k)[0];

/** Archivo propio ya decodificado (se baja una vez por sesión). */
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function bufferOf(s: Sound): Promise<AudioBuffer | null> {
  if (!s.url) return Promise.resolve(null);
  if (!buffers.has(s.id)) {
    buffers.set(
      s.id,
      fetch(s.url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx().decodeAudioData(b))
        .catch(() => {
          buffers.delete(s.id);
          return null;
        }),
    );
  }
  return buffers.get(s.id)!;
}
/** Toca un archivo propio por el mismo limitador que los de fábrica. Devuelve cómo pararlo. */
function playBuffer(c: AudioContext, b: AudioBuffer, loop: boolean) {
  const src = c.createBufferSource();
  src.buffer = b;
  src.loop = loop;
  const g = c.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(out(c));
  src.start(c.currentTime + 0.02);
  return () => {
    try {
      src.stop();
    } catch {
      /* ya paró */
    }
  };
}

/** Suena una vez (notificaciones). */
export function playOnce(k: SoundKind, id?: string) {
  try {
    const c = ctx();
    const s = find(k, id);
    if (s.custom) {
      // Si el archivo no carga (sin internet, borrado), suena el de fábrica: el aviso nunca queda mudo.
      void bufferOf(s).then((b) => (b ? playBuffer(c, b, false) : phrase(c, factoryOf(k)[0], c.currentTime + 0.02)));
      return;
    }
    phrase(c, s, c.currentTime + 0.02);
  } catch {
    /* sin audio */
  }
}

/** Suena en bucle hasta que se llama a la función que devuelve (o hasta `max` segundos). */
export function playLoop(k: SoundKind, id?: string, max = 60): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const until = Date.now() + max * 1000;
  try {
    const c = ctx();
    const s = find(k, id);
    if (s.custom) {
      // Propio: el archivo en bucle (si no carga, el de fábrica en bucle), hasta cerrarlo o `max` segundos.
      let halt: (() => void) | undefined;
      let fallback: (() => void) | undefined;
      void bufferOf(s).then((b) => {
        if (stopped) return;
        if (b) halt = playBuffer(c, b, true);
        else fallback = playLoop(k, factoryOf(k)[0].id, max);
      });
      timer = setTimeout(() => halt?.(), max * 1000);
      return () => {
        stopped = true;
        clearTimeout(timer);
        halt?.();
        fallback?.();
      };
    }
    const round = () => {
      if (stopped || Date.now() > until) return;
      const len = phrase(c, s, c.currentTime + 0.02);
      timer = setTimeout(round, (len + Math.max(s.gap, 0.3)) * 1000);
    };
    round();
  } catch {
    /* sin audio */
  }
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** El «toc» de la rueda al pasar cada número: suave, grave y cortito, como el selector del iPhone. */
export function tick() {
  try {
    const c = ctx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.03);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {
    /* sin audio */
  }
}
