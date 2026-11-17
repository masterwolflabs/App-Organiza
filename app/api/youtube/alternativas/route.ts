import { userOf } from '@/lib/server/admin';

/**
 * 🔎 Otra subida que sí suene (Daily focus-musica-bloqueada-solucion, parte 3): busca en YouTube la misma
 * canción y devuelve solo videos que se pueden reproducir fuera de YouTube (`videoEmbeddable`).
 * Llave gratis `YOUTUBE_API_KEY` (YouTube Data API v3) en Vercel; sin llave responde `{ missingKey: true }`.
 * Solo personas con sesión (cuida la cuota diaria).
 */
export async function GET(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ missingKey: true, items: [] });
  const params = new URL(request.url).searchParams;
  const video = (params.get('video') ?? '').replace(/[^\w-]/g, '').slice(0, 20);
  let q = (params.get('q') ?? '').trim().slice(0, 120);
  // Sin título: se pide a YouTube (oEmbed no necesita llave).
  if (!q && video) {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${video}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    q = String(o?.title ?? '').slice(0, 120);
  }
  if (!q) return Response.json({ items: [] });
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  Object.entries({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8', q, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return Response.json({ error: 'YouTube no respondió (¿cuota del día agotada?).', items: [] }, { status: 502 });
  const j = (await res.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] };
  const items = (j.items ?? [])
    .map((x) => ({ id: x.id?.videoId ?? '', title: x.snippet?.title ?? '', channel: x.snippet?.channelTitle ?? '' }))
    .filter((x) => x.id && x.id !== video);
  return Response.json({ q, items });
}
