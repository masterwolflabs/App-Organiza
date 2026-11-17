'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ListMusic, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { Video } from '@/components/organiza/model';
import { audioNames, forgetAudio, resolveAudio, warmAudio } from '@/components/organiza/musicAudio';
import { desktop, isDesktop, onYtState } from '@/lib/desktop';
import { access as spotifyAccess, parseSpotify, spotifyApi, spotifyKind, spotifyMeta } from '@/lib/spotify';

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

type PlayerEvents = { onReady?: (e: { target: YTPlayer }) => void; onStateChange?: (e: { data: number; target: YTPlayer }) => void; onError?: (e?: { data?: number; target?: YTPlayer }) => void };

/**
 * 🎵 Reproductor del audio propio (2026-11-17): un `<audio>` que habla igual que el de YouTube (mismos
 * métodos y estados 1 sonando · 2 pausa · 0 terminó · 3 cargando), así el crossfade, el «hasta», el bucle
 * y el vigilante funcionan sin cambios. (En iPhone el volumen lo manda el teléfono: ahí el fade es corte.)
 */
/**
 * ⚡ Audios listos de antemano (2026-11-18, Daily focus-cambio-rapido): al abrir el focus, cada audio propio
 * queda cargado y parado en su «desde». Al tocar ⏭ solo se le da play: no espera a la red.
 */
type Pooled = { el: HTMLAudioElement; busy: boolean; from: number };
const pool = new Map<string, Pooled>();
const freshAudio = () => {
  const el = new Audio();
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  return el;
};
function pooled(audio: string, from: number): Pooled {
  let e = pool.get(audio);
  // Si falló (sin internet, link roto), se arma de nuevo.
  if (e && (e.el.error || e.el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) && !e.busy) {
    pool.delete(audio);
    e = undefined;
  }
  if (!e) {
    const el = freshAudio();
    e = { el, busy: false, from };
    pool.set(audio, e);
    const entry = e;
    el.addEventListener('loadedmetadata', () => {
      if (!entry.busy && entry.from) el.currentTime = entry.from;
    }, { once: true });
    // Si falla mientras espera (permiso vencido, sin internet), sale de la reserva: la canción usará uno nuevo.
    el.addEventListener('error', () => {
      if (!entry.busy && pool.get(audio) === entry) pool.delete(audio);
    }, { once: true });
    resolveAudio(audio)
      .then((src) => {
        if (src && !el.src) el.src = src;
        else if (!src && pool.get(audio) === entry && !entry.busy) pool.delete(audio);
      })
      .catch(() => pool.get(audio) === entry && !entry.busy && pool.delete(audio));
  }
  return e;
}
/** Deja listos los audios propios de la lista (se llama al abrir el focus). */
export function warmPool(videos: Video[]) {
  videos.forEach((v) => v.audio && pooled(v.audio, v.from ?? 0));
}

function audioPlayer(host: HTMLElement, audio: string, title: string, start: number, events: PlayerEvents): YTPlayer {
  // El de la reserva si está libre (la misma canción en los dos canales usa uno nuevo).
  const entry = pooled(audio, start);
  const mine = entry.busy ? null : entry;
  if (mine) mine.busy = true;
  const el = mine ? mine.el : freshAudio();
  const ac = new AbortController();
  const on = (type: string, fn: () => void, once = false) => el.addEventListener(type, fn, { signal: ac.signal, once });
  let gone = false;
  const p: YTPlayer & { slow: true } = {
    // (La primera vez un link de Drive se trae a tu cuenta: puede tardar; el vigilante le da más tiempo.)
    slow: true,
    destroy: () => {
      gone = true;
      ac.abort();
      el.pause();
      if (mine) {
        // Vuelve a la reserva, parado en su «desde» y listo para la próxima vez.
        el.muted = false;
        el.volume = 1;
        try {
          el.currentTime = mine.from;
        } catch {}
        mine.busy = false;
      } else {
        el.removeAttribute('src');
        el.load();
      }
    },
    playVideo: () => void el.play().catch(() => events.onStateChange?.({ data: 2, target: p })),
    pauseVideo: () => el.pause(),
    seekTo: (s: number) => {
      el.currentTime = Math.max(0, s);
    },
    setVolume: (v: number) => {
      el.volume = Math.max(0, Math.min(1, v / 100));
    },
    getCurrentTime: () => el.currentTime || 0,
    getDuration: () => (Number.isFinite(el.duration) ? el.duration : 0),
    // El nombre real del archivo si Drive lo dijo (las guardadas antes decían «Audio de Google Drive»).
    getVideoData: () => ({ title: audioNames.get(audio) || title }),
    mute: () => {
      el.muted = true;
    },
    unMute: () => {
      el.muted = false;
    },
  };
  void host;
  const state = (data: number) => () => !gone && events.onStateChange?.({ data, target: p });
  on('playing', state(1));
  on('pause', () => !el.ended && state(2)());
  on('waiting', state(3));
  on('ended', state(0));
  // Si falla, se pide un permiso nuevo y se prueba UNA vez más antes de saltarla.
  let retried = false;
  on('error', () => {
    if (gone) return;
    console.warn('[Master Planner · música] no pude tocar tu audio', { audio, code: el.error?.code, msg: el.error?.message, retried });
    if (retried) return events.onError?.();
    retried = true;
    forgetAudio(audio);
    resolveAudio(audio)
      .then((src) => {
        if (gone) return;
        if (!src) return events.onError?.();
        on('loadedmetadata', ready, true);
        el.src = src;
      })
      .catch(() => !gone && events.onError?.());
  });
  const ready = () => {
    if (gone) return;
    if (Math.abs(el.currentTime - start) > 0.5) el.currentTime = start;
    events.onReady?.({ target: p });
  };
  // Ya cargado (de la reserva): listo al tiro. Si no, apenas sepa cuánto dura.
  if (el.readyState >= 1) setTimeout(ready, 0);
  else on('loadedmetadata', ready, true);
  if (!el.src)
    resolveAudio(audio)
      .then((src) => {
        if (gone || el.src) return;
        if (!src) return events.onError?.();
        el.src = src;
      })
      .catch(() => !gone && events.onError?.());
  return p;
}

