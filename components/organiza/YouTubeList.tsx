'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import type { Video } from '@/components/organiza/model';

/**
 * Lista de YouTube de una acción (Emanuel, 2026-11-03): suena sola en el modo focus, un video tras
 * otro, cada uno desde/hasta el segundo elegido; o una playlist entera. Usa el reproductor oficial
 * de YouTube (IFrame API): no hace falta cuenta ni llaves.
 */

/** «https://youtu.be/ID», «watch?v=ID», «shorts/ID» o una playlist («list=ID»). */
export function parseYouTube(url: string): { video?: string; list?: string } | null {
  try {
    const u = new URL(url.trim());
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
export const fmtSeconds = (s?: number) => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

type YTPlayer = { destroy: () => void; playVideo: () => void; pauseVideo: () => void; getVideoData?: () => { title?: string } };
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

/** Reproductor chico que avanza solo por la lista. */
export const YouTubeList: React.FC<{ videos: Video[] }> = ({ videos }) => {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [title, setTitle] = useState('');
  const v = videos[at];

  useEffect(() => {
    if (!v || !box.current) return;
    const parsed = parseYouTube(v.url);
    if (!parsed) {
      setAt((i) => i + 1);
      return;
    }
    let alive = true;
    const host = document.createElement('div');
    box.current.innerHTML = '';
    box.current.appendChild(host);
    loadYT().then((YT) => {
      if (!alive) return;
      const vars: Record<string, unknown> = { autoplay: 1, playsinline: 1, rel: 0 };
      if (parsed.video) {
        if (v.from) vars.start = v.from;
        if (v.to) vars.end = v.to;
      } else {
        vars.listType = 'playlist';
        vars.list = parsed.list;
      }
      player.current = new YT.Player(host, {
        width: '100%',
        height: '100%',
        videoId: parsed.video,
        playerVars: vars,
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.playVideo();
            setTitle(e.target.getVideoData?.().title ?? '');
          },
          // Video borrado, privado o que no se puede insertar: pasa al siguiente.
          onError: () => setAt((i) => i + 1),
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (e.data === YT.PlayerState.PLAYING) {
              setPlaying(true);
              setTitle(e.target.getVideoData?.().title ?? '');
            }
            if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
            if (e.data === YT.PlayerState.ENDED && parsed.video) setAt((i) => i + 1);
          },
        },
      });
    });
    return () => {
      alive = false;
      player.current?.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, v?.url, v?.from, v?.to]);

  if (!videos.length) return null;
  if (!v) return <p className="text-xs text-zinc-400">🎵 Terminó tu lista.</p>;
  return (
    <div className="w-72 overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/15 backdrop-blur-xl">
      <div ref={box} className="aspect-video w-full bg-black" />
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-zinc-400">🎵 Sonando {at + 1} de {videos.length}{v.to ? ` · hasta ${fmtSeconds(v.to)}` : ''}</span>
          <span className="block truncate text-xs font-semibold text-[#fff]">{title || 'Cargando…'}</span>
        </span>
        <button type="button" aria-label={playing ? 'Pausar música' : 'Seguir música'} onClick={() => (playing ? player.current?.pauseVideo() : player.current?.playVideo())} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        {at < videos.length - 1 && <button type="button" aria-label="Siguiente" onClick={() => setAt((i) => i + 1)} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>}
      </div>
    </div>
  );
};
