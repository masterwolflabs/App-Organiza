'use client';

import { ItemIcon } from '@/components/organiza/IconPicker';
import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Loader2, Music, Pause, Play, Plus, Repeat, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { canEmbed, fmtSeconds, parseYouTube, playlistIds, previewVolume, toSeconds } from '@/components/organiza/YouTubeList';
import { useGuardedClose } from '@/components/organiza/UnsavedGuard';
import type { Item, Module, Video } from '@/components/organiza/model';
import { audioFromLink, isAudioLink, isCloudLink, linkName } from '@/components/organiza/musicAudio';
import { isDesktop } from '@/lib/desktop';
import { authFetch } from '@/lib/authFetch';
import { isSpotifyLink, parseSpotify, SPOTIFY_ID, spotifyCanStream, spotifyConnect, spotifyConnected, spotifyInApp, spotifyKind, spotifyMeta, spotifyUrl } from '@/lib/spotify';

const mid = () => Math.random().toString(36).slice(2, 9);

/** 🎧 Nombre y carátula de una canción de Spotify (2026-11-18). */
function useSpotifyMeta(id: string | null) {
  const [m, setM] = useState<{ title: string; thumb: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void spotifyMeta(id).then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, [id]);
  return m;
}
const SpotifyCover: React.FC<{ id: string }> = ({ id }) => {
  const m = useSpotifyMeta(id);
  // eslint-disable-next-line @next/next/no-img-element
  return m?.thumb ? <img src={m.thumb} alt="" className="h-11 w-20 shrink-0 rounded-md object-cover" /> : <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-md bg-[#1ed760]/15 text-lg">🎧</span>;
};
const SpotifyTitle: React.FC<{ id: string }> = ({ id }) => {
  const m = useSpotifyMeta(id);
  const kind = { track: 'Canción', episode: 'Episodio', album: 'Álbum', playlist: 'Playlist', show: 'Podcast', artist: 'Artista' }[spotifyKind(id)];
  return <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-zinc-300"><span className="font-semibold text-[#1ed760]">Spotify · {kind}</span> · {m?.title || '…'}</span>;
};
/** ¿Puede sonar? Conectar Spotify (una vez, con Premium) para que suene dentro de Master Planner. */
const SpotifyStatus: React.FC = () => {
  if (!SPOTIFY_ID) return <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">🔑 Spotify todavía no está activado en Master Planner.</p>;
  const ok = spotifyConnected() && spotifyCanStream();
  if (ok) return <p className="mt-2 text-[11px] font-semibold text-[#1ed760]">✓ Spotify conectado: {isDesktop() ? 'en la app de Mac suena en tu Spotify abierto (computador o teléfono).' : 'suena dentro de Master Planner.'}</p>;
  return (
    <div className="mt-2 rounded-lg bg-[#1ed760]/10 px-2 py-1.5 text-[11px] text-emerald-100 ring-1 ring-[#1ed760]/30">
      <p>Para que las canciones de Spotify suenen aquí, conecta Spotify una vez (Premium). <b>Guarda antes</b>: vas a Spotify y vuelves.</p>
      <button type="button" onClick={() => void spotifyConnect()} className="mt-1.5 rounded-lg bg-[#1ed760] px-2.5 py-1 text-xs font-bold text-[#09090b] hover:brightness-110">{spotifyConnected() ? 'Reconectar Spotify (permiso para sonar aquí)' : 'Conectar Spotify'}</button>
    </div>
  );
};

/** Aviso si quien subió el video no deja reproducirlo fuera de YouTube. `children` = el botón «🎵 Usar mi audio». */
const EmbedCheck: React.FC<{ video: string; children?: React.ReactNode }> = ({ video, children }) => {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    canEmbed(video).then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, [video]);
  if (ok === null) return <p className="mt-2 text-[11px] text-zinc-500">Revisando si suena en Master Planner…</p>;
  if (ok) return <p className="mt-2 text-[11px] font-semibold text-emerald-300">✓ Suena en Master Planner</p>;
  return (
    <div className="mt-2 rounded-lg bg-rose-500/15 px-2 py-1.5 text-xs text-rose-200 ring-1 ring-rose-400/30">
      <p>⚠️ Esta canción no puede sonar dentro de Master Planner: su dueño (o el sello, por derechos) solo deja escucharla en YouTube. Para que suene aquí, usa tu propio audio (un archivo o un link de Drive / Dropbox / MP3), o busca otra subida y usa 🔄 Cambiar.</p>
      {isDesktop() && <p className="mt-1 font-semibold text-emerald-200">💻 En esta app de Mac igual suena: se abre escondida en una ventanita de YouTube (📺 para verla).</p>}
      {children}
    </div>
  );
};

/**
 * 🔎 Otra subida que sí suene (2026-11-17): busca la misma canción en YouTube, revisa cuáles suenan aquí
 * y ofrece «Usar esta» (conserva desde/hasta). Necesita la llave YOUTUBE_API_KEY en Vercel.
 */
const Alternatives: React.FC<{ video: string; onUse: (url: string) => void }> = ({ video, onUse }) => {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'nokey' | 'error'>('idle');
  const [items, setItems] = useState<{ id: string; title: string; channel: string; ok?: boolean }[]>([]);
  const search = async () => {
    setState('busy');
    try {
      const r = await authFetch(`/api/youtube/alternativas?video=${encodeURIComponent(video)}`);
      const j = (await r.json()) as { missingKey?: boolean; items?: { id: string; title: string; channel: string }[] };
      if (j.missingKey) return setState('nokey');
      const list = j.items ?? [];
      setItems(list);
      setState('done');
      // Cada una se prueba de verdad (el sello puede bloquearla aunque YouTube diga que se puede).
      list.forEach((x) => canEmbed(x.id).then((ok) => setItems((l) => l.map((y) => (y.id === x.id ? { ...y, ok } : y)))));
    } catch {
      setState('error');
    }
  };
  if (state === 'idle') return <button type="button" onClick={search} className="mt-1.5 ml-1.5 inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-bold text-rose-50 ring-1 ring-white/15 hover:bg-white/[0.14]">🔎 Buscar otra subida que suene</button>;
  if (state === 'busy') return <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando la misma canción…</p>;
  if (state === 'nokey') return <p className="mt-1.5 text-[11px] text-amber-200">🔑 La búsqueda todavía no está activada (falta la llave gratis de YouTube en Vercel). Mientras, usa tu audio.</p>;
  if (state === 'error') return <p className="mt-1.5 text-[11px] text-amber-200">No pude buscar ahora. Prueba de nuevo en un rato.</p>;
  const good = items.filter((x) => x.ok !== false);
  return (
    <div className="mt-2 space-y-1">
      {!good.length && <p className="text-[11px] text-zinc-300">No encontré otra subida que suene aquí. Usa tu audio.</p>}
      {good.map((x) => (
        <div key={x.id} className="flex items-center gap-2 rounded-lg bg-black/25 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${x.id}/default.jpg`} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-zinc-100">{x.title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')}</span><span className="block truncate text-[10px] text-zinc-400">{x.channel}{x.ok === undefined ? ' · revisando…' : ' · ✓ suena aquí'}</span></span>
          <button type="button" disabled={x.ok !== true} onClick={() => onUse(`https://www.youtube.com/watch?v=${x.id}`)} className="shrink-0 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-bold text-[#fff] hover:bg-sky-500 disabled:opacity-40">Usar esta</button>
        </div>
      ))}
    </div>
  );
};

/**
 * 🎵 Usar mi audio (2026-11-17): pegar un link de Drive / Dropbox / MP3 (desde el 18 nov no se suben archivos:
 * no se guarda nada en la nube de Master Planner, suena desde tu Drive).
 * Queda en la canción; suena ese en vez de YouTube, con el mismo desde/hasta, crossfade y volumen.
 */
const AudioPicker: React.FC<{ onPick: (audio: string, name: string) => void; strong?: boolean }> = ({ onPick, strong }) => {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} data-help="Que suene tu propio archivo en vez de YouTube" className={strong ? 'mt-1.5 inline-flex items-center gap-1 rounded-lg bg-rose-500/25 px-2.5 py-1.5 text-xs font-bold text-rose-50 ring-1 ring-rose-300/40 hover:bg-rose-500/35' : 'inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-zinc-400 ring-1 ring-white/15 hover:text-zinc-100'}>
        🎵 Usar mi audio
      </button>
    );
  return (
    <div className="mt-2 w-full rounded-lg bg-black/25 p-2 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-1.5">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        <form className="flex min-w-0 flex-1 gap-1.5" onSubmit={async (e) => { e.preventDefault(); setErr(''); setBusy(true); const r = await audioFromLink(link); setBusy(false); if ('error' in r) return setErr(r.error); onPick(r.audio, r.name); setOpen(false); }}>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link de Drive, Dropbox o MP3" aria-label="Link del audio" className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" />
          <button type="submit" className="rounded-lg bg-white/[0.08] px-2 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">Usar</button>
        </form>
        <button type="button" aria-label="Cancelar" onClick={() => setOpen(false)} className="rounded-lg px-1.5 text-xs text-zinc-400 hover:text-white">✕</button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Pega el link de tu canción en Google Drive o Dropbox (compartido «Cualquier persona con el enlace»). No se copia: suena desde tu Drive.</p>
      {err && <p className="mt-1 text-[11px] text-rose-300">{err}</p>}
    </div>
  );
};

