import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ☁️ Canciones de Drive/Dropbox SIN copiarlas (Emanuel, 2026-11-18: que una canción no ocupe almacenamiento).
 * El reproductor pide `/api/music/stream?s=…&e=…&g=…` por partes; el servidor las trae de Drive. El permiso va
 * firmado (HMAC con una clave derivada de la llave de servicio, solo servidor) y dura 1 día.
 */
const key = () => createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').update('master-planner/music-stream').digest();

/** El link pegado → de dónde se baja (solo Drive y Dropbox) y una clave corta para firmar. */
export function cloudSource(link: string): { url: string; key: string } | null {
  try {
    const u = new URL(link.trim());
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com' || u.hostname === 'drive.usercontent.google.com') {
      const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get('id');
      return id && /^[\w-]{10,}$/.test(id) ? { url: driveUrl(id), key: `d:${id}` } : null;
    }
    if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com' || u.hostname === 'dl.dropboxusercontent.com') {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      const raw = u.toString();
      return { url: raw, key: `x:${Buffer.from(raw).toString('base64url')}` };
    }
    return null;
  } catch {
    return null;
  }
}
const driveUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
/** La clave firmada → la dirección real de descarga. */
export function sourceUrl(k: string): string | null {
  if (k.startsWith('d:') && /^[\w-]{10,}$/.test(k.slice(2))) return driveUrl(k.slice(2));
  if (k.startsWith('x:')) {
    const raw = Buffer.from(k.slice(2), 'base64url').toString();
    return /^https:\/\/(www\.)?dropbox\.com\//.test(raw) ? raw : null;
  }
  return null;
}

const sig = (k: string, e: number) => createHmac('sha256', key()).update(`${k}.${e}`).digest('base64url');
/** Dirección firmada para que el reproductor la toque (vale 1 día). */
export function signedStream(k: string) {
  const e = Date.now() + 86_400_000;
  return `/api/music/stream?s=${encodeURIComponent(k)}&e=${e}&g=${sig(k, e)}`;
}
export function verifyStream(k: string, e: number, g: string) {
  if (!k || !Number.isFinite(e) || e < Date.now() || !g) return false;
  const good = Buffer.from(sig(k, e));
  const got = Buffer.from(g);
  return good.length === got.length && timingSafeEqual(good, got);
}
export const shortHash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
