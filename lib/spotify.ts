'use client';

/**
 * Spotify en el modo cocina (Emanuel, 2026-11-16, tiene Premium): controlar lo que ya suena en Spotify —
 * pausar, siguiente, anterior, volumen — desde Master Planner. Buscar canciones se hace en Spotify.
 * Conexión con PKCE (sin clave secreta): necesita `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` (una app registrada en
 * developer.spotify.com con la dirección de vuelta `<origen>/spotify`). Los tokens quedan en este navegador.
 * Sin client id, el panel solo ofrece «Abrir Spotify».
 */
export const SPOTIFY_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? '';
const KEY = 'mp-spotify';
const VERIFIER = 'mp-spotify-verifier';
const BACK = 'mp-spotify-back';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
type Tokens = { access: string; refresh: string; expires: number };

const redirectUri = () => `${window.location.origin}/spotify`;
const read = (): Tokens | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const write = (t: Tokens | null) => {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {}
};
export const spotifyConnected = () => !!read();
export const spotifyDisconnect = () => write(null);

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Lleva a Spotify a pedir permiso; vuelve a /spotify y de ahí a donde estabas. */
export async function spotifyConnect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  localStorage.setItem(VERIFIER, verifier);
  localStorage.setItem(BACK, window.location.hash || '#alimentacion');
  const q = new URLSearchParams({ client_id: SPOTIFY_ID, response_type: 'code', redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES });
  window.location.href = `https://accounts.spotify.com/authorize?${q}`;
}

async function token(body: Record<string, string>): Promise<Tokens | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: SPOTIFY_ID, ...body }) });
  if (!res.ok) return null;
  const j = await res.json();
  const prev = read();
  const t = { access: j.access_token, refresh: j.refresh_token ?? prev?.refresh ?? '', expires: Date.now() + (j.expires_in - 60) * 1000 };
  write(t);
  return t;
}

/** La página /spotify: cambia el código por los tokens y devuelve a donde estabas. */
export async function spotifyFinish(code: string): Promise<string> {
  const verifier = localStorage.getItem(VERIFIER) ?? '';
  await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
  localStorage.removeItem(VERIFIER);
  return localStorage.getItem(BACK) ?? '#alimentacion';
}

async function access(): Promise<string | null> {
  const t = read();
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  return (await token({ grant_type: 'refresh_token', refresh_token: t.refresh }))?.access ?? null;
}

export type NowPlaying = { playing: boolean; title: string; artist: string; art: string | null; volume: number | null; device: string | null } | null;

async function api(path: string, method = 'GET'): Promise<Response | null> {
  const a = await access();
  if (!a) return null;
  return fetch(`https://api.spotify.com/v1/me/player${path}`, { method, headers: { Authorization: `Bearer ${a}` } });
}

/** Lo que suena ahora (null = nada abierto en ningún equipo). */
export async function spotifyNow(): Promise<NowPlaying> {
  const r = await api('');
  if (!r || r.status === 204 || !r.ok) return null;
  const j = await r.json();
  const it = j.item;
  return {
    playing: !!j.is_playing,
    title: it?.name ?? '',
    artist: (it?.artists ?? []).map((a: { name: string }) => a.name).join(', ') || it?.show?.name || '',
    art: it?.album?.images?.[it.album.images.length - 1]?.url ?? it?.images?.[0]?.url ?? null,
    volume: j.device?.volume_percent ?? null,
    device: j.device?.name ?? null,
  };
}
export const spotifyPlay = () => api('/play', 'PUT');
export const spotifyPause = () => api('/pause', 'PUT');
export const spotifyNext = () => api('/next', 'POST');
export const spotifyPrev = () => api('/previous', 'POST');
export const spotifyVolume = (v: number) => api(`/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(v)))}`, 'PUT');
