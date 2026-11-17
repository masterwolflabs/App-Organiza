import { sourceUrl, verifyStream } from '@/lib/server/musicStream';

/**
 * ☁️ Toca una canción de Drive/Dropbox sin copiarla (ver lib/server/musicStream.ts). Responde POR PARTES
 * (≤ 4 MB cada una, 206 + Content-Range): el reproductor pide la siguiente solo. Así ninguna respuesta pasa
 * del límite de Vercel y no se guarda nada.
 */
export const maxDuration = 30;
const CHUNK = 4_000_000;
const MIME: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const k = q.get('s') ?? '';
  if (!verifyStream(k, Number(q.get('e')), q.get('g') ?? '')) return new Response('Permiso vencido', { status: 403 });
  const src = sourceUrl(k);
  if (!src) return new Response('No', { status: 400 });
  const m = (request.headers.get('range') ?? '').match(/bytes=(\d*)-(\d*)/);
  const start = m?.[1] ? Number(m[1]) : 0;
  const end = Math.min(m?.[2] ? Number(m[2]) : Infinity, start + CHUNK - 1);
  const up = await fetch(src, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store', signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!up || !up.body || (up.status !== 206 && up.status !== 200)) return new Response('Drive no entregó el archivo', { status: 502 });
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
  // Drive a veces dice application/binary: se le pone el tipo por la extensión del nombre.
  const type = (up.headers.get('content-type') ?? '').split(';')[0];
  const ext = (up.headers.get('content-disposition') ?? '').match(/\.(mp3|m4a|aac|wav|ogg|webm|flac)"?\s*(;|$)/i)?.[1]?.toLowerCase();
  headers.set('Content-Type', type.startsWith('audio/') ? type : (ext && MIME[ext]) || 'audio/mpeg');
  const cr = up.headers.get('content-range');
  if (up.status === 206 && cr) {
    headers.set('Content-Range', cr);
    const len = up.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    return new Response(up.body, { status: 206, headers });
  }
  // Sin partes (Dropbox a veces): se manda entero solo si es chico.
  const len = Number(up.headers.get('content-length') ?? 0);
  if (len && len <= CHUNK) {
    headers.set('Content-Length', String(len));
    return new Response(up.body, { status: 200, headers });
  }
  await up.body.cancel().catch(() => {});
  return new Response('El archivo no se puede pedir por partes', { status: 502 });
}