/** Videos que YouTube no deja sonar dentro de la página (error 150). En la app de Mac van directo a la ventanita. */
export const blockedVideos = new Set<string>();

/**
 * 💻 App de Mac (1.0.3): la canción bloqueada suena en una ventana de YouTube ESCONDIDA y el focus queda en
 * pantalla. Habla igual que el reproductor de YouTube; la ventanita cuenta dónde va cada medio segundo.
 * `show(true)` la muestra chica en una esquina. (Si YouTube pone un anuncio, se espera como «cargando».)
 */
function macPlayer(video: string, start: number, events: PlayerEvents): YTPlayer & { show: (on: boolean) => void } {
  const label = `yt-${Math.random().toString(36).slice(2, 10)}`;
  let t = start;
  let dur = 0;
  let at = Date.now();
  let state = -1;
  let vol = 100;
  let ready = false;
  let gone = false;
  const p = {
    destroy: () => {
      gone = true;
      stop();
      void desktop.ytClose(label);
    },
    playVideo: () => void desktop.ytCmd(label, 'play'),
    pauseVideo: () => void desktop.ytCmd(label, 'pause'),
    seekTo: (s: number) => {
      t = s;
      at = Date.now();
      void desktop.ytCmd(label, 'seek', s);
    },
    setVolume: (v: number) => {
      if (Math.round(v) === vol) return;
      vol = Math.round(v);
      void desktop.ytCmd(label, 'volume', vol);
    },
    // Entre un aviso y otro se adelanta solo con el reloj (así el corte en «hasta» cae justo).
    getCurrentTime: () => (state === 1 ? t + (Date.now() - at) / 1000 : t),
    getDuration: () => dur,
    getVideoData: () => ({ title: 'Sonando en la ventanita de YouTube' }),
    mute: () => void desktop.ytCmd(label, 'mute', 1),
    unMute: () => void desktop.ytCmd(label, 'mute', 0),
    show: (on: boolean) => void desktop.ytShow(label, on),
  };
  const stop = onYtState(label, (s) => {
    if (gone) return;
    t = s.t;
    at = Date.now();
    if (s.dur) dur = s.dur;
    if (!ready) {
      ready = true;
      events.onReady?.({ target: p });
    }
    if (ready && s.state !== state) {
      state = s.state;
      events.onStateChange?.({ data: s.state, target: p });
    }
  });
  desktop.ytOpen(label, video, start, vol).then((ok) => !ok && !gone && events.onError?.());
  // Si en 25 s no contó nada (sin internet, video borrado), se salta.
  setTimeout(() => !ready && !gone && events.onError?.(), 25000);
  return p;
}

/* ── 🎧 Canciones de Spotify (2026-11-18, Daily focus-spotify-en-lista) ─────────────────────────────
 * En el navegador, Master Planner es un parlante de Spotify (Web Playback SDK, requiere Premium): la canción
 * suena aquí con su desde/hasta, volumen y crossfade. Donde el SDK no corre (app de Mac, Safari de iPhone)
 * controla tu Spotify abierto (Spotify Connect). Un solo parlante: dos de Spotify seguidas se cortan, no se funden.
 */
