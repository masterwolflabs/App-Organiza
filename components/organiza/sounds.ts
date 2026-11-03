/** Sonidos de los avisos del Horario. Se elige uno por dispositivo (Configuración del aviso en cada bloque). */
export const SOUNDS = [
  { id: 'clasico', label: 'Clásico', notes: [880, 660] },
  { id: 'suave', label: 'Suave', notes: [523, 659, 784] },
  { id: 'campana', label: 'Campana', notes: [1046, 784] },
  { id: 'digital', label: 'Digital', notes: [1200, 1200, 900] },
] as const;
export type SoundId = (typeof SOUNDS)[number]['id'];

const KEY = 'organiza-sonido';
export function getSound(): SoundId {
  try {
    const v = localStorage.getItem(KEY);
    if (SOUNDS.some((s) => s.id === v)) return v as SoundId;
  } catch {
    /* modo privado */
  }
  return 'clasico';
}
export function setSound(id: SoundId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* modo privado */
  }
}

/** Suena `times` notas del sonido elegido (notificación 2, alarma 6). */
export function playSound(times: number, id: SoundId = getSound()) {
  try {
    const notes = SOUNDS.find((s) => s.id === id)?.notes ?? SOUNDS[0].notes;
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = id === 'digital' ? 'square' : id === 'campana' ? 'triangle' : 'sine';
      osc.frequency.value = notes[i % notes.length];
      const at = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(id === 'digital' ? 0.06 : 0.15, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + (id === 'campana' ? 0.6 : 0.28));
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + (id === 'campana' ? 0.6 : 0.28));
    }
  } catch {
    /* sin audio */
  }
}
