'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Repeat, SkipForward } from 'lucide-react';
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

type Slot = { player: YTPlayer | null; index: number; ready: boolean };

/** Reproductor chico que avanza solo por la lista, con crossfade entre canciones. */
export const YouTubeList: React.FC<{ videos: Video[]; crossfade?: number; loopAll?: boolean }> = ({ videos, crossfade = 0, loopAll = false }) => {
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
  const list = useRef(videos);
  list.current = videos;

  const nextIndex = (i: number) => (i + 1 < list.current.length ? i + 1 : loopAll ? 0 : -1);

  /** Carga la canción `index` en el canal `slot`, al volumen dado. */
  const load = async (slot: number, index: number, volume: number) => {
    const v = list.current[index];
    const parsed = v && parseYouTube(v.url);
    const box = boxes[slot].current;
    if (!v || !parsed || !box) return false;
    slots.current[slot].player?.destroy();
    slots.current[slot] = { player: null, index, ready: false };
    const host = document.createElement('div');
    box.innerHTML = '';
    box.appendChild(host);
    const YT = await loadYT();
    const vars: Record<string, unknown> = { autoplay: 1, playsinline: 1, rel: 0 };
    if (parsed.video && v.from) vars.start = Math.floor(v.from);
    if (!parsed.video) {
      vars.listType = 'playlist';
      vars.list = parsed.list;
    }
    slots.current[slot].player = new YT.Player(host, {
      width: '100%',
      height: '100%',
      videoId: parsed.video,
      playerVars: vars,
      events: {
        onReady: (e: { target: YTPlayer }) => {
          e.target.setVolume(volume);
          if (playingRef.current) e.target.playVideo();
          slots.current[slot].ready = true;
          if (slot === activeRef.current) setTitle(e.target.getVideoData?.().title ?? '');
        },
        onStateChange: (e: { data: number; target: YTPlayer }) => {
          if (slot !== activeRef.current) return;
          if (e.data === YT.PlayerState.PLAYING) setTitle(e.target.getVideoData?.().title ?? '');
          // Fin natural del video (sin «hasta»): el reloj de abajo decide qué sigue.
          if (e.data === YT.PlayerState.ENDED) advance();
        },
        onError: () => slot === activeRef.current && advance(true),
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
    load(other, n, fade ? 0 : 100).then((ok) => {
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
      if (!cur.player || !cur.ready || !v || fading.current || !playingRef.current) return;
      const now = cur.player.getCurrentTime?.() ?? 0;
      const end = v.to ?? cur.player.getDuration?.() ?? 0;
      if (!end) return;
      const lead = v.loop ? 0.3 : Math.max(0.3, crossfade);
      if (now >= end - lead) advance();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfade, loopAll]);

  const toggle = () => {
    const p = !playing;
    playingRef.current = p;
    setPlaying(p);
    slots.current.forEach((s) => (p ? s.player?.playVideo() : s.player?.pauseVideo()));
  };

  if (!videos.length) return null;
  const v = videos[at];
  return (
    <div className="w-72 overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/15 backdrop-blur-xl">
      <div className="relative aspect-video w-full bg-black">
        {[0, 1].map((i) => (
          <div key={i} ref={boxes[i]} className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: i === active ? 1 : 0 }} />
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[11px] text-zinc-400">
            {finished ? '🎵 Terminó tu lista' : `🎵 ${at + 1} de ${videos.length}`}
            {!finished && v?.to !== undefined && ` · hasta ${fmtSeconds(v.to)}`}
            {!finished && v?.loop && <Repeat className="h-3 w-3" />}
          </span>
          <span className="block truncate text-xs font-semibold text-[#fff]">{title || 'Cargando…'}</span>
        </span>
        <button type="button" aria-label={playing ? 'Pausar música' : 'Seguir música'} onClick={toggle} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        <button type="button" aria-label="Siguiente" onClick={() => advance(true)} className="rounded-lg p-1.5 text-zinc-200 hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
