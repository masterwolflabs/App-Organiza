/**
 * Sonidos propios (Daily sonidos-subir-propios, 2026-11-11): cada persona sube su sonido de notificación y
 * de alarma (MP3/M4A/WAV) desde el compu o el celular. Quedan en SU cuenta (bucket privado
 * «organiza-sounds», carpeta <uid>/, y la tabla organiza_custom_sounds — SQL 35), así sirven en todos sus
 * dispositivos. Se registran en `sounds.ts` y salen arriba en la lista.
 */
import { supabase } from '@/lib/supabaseClient';
import { getSound, setCustomSounds, setSound, type SoundKind } from '@/components/organiza/sounds';

const BUCKET = 'organiza-sounds';
export const MAX_BYTES = 5 * 1024 * 1024;
/** Largo máximo: una notificación es corta; una alarma puede ser una canción corta (igual se corta al minuto). */
export const MAX_SECONDS: Record<SoundKind, number> = { notificacion: 15, alarma: 120 };
export const ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.aac,.ogg';

export type CustomSound = { id: string; kind: SoundKind; name: string; path: string; bytes: number; seconds: number };
const sid = (id: string) => `u:${id}`;

let rows: CustomSound[] = [];
let loaded: Promise<CustomSound[]> | null = null;

/** Carga (una vez por sesión) la lista de la cuenta y la registra en el reproductor. Sin SQL 35 queda vacía. */
export function loadCustomSounds(force = false): Promise<CustomSound[]> {
  if (loaded && !force) return loaded;
  loaded = (async () => {
    const { data, error } = await supabase.from('organiza_custom_sounds').select('id, kind, name, path, bytes, seconds').order('created_at', { ascending: false });
    if (error || !data) {
      rows = [];
    } else rows = data as CustomSound[];
    await register();
    return rows;
  })();
  return loaded;
}

/** Links firmados por 1 día (el bucket es privado); el reproductor los baja una vez y los guarda decodificados. */
async function register() {
  const urls = new Map<string, string>();
  if (rows.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 86_400);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  (['notificacion', 'alarma'] as SoundKind[]).forEach((k) =>
    setCustomSounds(
      k,
      rows.filter((r) => r.kind === k && urls.has(r.path)).map((r) => ({ id: sid(r.id), label: r.name, url: urls.get(r.path)! })),
    ),
  );
}

export const customRow = (soundId: string) => rows.find((r) => sid(r.id) === soundId);

/** Cuánto dura el archivo (y de paso, que el navegador lo pueda leer). */
async function durationOf(file: File): Promise<number> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new Ctx();
  try {
    const b = await c.decodeAudioData(await file.arrayBuffer());
    return b.duration;
  } finally {
    void c.close();
  }
}

/** Sube un sonido. Devuelve el id para elegirlo («u:…») o un error en palabras simples. */
export async function uploadCustomSound(userId: string, kind: SoundKind, file: File): Promise<{ id?: string; error?: string }> {
  if (file.size > MAX_BYTES) return { error: `Pesa ${(file.size / 1024 / 1024).toFixed(1)} MB: el máximo es 5 MB.` };
  let seconds = 0;
  try {
    seconds = await durationOf(file);
  } catch {
    return { error: 'No pude leer ese archivo como audio. Prueba con un MP3, M4A o WAV.' };
  }
  if (seconds > MAX_SECONDS[kind]) return { error: `Dura ${Math.round(seconds)} s: para ${kind === 'alarma' ? 'una alarma' : 'una notificación'} el máximo es ${MAX_SECONDS[kind]} s.` };
  const id = crypto.randomUUID();
  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp3';
  const path = `${userId}/${id}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
  if (up.error) return { error: missing(up.error.message) };
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Mi sonido';
  const ins = await supabase.from('organiza_custom_sounds').insert({ id, kind, name, path, bytes: file.size, seconds });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: missing(ins.error.message) };
  }
  await loadCustomSounds(true);
  return { id: sid(id) };
}

export async function renameCustomSound(soundId: string, name: string) {
  const r = customRow(soundId);
  const n = name.trim().slice(0, 60);
  if (!r || !n) return;
  await supabase.from('organiza_custom_sounds').update({ name: n }).eq('id', r.id);
  await loadCustomSounds(true);
}

/** Borra el archivo y su fila. Si era el elegido, vuelve el predeterminado. */
export async function deleteCustomSound(soundId: string) {
  const r = customRow(soundId);
  if (!r) return;
  await supabase.storage.from(BUCKET).remove([r.path]);
  await supabase.from('organiza_custom_sounds').delete().eq('id', r.id);
  if (getSound(r.kind) === soundId) setSound(r.kind, '');
  await loadCustomSounds(true);
}

const missing = (msg: string) =>
  /bucket|relation|organiza_custom_sounds|not found|schema cache/i.test(msg) ? 'Falta activar los sonidos propios en la base (SQL 35). Avísale a Claude.' : `No se pudo subir: ${msg}`;
