import { admin, userOf } from '@/lib/server/admin';
import { cloudSource, signedStream } from '@/lib/server/musicStream';

/**
 * 🎵 Audio propio del focus.
 * - `{ link }` (Google Drive / Dropbox): NO se copia (Emanuel, 2026-11-18: una canción no debe ocupar el
 *   almacenamiento). Se revisa que sea audio y que esté compartido, y se devuelve una dirección firmada de
 *   `/api/music/stream` (1 día) que la trae de Drive por partes. La canción guarda el link tal cual.
 * - `{ path }` (archivo subido con «Subir archivo», bucket privado organiza-music): se firma aquí.
 */
export const maxDuration = 30;

/** El nombre del archivo que manda Drive (UTF-8 crudo: los headers llegan como latin1, «â€”» en vez de «—»). */
function nameOf(raw: string) {
  const disp = /[^\x00-\xff]/.test(raw) ? raw : Buffer.from(raw, 'latin1').toString('utf8');
  const enc = disp.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let file = disp.match(/filename="?([^";]+)"?/i)?.[1] ?? '';
  try {
    if (enc) file = decodeURIComponent(enc);
  } catch {}
  return file.replace(/\.[^.]+$/, '').trim().slice(0, 80);
}

export async function POST(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const { link, path: own } = (await request.json().catch(() => ({}))) as { link?: string; path?: string };

  if (own) {
    const p = String(own).replace(/^storage:/, '');
    if (!p.startsWith(`${user.id}/`) || p.includes('..')) return Response.json({ error: 'Ese audio no es tuyo.' }, { status: 403 });
    const url = (await admin().storage.from('organiza-music').createSignedUrl(p, 86_400)).data?.signedUrl;
    return url ? Response.json({ url }) : Response.json({ error: 'No encontré tu audio.' }, { status: 404 });
  }

  const src = cloudSource(String(link ?? ''));
  if (!src) return Response.json({ error: 'Pega un link de Google Drive o Dropbox.' }, { status: 400 });
  // Un byte para saber si se puede tocar (compartido, es audio) y cómo se llama. Tope de 8 s.
  const head = await fetch(src.url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null);
  head?.body?.cancel().catch(() => {});
  if (head) {
    const type = (head.headers.get('content-type') ?? '').toLowerCase();
    if (type.includes('text/html')) return Response.json({ error: 'Drive pidió iniciar sesión: comparte el archivo como «Cualquier persona con el enlace».' }, { status: 400 });
    if (!head.ok) return Response.json({ error: 'Drive no entregó el archivo. Revisa que esté compartido «Cualquier persona con el enlace».' }, { status: 502 });
  }
  return Response.json({ audio: String(link).trim(), url: signedStream(src.key), name: head ? nameOf(head.headers.get('content-disposition') ?? '') : '' });
}