type SdkState = { paused: boolean; loading?: boolean; position: number; duration: number; context?: { uri?: string | null }; track_window?: { current_track?: { id?: string; uri?: string; linked_from?: { id?: string | null; uri?: string | null } } } };
type SdkPlayer = { connect(): Promise<boolean>; addListener(ev: string, cb: (x: never) => void): boolean; setVolume(v: number): Promise<void>; pause(): Promise<void>; resume(): Promise<void>; seek(ms: number): Promise<void>; activateElement?(): Promise<void> };
type SpotifyDevice = { player: SdkPlayer; deviceId: string } | null;
let sdkDevice: Promise<SpotifyDevice> | null = null;
const sdkListeners = new Set<(s: SdkState | null) => void>();
let spotifyOwner: object | null = null;
function spotifyDevice(): Promise<SpotifyDevice> {
  if (sdkDevice) return sdkDevice;
  sdkDevice = new Promise<SpotifyDevice>((ok) => {
    // La app de Mac (WebKit sin Widevine) no puede ser parlante: ahí se controla tu Spotify abierto.
    if (isDesktop()) return ok(null);
    const w = window as unknown as { Spotify?: { Player: new (o: Record<string, unknown>) => SdkPlayer }; onSpotifyWebPlaybackSDKReady?: () => void };
    let done = false;
    const fin = (d: SpotifyDevice) => {
      if (done) return;
      done = true;
      if (!d) sdkDevice = null; // se puede volver a intentar (ej. reconectaste Spotify)
      ok(d);
    };
    const start = () => {
      const player = new w.Spotify!.Player({ name: 'Master Planner', volume: 1, getOAuthToken: (cb: (t: string) => void) => void spotifyAccess().then((t) => cb(t ?? '')) });
      player.addListener('ready', ((x: { device_id: string }) => fin({ player, deviceId: x.device_id })) as (x: never) => void);
      for (const ev of ['initialization_error', 'authentication_error', 'account_error']) player.addListener(ev, (() => fin(null)) as (x: never) => void);
      player.addListener('player_state_changed', ((st: SdkState | null) => sdkListeners.forEach((f) => f(st))) as (x: never) => void);
      void player.connect().then((c) => !c && fin(null));
    };
    setTimeout(() => fin(null), 15000);
    if (w.Spotify) return start();
    w.onSpotifyWebPlaybackSDKReady = start;
    const sc = document.createElement('script');
    sc.src = 'https://sdk.scdn.co/spotify-player.js';
    sc.async = true;
    sc.onerror = () => fin(null);
    document.head.appendChild(sc);
  });
  return sdkDevice;
}

