'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ListMusic, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { Video } from '@/components/organiza/model';

/**
 * Música del modo focus (Emanuel, 2026-11-03): la lista de YouTube de una acción suena sola, cada
 * canción desde/hasta el segundo elegido (o hasta el final), con bucle por canción, «repetir toda la
 * lista» y crossfade: dos reproductores se turnan y uno baja mientras el otro sube. Usa el
 * reproductor oficial de YouTube (IFrame API): no hace falta cuenta ni llaves.
 */

/** «https://youtu.be/ID», «watch?v=ID», «shorts/ID» o una playlist («list=ID»). */
export function parseYouTube(url: string): { video?: string; list?: string } | null {
  try {
    const u = new URL(url.trim());
    if (!/youtu\.?be/.test(u.hostname)) return null;
    const list = u.searchParams.get('list') ?? undefined;
    let video: string | undefined;
    if (u.hostname.includes('youtu.be')) video = u.pathname.slice(1).split('/')[0];
    else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) video = u.pathname.split('/')[2];
    else video = u.searchParams.get('v') ?? undefined;
    if (!video && !list) return null;
    return { video: video || undefined, list };
  } catch {
    return null;
  }
}

/** «3:20» o «200» → segundos. */
export const toSeconds = (t: string) => {
  const parts = t.trim().split(':').map(Number);
  if (!t.trim() || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((s, n) => s * 60 + n, 0);
};
export const fmtSeconds = (s?: number) => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

type YTPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  setVolume: (v: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData?: () => { title?: string };
  getPlaylist?: () => string[] | null;
  mute?: () => void;
  unMute?: () => void;
  getPlaylistIndex?: () => number;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number } };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;
function loadYT(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return loading;
}

/** ¿Este video se puede reproducir fuera de YouTube? (quien lo sube puede bloquearlo). Reproductor oculto, en silencio. */
const embedCache = new Map<string, Promise<boolean>>();
export function canEmbed(video: string): Promise<boolean> {
  if (!embedCache.has(video)) {
    embedCache.set(video, loadYT().then((YT) => new Promise<boolean>((resolve) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0';
      document.body.appendChild(host);
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        try {
          p.destroy();
        } catch {
          /* ya no está */
        }
        host.remove();
        resolve(ok);
      };
      const p = new YT.Player(host, {
        width: 1,
        height: 1,
        videoId: video,
        playerVars: { autoplay: 1, mute: 1 },
        events: {
          onError: () => finish(false),
          onStateChange: (e: { data: number }) => e.data === YT.PlayerState.PLAYING && finish(true),
        },
      });
      setTimeout(() => finish(true), 8000);
    })));
  }
  return embedCache.get(video)!;
}

/** Los videos de una playlist (para agregarlos por separado). Usa un reproductor oculto; sin llaves. */
export async function playlistIds(list: string): Promise<string[]> {
  const YT = await loadYT();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0';
  document.body.appendChild(host);
  return new Promise((resolve) => {
    let tries = 0;
    let done = false;
    const finish = (ids: string[]) => {
      if (done) return;
      done = true;
      try {
        p.destroy();
      } catch {
        /* ya no está */
      }
      host.remove();
      resolve(ids);
    };
    const p = new YT.Player(host, {
      width: 1,
      height: 1,
      playerVars: { listType: 'playlist', list, autoplay: 0 },
      events: {
        onReady: () => {
          const poll = () => {
            const ids = p.getPlaylist?.() ?? [];
            if (ids.length || ++tries > 30) finish(ids);
            else setTimeout(poll, 200);
          };
          poll();
        },
        onError: () => finish([]),
      },
    });
    setTimeout(() => finish([]), 10000);
  });
}

type Slot = { player: YTPlayer | null; index: number; ready: boolean; state?: number; loadedAt?: number; readyAt?: number; preload?: boolean; failed?: boolean };

