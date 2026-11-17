'use client';

import { useEffect, useState } from 'react';
import { spotifyFinish } from '@/lib/spotify';

/** Vuelta de Spotify al conectar (ver lib/spotify.ts): guarda la conexión y regresa a donde estabas. */
export default function SpotifyBack() {
  const [msg, setMsg] = useState('Conectando Spotify…');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    if (!code) {
      setMsg(q.get('error') === 'access_denied' ? 'No diste permiso a Spotify. Puedes volver a intentarlo cuando quieras.' : 'No llegó la respuesta de Spotify.');
      const t = setTimeout(() => window.location.replace('/#alimentacion'), 2500);
      return () => clearTimeout(t);
    }
    spotifyFinish(code).then((back) => window.location.replace(`/${back}`));
  }, []);
  return <main className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-zinc-300">{msg}</main>;
}