function spotifyPlayer(uri: string, start: number, events: PlayerEvents): YTPlayer & { lazy: true; slow: true } {
  // Canción o episodio suenan solos; podcast, álbum, playlist o artista suenan enteros (en orden) hasta tu «hasta».
  const kind = spotifyKind(uri);
  const id = uri.split(':')[2];
  const single = kind === 'track' || kind === 'episode';
  let gone = false;
  let started = false;
  let ready = false;
  let t = start;
  let at = Date.now();
  let state = -1;
  let dur = 0;
  let vol = 100;
  let muted = false;
  let title = 'Canción de Spotify';
  let dev: SpotifyDevice = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  let volAt = 0;
  let volTimer: ReturnType<typeof setTimeout> | undefined;
  const mine = () => spotifyOwner === p;
  const emit = (n: number) => {
    if (n === state) return;
    state = n;
    if (!gone) events.onStateChange?.({ data: n, target: p });
  };
  const sendVol = () => {
    if (!mine() || gone) return;
    const v = muted ? 0 : vol;
    if (dev) return void dev.player.setVolume(v / 100);
    // Spotify Connect: la API no aguanta cambios cada 100 ms (crossfade): máximo uno cada 0,7 s.
    clearTimeout(volTimer);
    const wait = Math.max(0, 700 - (Date.now() - volAt));
    volTimer = setTimeout(() => {
      volAt = Date.now();
      void spotifyApi(`/volume?volume_percent=${Math.round(muted ? 0 : vol)}`, 'PUT');
    }, wait);
  };
  const onSdk = (st: SdkState | null) => {
    if (!st || !mine() || gone) return;
    const cur = st.track_window?.current_track;
    if (single ? cur && cur.id !== id && cur.linked_from?.id !== id && cur.uri !== uri : st.context?.uri && st.context.uri !== uri) return;
    t = st.position / 1000;
    at = Date.now();
    if (st.duration) dur = st.duration / 1000;
    // (Solo una canción o un episodio «termina»: en un podcast o playlist hay pausas cortas entre uno y otro.)
    if (single && st.paused && started && st.position === 0 && state === 1) return emit(0);
    emit(st.paused ? 2 : st.loading ? 3 : 1);
  };
  const pollConnect = () => {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!mine() || gone) return;
      const r = await spotifyApi('', 'GET');
      if (!r || r.status === 204 || !r.ok) return;
      const j = (await r.json().catch(() => null)) as { is_playing?: boolean; progress_ms?: number; item?: { id?: string; duration_ms?: number }; context?: { uri?: string } | null } | null;
      if (!j || gone) return;
      if (single ? j.item?.id !== id : j.context?.uri !== uri) return state === 1 && single ? emit(0) : undefined;
      t = (j.progress_ms ?? 0) / 1000;
      at = Date.now();
      if (j.item?.duration_ms) dur = j.item.duration_ms / 1000;
      emit(j.is_playing ? 1 : 2);
    }, 1000);
  };
  const play = async () => {
    if (gone) return;
    if (mine() && started) {
      if (dev) return void dev.player.resume();
      return void spotifyApi('/play', 'PUT');
    }
    spotifyOwner = p;
    started = true;
    emit(3);
    await dev?.player.activateElement?.().catch(() => {});
    const r = await spotifyApi(dev ? `/play?device_id=${dev.deviceId}` : '/play', 'PUT', single ? { uris: [uri], position_ms: Math.round(t * 1000) } : { context_uri: uri, position_ms: Math.round(t * 1000) });
    if (gone) return;
    if (!r || !r.ok) {
      // Sin parlante aquí y sin Spotify abierto en ningún equipo (404), o sin Premium (403).
      spotifyOwner = null;
      started = false;
      return events.onError?.({ data: r?.status ?? 0, target: p });
    }
    sendVol();
    if (!dev) pollConnect();
  };
  const p: YTPlayer & { lazy: true; slow: true } = {
    lazy: true,
    slow: true,
    destroy: () => {
      gone = true;
      sdkListeners.delete(onSdk);
      clearInterval(poll);
      clearTimeout(volTimer);
      if (mine()) {
        spotifyOwner = null;
        if (dev) void dev.player.pause();
        else void spotifyApi('/pause', 'PUT');
      }
    },
    playVideo: () => void play(),
    pauseVideo: () => {
      if (!mine()) return;
      if (dev) void dev.player.pause();
      else void spotifyApi('/pause', 'PUT');
    },
    seekTo: (sec: number) => {
      t = Math.max(0, sec);
      at = Date.now();
      if (!mine() || !started) return;
      if (dev) void dev.player.seek(Math.round(t * 1000));
      else void spotifyApi(`/seek?position_ms=${Math.round(t * 1000)}`, 'PUT');
    },
    setVolume: (v: number) => {
      vol = Math.max(0, Math.min(100, v));
      sendVol();
    },
    getCurrentTime: () => (state === 1 ? t + (Date.now() - at) / 1000 : t),
    getDuration: () => dur,
    getVideoData: () => ({ title }),
    mute: () => {
      muted = true;
      sendVol();
    },
    unMute: () => {
      muted = false;
      sendVol();
    },
  };
  sdkListeners.add(onSdk);
  // Listo cuando hay parlante (o Spotify Connect) y se sabe cuánto dura la canción.
  void (async () => {
    const token = await spotifyAccess();
    if (gone) return;
    if (!token) return events.onError?.({ data: 401, target: p });
    const [d, info, m] = await Promise.all([
      spotifyDevice(),
      // Cuánto dura (canción o episodio). Un podcast/álbum/playlist entero no tiene largo: manda tu «hasta».
      (single ? fetch(`https://api.spotify.com/v1/${kind}s/${id}${kind === 'episode' ? '?market=from_token' : ''}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)) as Promise<{ duration_ms?: number; name?: string; artists?: { name: string }[]; show?: { name?: string } } | null>,
      spotifyMeta(uri),
    ]);
    if (gone) return;
    dev = d;
    if (info?.duration_ms) dur = info.duration_ms / 1000;
    title = info?.name ? `${info.name}${info.artists?.length ? ` · ${info.artists.map((a) => a.name).join(', ')}` : info.show?.name ? ` · ${info.show.name}` : ''}` : m?.title || title;
    ready = true;
    events.onReady?.({ target: p });
  })();
  void ready;
  return p;
}

/** El reproductor de una canción: su audio propio si tiene; bloqueada en la app de Mac, la ventanita; si no, YouTube. */
function makePlayer(YT: YTNamespace, host: HTMLElement, v: Video, opts: { videoId?: string; playerVars: Record<string, unknown>; events: PlayerEvents }): YTPlayer {
  if (v.audio) return audioPlayer(host, v.audio, v.audioName || 'Mi audio', Number(opts.playerVars.start) || 0, opts.events);
  const sp = parseSpotify(v.url);
  if (sp) return spotifyPlayer(sp, Number(opts.playerVars.start) || 0, opts.events);
  if (opts.videoId && isDesktop() && blockedVideos.has(opts.videoId)) return macPlayer(opts.videoId, Number(opts.playerVars.start) || 0, opts.events);
  return new YT.Player(host, { width: 200, height: 112, videoId: opts.videoId, playerVars: opts.playerVars, events: opts.events });
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

/** ▶ Probar el volumen del focus: toca unos segundos la canción a ese volumen (oculta). Devuelve cómo pararla. */
export function previewVolume(v: Video, volume: number, ms = 6000): () => void {
  const parsed = parseYouTube(v.url);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;width:200px;height:112px;left:0;bottom:0;opacity:0;pointer-events:none';
  document.body.appendChild(host);
  let p: YTPlayer | null = null;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    try {
      p?.destroy();
    } catch {
      /* ya no está */
    }
    host.remove();
  };
  if (!parsed && !v.audio && !parseSpotify(v.url)) {
    stop();
    return stop;
  }
  loadYT().then((YT) => {
    if (done) return;
    const vars: Record<string, unknown> = { autoplay: 1, playsinline: 1, rel: 0 };
    if ((v.audio || parseSpotify(v.url) || parsed?.video) && v.from) vars.start = Math.floor(v.from);
    if (!v.audio && !parseSpotify(v.url) && !parsed?.video) Object.assign(vars, { listType: 'playlist', list: parsed?.list });
    p = makePlayer(YT, host, v, {
      videoId: parsed?.video,
      playerVars: vars,
      events: {
        onReady: (e: { target: YTPlayer }) => {
          e.target.setVolume(volume);
          e.target.playVideo();
        },
        onError: stop,
      },
    });
    setTimeout(stop, ms);
  });
  return stop;
}

/**
 * Un canal (reproductor). `stateAt` = cuándo cambió de estado por última vez y `nudges` = cuántas veces
 * el vigilante tuvo que empujarlo: así se nota si quedó pegado «cargando» o pausado sin que nadie lo pidiera.
 */
type Slot = { player: YTPlayer | null; index: number; ready: boolean; state?: number; stateAt?: number; nudges?: number; loadedAt?: number; readyAt?: number; preload?: boolean; failed?: boolean };

/** Reproductor chico que avanza solo por la lista, con crossfade entre canciones. */
/** `volume` (0–100): el volumen propio de este focus (2026-11-11), el máximo al que sube cada canción y el crossfade. */
export const YouTubeList: React.FC<{ videos: Video[]; crossfade?: number; loopAll?: boolean; paused?: boolean; seek?: { t: number; n: number }; volume?: number; /** Dónde va la que suena (índice, segundo, largo del video), varias veces por segundo. */ onProgress?: (index: number, sec: number, duration: number) => void }> = ({ videos, crossfade = 0, loopAll = false, paused = false, seek, volume = 100, onProgress }) => {
  const progress = useRef(onProgress);
  progress.current = onProgress;
  const top = useRef(volume);
  top.current = Math.max(0, Math.min(100, Math.round(volume)));
  const boxes = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const slots = useRef<Slot[]>([{ player: null, index: -1, ready: false }, { player: null, index: -1, ready: false }]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const fading = useRef(false);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const [title, setTitle] = useState('');
  const [finished, setFinishedState] = useState(false);
  const finishedRef = useRef(false);
  const setFinished = (f: boolean) => {
    finishedRef.current = f;
    setFinishedState(f);
  };
  const [blocked, setBlocked] = useState(false);
  const [skipped, setSkipped] = useState(0);
  // La última que YouTube no dejó tocar aquí (error 150: el dueño o el sello lo bloquean fuera de YouTube).
  const [blockedSong, setBlockedSong] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);
  // La que suena va por la ventanita de YouTube del Mac (y si se está mostrando en la esquina).
  const [onMac, setOnMac] = useState(false);
  const [macVisible, setMacVisible] = useState(false);
  // Silencio aparte de la pausa: la música sigue avanzando, sin sonido.
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const list = useRef(videos);
  list.current = videos;
  // ⚡ Al abrir el focus, tus audios propios quedan listos de antemano (saltar a uno no espera la red).
  const audioKey = videos.map((v) => v.audio ?? '').join('|');
  useEffect(() => {
    warmAudio(audioKey.split('|'));
    warmPool(list.current);
  }, [audioKey]);
  // Largo real de cada video (se conoce al cargarlo); sirve para ubicar la música en el tiempo del focus.
  const lengths = useRef<Record<number, number>>({});

  const nextIndex = (i: number) => (i + 1 < list.current.length ? i + 1 : loopAll ? 0 : -1);

  /** Carga la canción `index` en el canal `slot`, al volumen dado. */
  const load = async (slot: number, index: number, volume: number, startAt?: number, preload = false) => {
    const v = list.current[index];
    const parsed = v && parseYouTube(v.url);
    const box = boxes[slot].current;
    const spotify = v ? parseSpotify(v.url) : null;
    if (!v || (!parsed && !v.audio && !spotify) || !box) return false;
    // Con audio propio o una de Spotify se toca esa canción (como un video suelto, nunca como playlist).
    const single = !!v.audio || !!spotify || !!parsed?.video;
    slots.current[slot].player?.destroy();
    slots.current[slot] = { player: null, index, ready: false, loadedAt: Date.now(), preload };
    const host = document.createElement('div');
    box.innerHTML = '';
    box.appendChild(host);
    const YT = await loadYT();
    const vars: Record<string, unknown> = { autoplay: 1, playsinline: 1, rel: 0 };
    const begin = startAt ?? v.from ?? 0;
    if (single && begin) vars.start = Math.floor(begin);
    if (!single) {
      vars.listType = 'playlist';
      vars.list = parsed?.list;
    }
    // Reproductor chico y oculto: solo se escucha, y YouTube baja la calidad del video sola.
    slots.current[slot].player = makePlayer(YT, host, v, {
      videoId: parsed?.video,
      playerVars: vars,
      events: {
        onReady: (e: { target: YTPlayer }) => {
          // Un reproductor viejo de este canal (ya reemplazado) no puede marcar como listo al nuevo.
          if (slots.current[slot].player && slots.current[slot].player !== e.target) return;
          lengths.current[index] = e.target.getDuration?.() || lengths.current[index];
          if (startAt !== undefined && single) e.target.seekTo(startAt, true);
          e.target.setVolume(volume);
          if (mutedRef.current) e.target.mute?.();
          if (preload && 'lazy' in e.target) {
            // Spotify: un solo parlante; precargar sería quitarle el parlante a la que suena. Queda lista, sin sonar.
          } else if (preload) {
            // Precarga: suena en silencio unos segundos para llenar bien el búfer y queda lista en su inicio.
            e.target.setVolume(0);
            e.target.playVideo();
            setTimeout(() => {
              if (!slots.current[slot].preload || slots.current[slot].player !== e.target) return;
              e.target.pauseVideo();
              e.target.seekTo(begin, true);
            }, 6000);
          } else if (playingRef.current) e.target.playVideo();
          slots.current[slot].ready = true;
          slots.current[slot].readyAt = Date.now();
          if (slot === activeRef.current) {
            setTitle(e.target.getVideoData?.().title ?? '');
            setOnMac('show' in e.target);
          }
        },
        onStateChange: (e: { data: number; target: YTPlayer }) => {
          if (slots.current[slot].player && slots.current[slot].player !== e.target) return;
          slots.current[slot].state = e.data;
          slots.current[slot].stateAt = Date.now();
          if (e.data === 1) slots.current[slot].nudges = 0;
          if (slot !== activeRef.current) return;
          if (e.data === YT.PlayerState.PLAYING) {
            setTitle(e.target.getVideoData?.().title ?? '');
            setOnMac('show' in e.target);
            if (!('show' in e.target)) setMacVisible(false);
            setBlocked(false);
          }
          if (e.data === YT.PlayerState.ENDED) {
            // Playlist entera: sigue sola por dentro; se pasa a la siguiente recién al terminar su último video.
            if (!single) {
              const all = e.target.getPlaylist?.() ?? [];
              if ((e.target.getPlaylistIndex?.() ?? 0) < all.length - 1) return;
            }
            advance();
          }
        },
        // Video que no se puede reproducir fuera de YouTube: se salta, aunque pase en pleno crossfade.
        onError: (e?: { data?: number; target?: YTPlayer }) => {
          // Un reproductor viejo de este canal (ya reemplazado) no cuenta como saltada.
          if (e?.target && slots.current[slot].player && slots.current[slot].player !== e.target) return;
          // App de Mac: la que YouTube no deja sonar aquí (101/150) se vuelve a cargar en la ventanita escondida.
          if (isDesktop() && parsed?.video && !v.audio && (e?.data === 101 || e?.data === 150) && !blockedVideos.has(parsed.video)) {
            blockedVideos.add(parsed.video);
            if (slots.current[slot].index === index) void load(slot, index, volume, startAt, preload);
            return;
          }
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
          ready.readyAt = Date.now();
          ready.stateAt = Date.now();
          ready.player!.setVolume(fade ? 0 : top.current);
          if (playingRef.current) ready.player!.playVideo();
          return true;
        })
      : load(other, n, fade ? 0 : top.current);
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
        slots.current[old].player?.setVolume(Math.round(top.current * (1 - p)));
        const inc = slots.current[other];
        if (inc.ready) {
          inc.player?.setVolume(Math.round(top.current * p));
          // Si la que entra quedó pausada en pleno fade, se reanuda (cada ~1 s, sin insistir de más).
          if (playingRef.current && inc.state === 2 && Date.now() - (inc.stateAt ?? 0) > 800) {
            inc.stateAt = Date.now();
            inc.player?.playVideo();
          }
        }
        if (p < 1) setTimeout(step, 100);
        else {
          // La vieja se calla y se pausa al tiro, pero se desarma un rato después: destruirla justo
          // cuando la nueva arranca podía dejar a la nueva pegada «cargando».
          const gone = slots.current[old];
          gone.player?.setVolume(0);
          gone.player?.pauseVideo();
          slots.current[old] = { player: null, index: -1, ready: false };
          const box = boxes[old].current;
          const host = box?.firstChild;
          setTimeout(() => {
            try {
              gone.player?.destroy();
            } catch {
              /* ya no está */
            }
            // Solo se limpia si el canal no se volvió a usar mientras tanto.
            if (box && host && box.firstChild === host && !slots.current[old].player) box.innerHTML = '';
          }, 2000);
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
      cur.player.setVolume(top.current);
    } else load(activeRef.current, index, top.current, at);
  };

  // Adelantar o retroceder el focus mueve la música al mismo momento.
  useEffect(() => {
    if (seek) seekGlobal(seek.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.n]);

  // Cambiar el volumen del focus se nota al tiro (si está en pleno crossfade, el fade ya sube hasta el nuevo).
  useEffect(() => {
    if (fading.current) return;
    const cur = slots.current[activeRef.current];
    if (cur.ready && !cur.preload) cur.player?.setVolume(top.current);
  }, [volume]);

  // Pausar el focus pausa la música.
  useEffect(() => {
    playingRef.current = !paused;
    setPlaying(!paused);
    slots.current.forEach((x) => !x.preload && (paused ? x.player?.pauseVideo() : x.player?.playVideo()));
  }, [paused]);

  // Arranca con la primera canción.
  useEffect(() => {
    load(0, 0, top.current);
    const all = slots.current;
    return () => all.forEach((s) => s.player?.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reloj: corta en «hasta», hace bucle y empieza el crossfade a tiempo.
  useEffect(() => {
    const t = setInterval(() => {
      const cur = slots.current[activeRef.current];
      const v = list.current[cur.index];
      if (!v || !cur.player || !playingRef.current || finishedRef.current) return;
      // No cargó en 12 s: se salta.
      if (!cur.ready) {
        // (La ventanita del Mac abre la página entera de YouTube: se le da más tiempo.)
        if (Date.now() - (cur.loadedAt ?? Date.now()) > ('slow' in cur.player ? 45000 : 'show' in cur.player ? 30000 : 12000)) {
          setSkipped((n) => n + 1);
          fading.current = false;
          advance(true);
        }
        return;
      }
      // El navegador no la dejó sonar sola: se pide un toque.
      if (cur.state !== 1 && cur.state !== 3 && Date.now() - (cur.readyAt ?? Date.now()) > 3500) setBlocked(true);
      if (fading.current || finishedRef.current) return;
      // Vigilante: la canción que suena NUNCA se queda frenada. Pausada sin que nadie lo pidiera → play;
      // pegada «cargando» → se empuja al mismo segundo; si sigue pegada, se recarga ahí mismo.
      const since = Date.now() - (cur.stateAt ?? cur.readyAt ?? Date.now());
      if ((cur.state === 2 || cur.state === 5 || cur.state === -1) && since > 1500) {
        cur.stateAt = Date.now();
        cur.player.playVideo();
      } else if (cur.state === 3 && since > 5000 && !('show' in cur.player) && !('lazy' in cur.player)) {
        // (En la ventanita del Mac «cargando» puede ser un anuncio de YouTube: se espera, no se recarga.)
        cur.stateAt = Date.now();
        cur.nudges = (cur.nudges ?? 0) + 1;
        const t0 = cur.player.getCurrentTime?.() ?? 0;
        if (cur.nudges >= 3) {
          load(activeRef.current, cur.index, top.current, t0);
          return;
        }
        cur.player.seekTo(t0, true);
        cur.player.playVideo();
      }
      if (!v.audio && !parseSpotify(v.url) && !parseYouTube(v.url)?.video) return;
      const now = cur.player.getCurrentTime?.() ?? 0;
      const dur = cur.player.getDuration?.() ?? 0;
      if (cur.state === 1) progress.current?.(cur.index, now, dur);
      // A «hasta» past the real end (e.g. «Seguir donde quedé» near the end) ends with the video.
      const end = v.to !== undefined && dur ? Math.min(v.to, dur) : v.to ?? dur;
      if (!end) return;
      const lead = v.loop ? 0.3 : Math.max(0.3, crossfade);
      if (now >= end - lead) return advance();
      // 30 s antes del cambio se precarga la siguiente en el otro canal (suena en silencio 6 s para llenar el búfer).
      const n = nextIndex(cur.index);
      const other = slots.current[1 - activeRef.current];
      if (!v.loop && n >= 0 && now >= end - lead - 30 && other.index !== n) load(1 - activeRef.current, n, 0, undefined, true);
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
          {onMac && (
            <button type="button" aria-label={macVisible ? 'Esconder video' : 'Ver video'} data-help={macVisible ? 'Esconder la ventanita de YouTube' : 'Ver el video chiquito en una esquina'} onClick={() => { const on = !macVisible; setMacVisible(on); (slots.current[activeRef.current].player as { show?: (x: boolean) => void } | null)?.show?.(on); }} className={`rounded-lg p-1.5 text-xs hover:bg-white/10 ${macVisible ? 'text-sky-300' : 'text-zinc-200'}`}>📺</button>
          )}
          <button type="button" aria-label="Elegir canción" data-help="Elegir canción" onClick={() => setShowList((x) => !x)} className={`rounded-lg p-1.5 hover:bg-white/10 ${showList ? 'text-sky-300' : 'text-zinc-200'}`}><ListMusic className="h-4 w-4" /></button>
        </span>
      </div>
      {blocked && !finished && (
        <button type="button" onClick={() => { slots.current[activeRef.current].player?.playVideo(); setBlocked(false); }} className="flex w-full items-center justify-center gap-2 border-t border-white/10 bg-amber-400/15 py-3.5 text-base font-bold text-amber-100 hover:bg-amber-400/25">
          <Play className="h-5 w-5" /> Tocar para sonar
          <span className="text-xs font-normal text-amber-200/80">(tu navegador pausó la música)</span>
        </button>
      )}
      {blockedSong !== null && videos[blockedSong] && (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          {parseSpotify(videos[blockedSong].url) ? (
            <>⚠️ No pude tocar la canción {blockedSong + 1} de Spotify. Conéctalo en ⚙️ Configurar (Spotify Premium) o abre Spotify en tu computador o teléfono.{' '}</>
          ) : videos[blockedSong].audio ? (
            <>⚠️ No pude tocar tu audio de la canción {blockedSong + 1}. Si es un link de Drive o Dropbox: en ⚙️ Configurar bórrala y vuelve a pegar el link (ahora se guarda en tu cuenta y suena siempre), o usa 🎵 Subir archivo.{' '}</>
          ) : (
            <>⚠️ La canción {blockedSong + 1} no se puede tocar aquí: su dueño solo deja escucharla en YouTube. Para que suene aquí: ⚙️ Configurar → 🎵 Usar mi audio.{' '}</>
          )}
          {parseYouTube(videos[blockedSong].url)?.video && <a href={`https://www.youtube.com/watch?v=${parseYouTube(videos[blockedSong].url)?.video}&t=${Math.floor(videos[blockedSong].from ?? 0)}s`} target="_blank" rel="noreferrer" className="font-semibold underline">Abrir en YouTube ↗</a>}
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
                    <span className="flex h-7 w-10 items-center justify-center rounded bg-white/10 text-[9px]">{parseSpotify(x.url) ? '🎧' : x.audio ? '🎵' : 'Lista'}</span>
                  )}
                  <span className="flex-1">Canción {i + 1}{x.audio && !id ? ` · ${x.audioName || 'Mi audio'}` : ''}{x.to !== undefined ? ` · hasta ${fmtSeconds(x.to)}` : ''}</span>
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
