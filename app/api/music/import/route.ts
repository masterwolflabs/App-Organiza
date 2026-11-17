import { admin, userOf } from '@/lib/server/admin';

/**
 * 🎵 Traer una canción de Google Drive o Dropbox a tu cuenta (Daily focus-drive-importar, 2026-11-18).
 * Drive no le entrega el audio directo al reproductor del navegador (sale «Format error»), así que el
 * servidor lo baja UNA vez y lo guarda en tu carpeta del bucket privado «organiza-music» (SQL 48, ≤ 50 MB).
 * Solo links de Drive y Dropbox (nunca otras direcciones). Devuelve el valor para `Video.audio`.
 */
export const maxDuration = 60;
const MAX = 50 * 1024 * 1024;
const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
const MIME: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };

/** El link pegado → la dirección de descarga (solo Drive y Dropbox). */
function source(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') {
      const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get('id');
      return id && /^[\w-]{10,}$/.test(id) ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : null;
    }
    if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const { link } = (await request.json().catch(() => ({}))) as { link?: string };
  const src = source(String(link ?? ''));
  if (!src) return Response.json({ error: 'Pega un link de Google Drive o Dropbox.' }, { status: 400 });

  const res = await fetch(src, { redirect: 'follow', cache: 'no-store' }).catch(() => null);
  if (!res?.ok || !res.body) return Response.json({ error: 'Drive no entregó el archivo. Revisa que esté compartido «Cualquier persona con el enlace».' }, { status: 502 });
  // Drive manda el nombre en UTF-8 crudo (los headers llegan como latin1: «â€”» en vez de «—»).
  const raw = res.headers.get('content-disposition') ?? '';
  const disp = /[^\x00-\xff]/.test(raw) ? raw : Buffer.from(raw, 'latin1').toString('utf8');
  const enc = disp.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let fileName = disp.match(/filename="?([^";]+)"?/i)?.[1] ?? '';
  try {
    if (enc) fileName = decodeURIComponent(enc);
  } catch {}
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type] ?? fileName.match(/\.(mp3|m4a|aac|wav|ogg|webm|flac)$/i)?.[1]?.toLowerCase();
  if (!ext) return Response.json({ error: type.includes('html') ? 'Drive pidió iniciar sesión: comparte el archivo como «Cualquier persona con el enlace».' : 'Ese archivo no es de audio (MP3, M4A o WAV).' }, { status: 400 });
  if (Number(res.headers.get('content-length') ?? 0) > MAX) return Response.json({ error: 'Pesa más de 50 MB: usa una versión más liviana.' }, { status: 413 });

  // Se lee con tope (por si Drive no dice el tamaño).
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX) {
      await reader.cancel();
      return Response.json({ error: 'Pesa más de 50 MB: usa una versión más liviana.' }, { status: 413 });
    }
    chunks.push(value);
  }
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await admin().storage.from('organiza-music').upload(path, Buffer.concat(chunks), { contentType: MIME[ext] ?? 'audio/mpeg', upsert: false });
  if (up.error) return Response.json({ error: `No se pudo guardar: ${up.error.message}` }, { status: 500 });
  const name = fileName.replace(/\.[^.]+$/, '').trim().slice(0, 80) || 'Audio de Google Drive';
  return Response.json({ audio: `storage:${path}`, name });
}
