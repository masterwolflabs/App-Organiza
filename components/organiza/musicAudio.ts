/**
 * 🎵 Audio propio de una canción del focus (Daily focus-musica-bloqueada-solucion, 2026-11-17): cuando
 * YouTube no deja sonar una canción dentro de Master Planner (el dueño o el sello la bloquean), la persona
 * sube su propio archivo o pega un link de Google Drive / Dropbox / MP3. Si la canción tiene audio propio,
 * suena ese (con su desde/hasta, crossfade y volumen); si se quita, vuelve a YouTube.
 *
 * `Video.audio` guarda `storage:<uid>/<id>.<ext>` (bucket privado «organiza-music», SQL 43) o el link pegado.
 */
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

const BUCKET = 'organiza-music';
export const MAX_MUSIC_BYTES = 50 * 1024 * 1024;
export const MUSIC_ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/flac,.mp3,.m4a,.wav,.aac,.ogg,.flac';

/** Link pegado → uno que el reproductor pueda tocar directo (Drive y Dropbox se convierten a descarga). */
export function directAudioUrl(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    if (u.hostname.endsWith('drive.google.com')) {
      const id = u.pathname.match(/\/d\/([^/]+)/)?.[1] ?? u.searchParams.get('id');
      return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
    }
    if (u.hostname.endsWith('dropbox.com')) {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      return u.toString();
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Nombre para mostrar de un link de audio (Drive y Dropbox no dicen el nombre del archivo). */
export function linkName(link: string): string {
  try {
    const u = new URL(link.trim());
    if (u.hostname.endsWith('drive.google.com')) return 'Audio de Google Drive';
    const file = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace(/\.[^.]+$/, '').trim();
    if (u.hostname.endsWith('dropbox.com')) return file || 'Audio de Dropbox';
    return file.slice(0, 80) || 'Audio de link';
  } catch {
    return 'Audio de link';
  }
}

/** Drive o Dropbox: no se tocan directo (Drive no le entrega el audio al reproductor); se traen a tu cuenta. */
export const isCloudLink = (link: string) => /^https:\/\/(drive\.google\.com|docs\.google\.com|(www\.)?dropbox\.com)\//i.test(link.trim());

/**
 * Un link pegado → el audio de la canción. Drive y Dropbox se bajan UNA vez y quedan guardados en tu
 * cuenta (`/api/music/import`, 2026-11-18); un MP3 de otra página se toca directo.
 */
export async function audioFromLink(link: string): Promise<{ audio: string; name: string } | { error: string }> {
  if (!isCloudLink(link)) return isAudioLink(link) ? { audio: link.trim(), name: linkName(link) } : { error: 'Pega un link de Google Drive, Dropbox o de un MP3.' };
  try {
    const r = await authFetch('/api/music/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: link.trim() }) });
    const j = (await r.json().catch(() => ({}))) as { audio?: string; name?: string; error?: string };
    if (!r.ok || !j.audio) return { error: j.error || 'No pude traer el archivo. Intenta de nuevo.' };
    return { audio: j.audio, name: j.name || linkName(link) };
  } catch {
    return { error: 'No pude traer el archivo. Revisa tu internet.' };
  }
}

/** ¿Es un link que vale la pena probar? (Drive, Dropbox o cualquier http). */
export const isAudioLink = (link: string) => directAudioUrl(link) !== null;

const signed = new Map<string, { url: string; until: number }>();

/** La dirección que toca el reproductor (los archivos subidos se firman por 1 día). */
const imported = new Map<string, Promise<string | null>>();
export async function resolveAudio(audio: string): Promise<string | null> {
  // Link de Drive/Dropbox guardado antes del 18 nov: se trae a tu cuenta la primera vez y suena desde ahí.
  if (isCloudLink(audio)) {
    if (!imported.has(audio)) imported.set(audio, audioFromLink(audio).then((r) => ('audio' in r ? r.audio : null)));
    const stored = await imported.get(audio)!;
    if (!stored) imported.delete(audio);
    return stored && stored.startsWith('storage:') ? resolveAudio(stored) : null;
  }
  if (!audio.startsWith('storage:')) return directAudioUrl(audio);
  const path = audio.slice('storage:'.length);
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 86_400);
  if (!data?.signedUrl) return null;
  signed.set(path, { url: data.signedUrl, until: Date.now() + 80_000_000 });
  return data.signedUrl;
}

/** Sube un archivo de audio a la cuenta. Devuelve el valor para `Video.audio` o el error en palabras simples. */
export async function uploadMusic(file: File): Promise<{ audio: string; name: string } | { error: string }> {
  if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)) return { error: 'Ese archivo no es de audio. Prueba con un MP3, M4A o WAV.' };
  if (file.size > MAX_MUSIC_BYTES) return { error: `Pesa ${(file.size / 1048576).toFixed(1)} MB: el máximo es 50 MB.` };
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { error: 'Inicia sesión para subir tu audio.' };
  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp3';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
  if (up.error) return { error: /bucket/i.test(up.error.message) ? 'Falta preparar el espacio de música (SQL 43).' : `No se pudo subir: ${up.error.message}` };
  return { audio: `storage:${path}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Mi audio' };
}