/**
 * ⚙️ Configurar el modo focus de una acción (Emanuel, 2026-11-03): la música que suena — cada canción
 * con su link, desde, hasta (o hasta el final) y bucle — más el crossfade entre canciones y «repetir
 * toda la lista». Se guarda en el módulo «Lista de YouTube» de la acción.
 */
export const FocusSetup: React.FC<{ item: Item; onSave: (modules: Module[]) => void; onStart: () => void; onClose: () => void }> = ({ item, onSave, onStart, onClose }) => {
  const current = item.modules.find((m) => m.type === 'youtube');
  const [videos, setVideos] = useState<Video[]>(current?.videos ?? []);
  const [crossfade, setCrossfade] = useState(current?.crossfade ?? 3);
  const [loopAll, setLoopAll] = useState(current?.loopAll ?? false);
  const [volume, setVolume] = useState(current?.volume ?? 100);
  // ▶ Probar el volumen: la primera canción suena unos segundos a ese volumen.
  const stopTest = React.useRef<(() => void) | null>(null);
  const [testing, setTesting] = useState(false);
  const testVolume = () => {
    stopTest.current?.();
    if (testing) return setTesting(false);
    const first = videos[0] ?? pending[0];
    if (!first) return;
    setTesting(true);
    const stop = previewVolume(first, volume);
    const t = setTimeout(() => setTesting(false), 6000);
    stopTest.current = () => {
      clearTimeout(t);
      stop();
      stopTest.current = null;
    };
  };
  React.useEffect(() => () => stopTest.current?.(), []);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  // Cambiar el link de una canción: conserva desde/hasta y bucle.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  // Un link pegado sin tocar «Agregar» también se guarda.
  const pending: Video[] = parseSpotify(url) ? [{ url: spotifyUrl(parseSpotify(url)!) }] : parseYouTube(url) ? (!parseYouTube(url)?.list ? [{ url: url.trim() }] : []) : url.trim() && isAudioLink(url) && !isCloudLink(url) ? [{ url: '', audio: url.trim(), audioName: linkName(url) }] : [];
  const dirty = pending.length > 0 || JSON.stringify({ videos, crossfade, loopAll, volume }) !== JSON.stringify({ videos: current?.videos ?? [], crossfade: current?.crossfade ?? 3, loopAll: current?.loopAll ?? false, volume: current?.volume ?? 100 });
  const save = () => {
    const music: Module = { ...(current ?? { id: mid(), type: 'youtube', title: 'Música del focus' }), videos: [...videos, ...pending], crossfade, loopAll, volume };
    onSave(current ? item.modules.map((m) => (m.id === current.id ? music : m)) : [...item.modules, music]);
  };
  const set = (i: number, p: Partial<Video>) => setVideos((l) => l.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const move = (i: number, d: number) => setVideos((l) => {
    const n = [...l];
    const [v] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, v);
    return n;
  });
  // Link de una playlist: se pregunta si van sus canciones por separado, la playlist entera o solo esa canción.
  const [askList, setAskList] = useState<{ list: string; video?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const add = async () => {
    // 🎧 Canción de Spotify: entra como una más (antes que «audio», porque también es un link http).
    const sp = parseSpotify(url);
    if (sp) {
      setError('');
      setVideos((l) => [...l, { url: spotifyUrl(sp) }]);
      return setUrl('');
    }
    if (isSpotifyLink(url)) return setError('Ese link de Spotify no es de una canción, episodio, podcast, álbum ni playlist.');
    const p = parseYouTube(url);
    // 🎵 Link de Google Drive, Dropbox o un MP3: entra igual que una de YouTube. Drive y Dropbox se traen a
    // tu cuenta una vez (así suenan en cualquier navegador y en la app de Mac).
    if (!p && isAudioLink(url)) {
      setError('');
      setImporting(true);
      const r = await audioFromLink(url);
      setImporting(false);
      if ('error' in r) return setError(r.error);
      setVideos((l) => [...l, { url: '', audio: r.audio, audioName: r.name }]);
      return setUrl('');
    }
    if (!p) return setError('Ese link no es de YouTube, Spotify, Google Drive, Dropbox ni de un MP3.');
    setError('');
    if (p.list) return setAskList({ list: p.list, video: p.video });
    setVideos((l) => [...l, { url: url.trim() }]);
    setUrl('');
  };
  const addList = async (how: 'separadas' | 'entera' | 'una') => {
    if (!askList) return;
    if (how === 'una' && askList.video) setVideos((l) => [...l, { url: `https://www.youtube.com/watch?v=${askList.video}` }]);
    if (how === 'entera') setVideos((l) => [...l, { url: `https://www.youtube.com/playlist?list=${askList.list}` }]);
    if (how === 'separadas') {
      setBusy(true);
      const ids = await playlistIds(askList.list);
      setBusy(false);
      if (!ids.length) return setError('No pude leer esa playlist (¿es privada?). Agrégala entera o canción por canción.');
      setVideos((l) => [...l, ...ids.map((id) => ({ url: `https://www.youtube.com/watch?v=${id}` }))]);
    }
    setAskList(null);
    setUrl('');
  };
  const guard = useGuardedClose(onClose);
  // Avisa al cerrar (✕, afuera o Esc) si quedó algo sin guardar.
  useEffect(() => guard.register(dirty ? save : null));
  const close = guard.close;
  const total = videos.reduce((s, v) => s + (v.to !== undefined ? v.to - (v.from ?? 0) : 0), 0);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={close}>
        <div role="dialog" aria-label="Configurar modo focus" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-white"><Music className="h-4 w-4 text-sky-300" /> Música del focus · <ItemIcon value={item.icon} /> {item.title}</h2>
            <button type="button" aria-label="Cerrar" onClick={close} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Pega tus canciones en orden (YouTube, Spotify, Google Drive, Dropbox o MP3). Cada una suena desde y hasta donde digas, y se funden una con otra.</p>

          <ol className="mt-4 space-y-2">
            {videos.map((v, i) => {
              const p = parseYouTube(v.url);
              const sp = parseSpotify(v.url);
              const toEnd = v.to === undefined;
              return (
                <li key={`${i}-${v.url}`} className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
                  <div className="flex items-center gap-2.5">
                    {sp ? (
                      <SpotifyCover id={sp} />
                    ) : p?.video ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://i.ytimg.com/vi/${p.video}/mqdefault.jpg`} alt="" className="h-11 w-20 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs text-zinc-400">{v.audio ? '🎵' : 'Playlist'}</span>
                    )}
                    {editing === i ? (
                      <form className="flex min-w-0 flex-1 gap-1.5" onSubmit={async (e) => { e.preventDefault(); const sp2 = parseSpotify(draft); if (sp2) { setError(''); set(i, { url: spotifyUrl(sp2), audio: undefined, audioName: undefined }); return setEditing(null); } const p2 = parseYouTube(draft); if (!p2 && isAudioLink(draft)) { setError(''); setImporting(true); const r = await audioFromLink(draft); setImporting(false); if ('error' in r) return setError(r.error); set(i, { audio: r.audio, audioName: r.name }); return setEditing(null); } if (!p2 || p2.list && !p2.video) return setError('Pega el link de una canción de YouTube, Google Drive, Dropbox o un MP3.'); setError(''); set(i, { url: draft.trim(), audio: undefined, audioName: undefined }); setEditing(null); }}>
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pega el link nuevo" aria-label="Link nuevo" className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-white outline-none ring-1 ring-sky-400/50" />
                        <button type="submit" className="rounded-lg bg-sky-600 px-2 text-xs font-semibold text-[#fff]">Listo</button>
                        <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-1.5 text-xs text-zinc-400 hover:text-white">✕</button>
                      </form>
                    ) : (
                      <>
                        {sp ? <SpotifyTitle id={sp} /> : <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-zinc-300">{p ? v.url.replace(/^https?:\/\/(www\.)?/, '') : v.audioName || 'Mi audio'}</span>}
                        <button type="button" onClick={() => { setEditing(i); setDraft(''); }} className="shrink-0 rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]">🔄 Cambiar</button>
                      </>
                    )}
                    <div className="flex shrink-0 flex-col">
                      <button type="button" aria-label="Subir" disabled={!i} onClick={() => move(i, -1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Bajar" disabled={i === videos.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <button type="button" aria-label="Quitar" onClick={() => setVideos((l) => l.filter((_, j) => j !== i))} className="p-1 text-zinc-600 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {sp ? (
                    <>
                      {/* 🖥️ Dónde suena: tu app de Spotify (su crossfade/Automix) o dentro de Master Planner. */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {([[true, '🖥️ En la app de Spotify (Automix)', 'Suena en tu app de Spotify con su crossfade/Automix; si está cerrada, se abre'], [false, '🔊 En Master Planner', 'Suena dentro de Master Planner (se funde con YouTube y Drive)']] as const).map(([app, label, help]) => (
                          <button key={label} type="button" data-help={help} onClick={() => set(i, { spotifyApp: app })} className={`rounded-full px-2 py-1 font-semibold ring-1 ${spotifyInApp(sp, v.spotifyApp) === app ? 'bg-[#1ed760]/20 text-[#1ed760] ring-[#1ed760]/50' : 'text-zinc-400 ring-white/15'}`}>{label}</button>
                        ))}
                      </div>
                      {/* 💬 Cómo suena (Emanuel, 2026-11-18): entre dos de Spotify no hay crossfade; la playlist manda con su Automix. */}
                      {i > 0 && parseSpotify(videos[i - 1].url) && (
                        <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-100 ring-1 ring-amber-400/20">🔀 Entre esta y la anterior (las dos de Spotify) no habrá crossfade: pasan con un corte. Si quieres que se fundan, arma una <b>playlist en Spotify</b> con ellas, activa su <b>Automix</b> y pega aquí la playlist.</p>
                      )}
                      {(spotifyKind(sp) === 'playlist' || spotifyKind(sp) === 'album' || spotifyKind(sp) === 'show') && (
                        <p className="mt-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/10">📃 Es {spotifyKind(sp) === 'show' ? 'un podcast' : spotifyKind(sp) === 'album' ? 'un álbum' : 'una playlist'}: suena entero en orden{spotifyInApp(sp, v.spotifyApp) ? ' con el crossfade/Automix de tu Spotify' : ''}. Master Planner no lo maneja canción por canción: lo corta cuando se cumple tu «hasta»{toEnd ? ' (ponle un «hasta», si no sigue hasta que termine el focus)' : ''}.</p>
                      )}
                      <SpotifyStatus />
                    </>
                  ) : v.audio ? (
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-200 ring-1 ring-emerald-400/20">
                      <span className="min-w-0 flex-1 truncate">🎵 Suena tu audio: <b className="font-semibold">{v.audioName || 'Mi audio'}</b></span>
                      {p?.video && <button type="button" onClick={() => set(i, { audio: undefined, audioName: undefined })} data-help="Quitar tu audio: vuelve a sonar YouTube" className="shrink-0 font-semibold text-emerald-100 underline">Quitar (vuelve a YouTube)</button>}
                    </p>
                  ) : (
                    p?.video && <EmbedCheck video={p.video}><AudioPicker strong onPick={(audio, audioName) => set(i, { audio, audioName })} /><Alternatives video={p.video} onUse={(u) => set(i, { url: u })} /></EmbedCheck>
                  )}
                  {(p?.video || v.audio || sp) && v.resume && (
                    <p className="mt-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                      ⏭️ Cada día suenan {Math.round(((v.to ?? (v.from ?? 0) + 600) - (v.from ?? 0)) / 60)} min, desde donde quedaste la última vez (la primera vez, desde {fmtSeconds(v.from) || '0:00'}). Al terminarse el video, vuelve a empezar.
                    </p>
                  )}
                  {(p?.video || v.audio || sp) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <label className="flex items-center gap-1">Desde <input defaultValue={fmtSeconds(v.from) || '0:00'} onBlur={(e) => set(i, { from: toSeconds(e.target.value) || undefined })} className="w-14 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /></label>
                      <label className="flex items-center gap-1">Hasta <input disabled={toEnd} key={toEnd ? 'fin' : 'corte'} defaultValue={toEnd ? '' : fmtSeconds(v.to)} placeholder="fin" onBlur={(e) => set(i, { to: toSeconds(e.target.value) })} className="w-14 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10 disabled:opacity-40" /></label>
                      <button type="button" onClick={() => set(i, { to: toEnd ? (v.from ?? 0) + 300 : undefined })} className={`rounded-full px-2 py-1 font-semibold ring-1 ${toEnd ? 'bg-sky-600/30 text-sky-100 ring-sky-400/50' : 'text-zinc-400 ring-white/15'}`}>Hasta el final</button>
                      <button type="button" onClick={() => set(i, v.resume ? { resume: false } : { resume: true, loop: false, ...(toEnd ? { to: (v.from ?? 0) + 600 } : {}) })} data-help="Mentoría o audiolibro por partes: cada día suena lo que dura su desde–hasta, pero desde donde quedaste la última vez" className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ${v.resume ? 'bg-emerald-600/30 text-emerald-100 ring-emerald-400/50' : 'text-zinc-400 ring-white/15'}`}>⏭️ Seguir donde quedé</button>
                      <button type="button" onClick={() => set(i, { loop: !v.loop, ...(v.loop ? {} : { resume: false }) })} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ${v.loop ? 'bg-violet-600/30 text-violet-100 ring-violet-400/50' : 'text-zinc-400 ring-white/15'}`}><Repeat className="h-3 w-3" /> En bucle</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link de YouTube, Spotify, Google Drive, Dropbox o MP3" className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" />
            <button type="submit" disabled={importing} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white/[0.08] px-3 text-sm font-semibold text-white hover:bg-white/[0.14] disabled:opacity-60">{importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Plus className="h-4 w-4" /> Agregar</>}</button>
          </form>
          {askList && (
            <div className="mt-2 rounded-xl bg-sky-500/10 p-3 ring-1 ring-sky-400/30">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-100"><ListMusic className="h-4 w-4" /> Ese link es de una playlist. ¿Qué agrego?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" disabled={busy} onClick={() => addList('separadas')} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-60">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sus canciones por separado</button>
                <button type="button" onClick={() => addList('entera')} className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">La playlist entera</button>
                {askList.video && <button type="button" onClick={() => addList('una')} className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">Solo esta canción</button>}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">Por separado puedes poner desde/hasta a cada una.</p>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}

          <div className="mt-5 space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <label className="block text-sm text-zinc-200">
              <span className="flex justify-between"><b className="font-semibold">Crossfade</b><span className="tabular-nums text-zinc-400">{crossfade ? `${crossfade} s` : 'Corte seco'}</span></span>
              <input type="range" min={0} max={12} value={crossfade} onChange={(e) => setCrossfade(Number(e.target.value))} className="mt-1 w-full accent-sky-500" />
              <span className="text-xs text-zinc-500">Cuánto se funde el final de una canción con el inicio de la siguiente.</span>
            </label>
            <div className="block text-sm text-zinc-200">
              <span className="flex items-center justify-between"><b className="font-semibold">Volumen de este focus</b>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-zinc-400">🔊 {volume}%</span>
                  <button type="button" disabled={!videos.length && !pending.length} onClick={testVolume} data-help="Probar: suena unos segundos a este volumen" aria-label="Probar volumen" className={`rounded-lg p-1 hover:bg-white/10 disabled:opacity-30 ${testing ? 'text-sky-300' : 'text-zinc-200'}`}>{testing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                </span>
              </span>
              <input type="range" min={0} max={100} step={5} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volumen de este focus" className="mt-1 w-full accent-sky-500" />
              <span className="text-xs text-zinc-500">Aparte de los parlantes: ej. Dormir bajito (25%) y Levantarse a todo (100%).</span>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-200">
              <span><b className="block font-semibold">Repetir toda la lista</b><span className="text-xs text-zinc-500">Al terminar la última, vuelve a la primera.</span></span>
              <input type="checkbox" checked={loopAll} onChange={(e) => setLoopAll(e.target.checked)} className="h-4 w-4 accent-sky-500" />
            </label>
          </div>
          {total > 0 && <p className="mt-2 text-xs text-zinc-500">Con cortes: {fmtSeconds(total)} de música (tu acción dura {item.minutes} min).</p>}

          {guard.bar}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => { save(); onClose(); }} className="flex-1 rounded-xl bg-white/[0.08] py-2.5 text-sm font-semibold text-white hover:bg-white/[0.14]">Guardar</button>
            <button type="button" onClick={() => { save(); onStart(); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-[#fff] hover:bg-sky-500"><Play className="h-4 w-4" /> Guardar y empezar</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