/** Reproductor chico que avanza solo por la lista, con crossfade entre canciones. */
export const YouTubeList: React.FC<{ videos: Video[]; crossfade?: number; loopAll?: boolean; paused?: boolean; seek?: { t: number; n: number } }> = ({ videos, crossfade = 0, loopAll = false, paused = false, seek }) => {
  const boxes = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const slots = useRef<Slot[]>([{ player: null, index: -1, ready: false }, { player: null, index: -1, ready: false }]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const fading = useRef(false);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const [title, setTitle] = useState('');
  const [finished, setFinished] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [skipped, setSkipped] = useState(0);
  // La última que YouTube no dejó tocar aquí (error 150: el dueño o el sello lo bloquean fuera de YouTube).
  const [blockedSong, setBlockedSong] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);
  // Silencio aparte de la pausa: la música sigue avanzando, sin sonido.
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const list = useRef(videos);
  list.current = videos;
  // Largo real de cada video (se conoce al cargarlo); sirve para ubicar la música en el tiempo del focus.
  const lengths = useRef<Record<number, number>>({});

  const nextIndex = (i: number) => (i + 1 < list.current.length ? i + 1 : loopAll ? 0 : -1);

  /** Carga la canción `index` en el canal `slot`, al volumen dado. */
  const load = async (slot: number, index: number, volume: number, startAt?: number, preload = false) => {
    const v = list.current[index];
    const parsed = v && parseYouTube(v.url);
    const box = boxes[slot].current;
    if (!v || !parsed || !box) return false;
    slots.current[slot].player?.destroy();
    slots.current[slot] = { player: null, index, ready: false, loadedAt: Date.now(), preload };
    const host = document.createElement('div');
    box.innerHTML = '';
    box.appendChild(host);
    const YT = await loadYT();
    const vars: Record<string, unknown> = { autoplay: 1, playsinline: 1, rel: 0 };
    const begin = startAt ?? v.from ?? 0;
    if (parsed.video && begin) vars.start = Math.floor(begin);
    if (!parsed.video) {
      vars.listType = 'playlist';
      vars.list = parsed.list;
    }
    // Reproductor chico y oculto: solo se escucha, y YouTube baja la calidad del video sola.
    slots.current[slot].player = new YT.Player(host, {
      width: 200,
      height: 112,
      videoId: parsed.video,
      playerVars: vars,
      events: {
        onReady: (e: { target: YTPlayer }) => {
          lengths.current[index] = e.target.getDuration?.() || lengths.current[index];
          if (startAt !== undefined && parsed.video) e.target.seekTo(startAt, true);
          e.target.setVolume(volume);
          if (mutedRef.current) e.target.mute?.();
          if (preload) {
            // Precarga: suena en silencio un momento para llenar el búfer y queda lista en su inicio.
            e.target.setVolume(0);
            e.target.playVideo();
            setTimeout(() => {
              if (!slots.current[slot].preload) return;
              e.target.pauseVideo();
              e.target.seekTo(begin, true);
            }, 2500);
          } else if (playingRef.current) e.target.playVideo();
          slots.current[slot].ready = true;
          slots.current[slot].readyAt = Date.now();
          if (slot === activeRef.current) setTitle(e.target.getVideoData?.().title ?? '');
        },
        onStateChange: (e: { data: number; target: YTPlayer }) => {
          slots.current[slot].state = e.data;
          if (slot !== activeRef.current) return;
          if (e.data === YT.PlayerState.PLAYING) {
            setTitle(e.target.getVideoData?.().title ?? '');
            setBlocked(false);
          }
          if (e.data === YT.PlayerState.ENDED) {
            // Playlist entera: sigue sola por dentro; se pasa a la siguiente recién al terminar su último video.
            if (!parsed.video) {
              const all = e.target.getPlaylist?.() ?? [];
              if ((e.target.getPlaylistIndex?.() ?? 0) < all.length - 1) return;
            }
            advance();
          }
        },
        // Video que no se puede reproducir fuera de YouTube: se salta, aunque pase en pleno crossfade.
        onError: () => {
          slots.current[slot].failed = true;
          if (slot !== activeRef.current) return;
          setSkipped((n) => n + 1);
          setBlockedSong(index);
          fading.current = false;
          setTimeout(() => advance(true), 0);
        },
      },
    });
    return true;
  };

  /** Pasa a la siguiente canción: con crossfade si hay, o corte seco. */
  const advance = (hard = false) => {
    if (fading.current) return;
    const cur = slots.current[activeRef.current];
    const v = list.current[cur.index];
    if (v?.loop && !hard) {
      cur.player?.seekTo(v.from ?? 0, true);
      return;
    }
    const n = nextIndex(cur.index);
    if (n < 0) {
      cur.player?.pauseVideo();
      setFinished(true);
      return;
    }
    const other = 1 - activeRef.current;
    const fade = hard ? 0 : crossfade;
    fading.current = true;
    // Si ya estaba precargada, entra al tiro (sin cortes); si no, se carga ahora.
    const ready = slots.current[other];
    const reuse = ready.index === n && ready.preload && ready.ready && !ready.failed && ready.player;
    const start: Promise<boolean> = reuse
      ? Promise.resolve().then(() => {
          ready.preload = false;
          ready.player!.setVolume(fade ? 0 : 100);
          if (playingRef.current) ready.player!.playVideo();
          return true;
        })
      : load(other, n, fade ? 0 : 100);
    start.then((ok) => {
      if (!ok) {
        fading.current = false;
        slots.current[activeRef.current].index = n;
        advance(true);
        return;
      }
      const started = Date.now();
      const old = activeRef.current;
      activeRef.current = other;
      setActive(other);
      setAt(n);
      const step = () => {
        const p = fade ? Math.min(1, (Date.now() - started) / (fade * 1000)) : 1;
        slots.current[old].player?.setVolume(Math.round(100 * (1 - p)));
        if (slots.current[other].ready) slots.current[other].player?.setVolume(Math.round(100 * p));
        if (p < 1) setTimeout(step, 100);
        else {
          slots.current[old].player?.destroy();
          slots.current[old] = { player: null, index: -1, ready: false };
          if (boxes[old].current) boxes[old].current.innerHTML = '';
          fading.current = false;
        }
      };
      step();
    });
  };

  /** Cuánto suena la canción `i` en el focus (sin contar el crossfade con la siguiente). */
  const lengthOf = (i: number) => {
    const v = list.current[i];
    const end = v.to ?? lengths.current[i] ?? 180;
    return Math.max(1, end - (v.from ?? 0));
  };

  /** Ubica la música en el segundo `t` del focus: qué canción y en qué parte. */
  const seekGlobal = (t: number) => {
    const n = list.current.length;
    if (!n) return;
    let start = 0;
    let i = 0;
    for (let guard = 0; guard < 2000; guard++) {
      const v = list.current[i];
      const len = lengthOf(i);
      const last = i === n - 1 && !loopAll;
      if (v.loop) return jump(i, (v.from ?? 0) + ((t - start) % len));
      const span = last ? len : Math.max(1, len - crossfade);
      if (t < start + span) return jump(i, (v.from ?? 0) + (t - start));
      start += span;
      i = i + 1 < n ? i + 1 : loopAll ? 0 : -1;
      if (i < 0) break;
    }
    slots.current.forEach((x) => x.player?.pauseVideo());
    setFinished(true);
  };
  const jump = (index: number, at: number) => {
    fading.current = false;
    setFinished(false);
    const other = 1 - activeRef.current;
    slots.current[other].player?.destroy();
    slots.current[other] = { player: null, index: -1, ready: false };
    if (boxes[other].current) boxes[other].current.innerHTML = '';
    const cur = slots.current[activeRef.current];
    setAt(index);
    if (cur.index === index && cur.player && cur.ready) {
      cur.player.seekTo(at, true);
      cur.player.setVolume(100);
    } else load(activeRef.current, index, 100, at);
  };

  // Adelantar o retroceder el focus mueve la música al mismo momento.
  useEffect(() => {
    if (seek) seekGlobal(seek.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.n]);

  // Pausar el focus pausa la música.
  useEffect(() => {
    playingRef.current = !paused;
    setPlaying(!paused);
    slots.current.forEach((x) => !x.preload && (paused ? x.player?.pauseVideo() : x.player?.playVideo()));
  }, [paused]);

  // Arranca con la primera canción.
  useEffect(() => {
    load(0, 0, 100);
    const all = slots.current;
    return () => all.forEach((s) => s.player?.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reloj: corta en «hasta», hace bucle y empieza el crossfade a tiempo.
  useEffect(() => {
    const t = setInterval(() => {
      const cur = slots.current[activeRef.current];
      const v = list.current[cur.index];
      if (!v || !cur.player || !playingRef.current) return;
      // No cargó en 12 s: se salta.
      if (!cur.ready) {
        if (Date.now() - (cur.loadedAt ?? Date.now()) > 12000) {
          setSkipped((n) => n + 1);
          fading.current = false;
          advance(true);
        }
        return;
      }
      // El navegador no la dejó sonar sola: se pide un toque.
      if (cur.state !== 1 && cur.state !== 3 && Date.now() - (cur.readyAt ?? Date.now()) > 3500) setBlocked(true);
      if (fading.current || !parseYouTube(v.url)?.video) return;
      const now = cur.player.getCurrentTime?.() ?? 0;
      const end = v.to ?? cur.player.getDuration?.() ?? 0;
      if (!end) return;
      const lead = v.loop ? 0.3 : Math.max(0.3, crossfade);
      if (now >= end - lead) return advance();
      // 20 s antes del cambio se precarga la siguiente en el otro canal.
      const n = nextIndex(cur.index);
      const other = slots.current[1 - activeRef.current];
      if (!v.loop && n >= 0 && now >= end - lead - 20 && other.index !== n) load(1 - activeRef.current, n, 0, undefined, true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfade, loopAll]);

  const toggle = () => {
    const p = !playing;
    playingRef.current = p;
    setPlaying(p);
    slots.current.forEach((s) => !s.preload && (p ? s.player?.playVideo() : s.player?.pauseVideo()));
  };

  if (!videos.length) return null;
  const v = videos[at];
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-black/40 text-left ring-1 ring-white/15 backdrop-blur-xl">
      {/* Los dos reproductores quedan ocultos: solo se escucha. */}
      <div aria-hidden className="pointer-events-none absolute h-[112px] w-[200px] overflow-hidden opacity-0">
        {[0, 1].map((i) => <div key={i} ref={boxes[i]} className="absolute inset-0" />)}
      </div>
      <div className="flex items-center gap-3 p-3">
        {parseYouTube(v?.url ?? '')?.video ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://i.ytimg.com/vi/${parseYouTube(v?.url ?? '')?.video}/mqdefault.jpg`} alt="" className={`h-12 w-12 shrink-0 rounded-lg object-cover ${playing && !finished ? '' : 'opacity-50'}`} />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg">🎵</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#fff]">{finished ? 'Terminó tu lista' : title || 'Cargando…'}</span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-400">
            {!finished && `${at + 1} de ${videos.length}`}
            {!finished && v?.to !== undefined && ` · hasta ${fmtSeconds(v.to)}`}
            {!finished && v?.loop && <Repeat className="h-3 w-3" />}
            {skipped > 0 && <span className="text-amber-300">· {skipped} saltada{skipped > 1 ? 's' : ''}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" aria-label="Canción anterior" data-help="Canción anterior" disabled={at === 0 && !loopAll} onClick={() => { const p = at > 0 ? at - 1 : videos.length - 1; jump(p, videos[p].from ?? 0); }} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10 disabled:opacity-30"><SkipBack className="h-4 w-4" /></button>
          <button type="button" aria-label={playing ? 'Pausar música' : 'Seguir música'} data-help={playing ? 'Pausar música (el reloj sigue)' : 'Seguir música'} onClick={toggle} className="rounded-full bg-white/[0.14] p-2 text-[#fff] hover:bg-white/25">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
          <button type="button" aria-label="Canción siguiente" data-help="Canción siguiente" onClick={() => advance(true)} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>
          <button type="button" aria-label={muted ? 'Activar sonido' : 'Silenciar'} data-help={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => { const m = !muted; mutedRef.current = m; setMuted(m); slots.current.forEach((x) => (m ? x.player?.mute?.() : x.player?.unMute?.())); }} className={`rounded-lg p-1.5 hover:bg-white/10 ${muted ? 'text-rose-300' : 'text-zinc-200'}`}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
          <button type="button" aria-label="Elegir canción" data-help="Elegir canción" onClick={() => setShowList((x) => !x)} className={`rounded-lg p-1.5 hover:bg-white/10 ${showList ? 'text-sky-300' : 'text-zinc-200'}`}><ListMusic className="h-4 w-4" /></button>
        </span>
      </div>
      {blocked && !finished && (
        <button type="button" onClick={() => { slots.current[activeRef.current].player?.playVideo(); setBlocked(false); }} className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs font-semibold text-amber-200 hover:bg-white/5">
          <Play className="h-3.5 w-3.5" /> Tu navegador pausó la música · toca para seguir
        </button>
      )}
      {blockedSong !== null && videos[blockedSong] && (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          ⚠️ La canción {blockedSong + 1} no se puede tocar aquí: su dueño solo deja escucharla en YouTube.{' '}
          <a href={`https://www.youtube.com/watch?v=${parseYouTube(videos[blockedSong].url)?.video ?? ''}&t=${Math.floor(videos[blockedSong].from ?? 0)}s`} target="_blank" rel="noreferrer" className="font-semibold underline">Abrir en YouTube ↗</a>
        </p>
      )}
      {showList && (
        <ul className="max-h-48 overflow-y-auto border-t border-white/10 py-1">
          {videos.map((x, i) => {
            const id = parseYouTube(x.url)?.video;
            return (
              <li key={i}>
                <button type="button" onClick={() => { jump(i, x.from ?? 0); setShowList(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/10 ${i === at ? 'text-sky-200' : 'text-zinc-200'}`}>
                  {id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://i.ytimg.com/vi/${id}/default.jpg`} alt="" className="h-7 w-10 rounded object-cover" />
                  ) : (
                    <span className="flex h-7 w-10 items-center justify-center rounded bg-white/10 text-[9px]">Lista</span>
                  )}
                  <span className="flex-1">Canción {i + 1}{x.to !== undefined ? ` · hasta ${fmtSeconds(x.to)}` : ''}</span>
                  {i === at && <span>▶</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
