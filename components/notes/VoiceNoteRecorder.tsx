'use client';

/**
 * Voice note recorder (Emanuel, 2026-10-28), like Apple's Notas de voz:
 * - It RECORDS the audio (MediaRecorder) — the audio is the source of truth; the text is a bonus.
 * - Live waveform that scrolls while you speak, timer, pause / resume.
 * - Live transcription at the same time (browser SpeechRecognition, Chrome / Edge). If it gives nothing in
 *   5 s (it can fail silently), short pieces go to the AI instead (Emanuel, 2026-11-02). That text is only
 *   a preview: the note's text is made from the whole audio afterwards.
 * - Floats over everything, moves by dragging it and resizes from its corner. The live text goes on the
 *   note's page, so the recorder stays small.
 * - Every second goes to IndexedDB (utils/voiceVault.ts), so nothing is lost: a closed tab or a crash
 *   leaves a recording you can recover the next time you open the recorder.
 * - If the microphone is lost (unplugged, permission revoked) it stops AT ONCE and keeps what you had.
 * - Works offline (the upload waits for the connection — the note editor handles that part).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Square, Trash2, Undo2, WifiOff, X } from 'lucide-react';
import { clock, voiceVault, type VoiceSession } from '@/utils/voiceVault';

export type FinishedRecording = { sessionId: string; blob: Blob; mime: string; seconds: number; transcript: string; cut?: boolean };

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
const getSR = (): (new () => SpeechRec) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
};

type Phase = 'starting' | 'recording' | 'paused' | 'saving' | 'error';

export function VoiceNoteRecorder({
  onFinish,
  onClose,
  exclude = [],
  transcribeLive,
  onLiveText,
}: {
  onFinish: (r: FinishedRecording) => Promise<void> | void;
  onClose: () => void;
  /** One short standalone audio → its text. Without it, the live text depends only on the browser. */
  transcribeLive?: (blob: Blob, mime: string) => Promise<string>;
  /** What's been heard so far: the note shows it on its page. */
  onLiveText?: (text: string) => void;
  /** Sessions this note already holds (waiting to upload) — not offered as "recuperar". */
  exclude?: string[];
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [textState, setTextState] = useState<'live' | 'offline' | 'none' | 'paused'>('live');
  const [quiet, setQuiet] = useState(false);
  const [orphans, setOrphans] = useState<VoiceSession[]>([]);
  const [aiLive, setAiLive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(340);
  const [asking, setAsking] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const srRef = useRef<SpeechRec | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levels = useRef<number[]>([]);
  const chunks = useRef<Blob[]>([]);
  const chunkN = useRef(0);
  const session = useRef<VoiceSession>({ id: crypto.randomUUID(), mime: '', startedAt: new Date().toISOString(), seconds: 0, transcript: '', finished: false });
  const finalRef = useRef('');
  const phaseRef = useRef<Phase>('starting');
  phaseRef.current = phase;
  const elapsed = useRef(0);
  const lastTick = useRef(0);
  const quietSince = useRef(0);
  const done = useRef(false);
  const cbs = useRef({ onFinish, onClose, transcribeLive });
  cbs.current = { onFinish, onClose, transcribeLive };
  const heardSR = useRef(false);
  const liveRef = useRef('');
  const segOn = useRef(false);
  const segRec = useRef<MediaRecorder | null>(null);
  const seg = useRef({ voice: false });
  const segTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const segQueue = useRef<Promise<unknown>>(Promise.resolve());
  const showText = useCallback(() => setFinalText([liveRef.current, finalRef.current].filter(Boolean).join(' ')), []);

  // ---- live text from the AI: 5 s standalone pieces, in order (silent ones are skipped) ----
  const stopSegment = useCallback(() => {
    clearTimeout(segTimer.current);
    try {
      if (segRec.current?.state !== 'inactive') segRec.current?.stop();
    } catch {
      /* ignore */
    }
    segRec.current = null;
  }, []);
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !segOn.current || phaseRef.current !== 'recording') return;
    const mime = session.current.mime;
    const mark = { voice: !analyserRef.current };
    seg.current = mark;
    const parts: Blob[] = [];
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data?.size) parts.push(e.data);
    };
    rec.onstop = () => {
      if (!mark.voice) return;
      const blob = new Blob(parts, { type: mime });
      segQueue.current = segQueue.current
        .then(() => cbs.current.transcribeLive?.(blob, mime))
        .then((text) => {
          const t = text?.trim();
          if (!t) return;
          liveRef.current = liveRef.current ? `${liveRef.current} ${t}` : t;
          showText();
        })
        .catch(() => {});
    };
    rec.start();
    segRec.current = rec;
    segTimer.current = setTimeout(() => {
      stopSegment();
      startSegment();
    }, 5000);
  }, [showText, stopSegment]);

  // ---- live transcription (bonus — never required) ----
  const startSR = useCallback(() => {
    const SR = getSR();
    if (!SR) return setTextState('none');
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setTextState('offline');
    try {
      const sr = new SR();
      sr.lang = 'es-CL';
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e: any) => {
        let live = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const t = String(r[0].transcript).trim();
            if (t) finalRef.current = finalRef.current ? `${finalRef.current} ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
          } else live += r[0].transcript;
        }
        if ((finalRef.current || live.trim()) && !heardSR.current) {
          heardSR.current = true;
          segOn.current = false;
          stopSegment();
          setAiLive(false);
        }
        showText();
        setInterim(live);
        session.current.transcript = finalRef.current;
        setTextState('live');
      };
      sr.onerror = (e: any) => {
        if (e.error === 'network') setTextState('offline');
        else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setTextState('none');
      };
      sr.onend = () => {
        setInterim('');
        if (phaseRef.current !== 'recording' || srRef.current !== sr) return;
        if (!navigator.onLine) return setTextState('offline');
        try {
          sr.start(); // Chrome ends continuous sessions on silence — keep going while recording.
        } catch {
          /* already started */
        }
      };
      srRef.current = sr;
      sr.start();
      setTextState('live');
    } catch {
      setTextState('none');
    }
  }, [showText, stopSegment]);
  const stopSR = useCallback(() => {
    const sr = srRef.current;
    srRef.current = null;
    try {
      sr?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  // ---- finish: hand the file over (also used when the mic is lost) ----
  const finish = useCallback(
    async (cut = false) => {
      if (done.current) return;
      done.current = true;
      setPhase('saving');
      stopSR();
      segOn.current = false;
      stopSegment();
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          rec.addEventListener('stop', () => resolve(), { once: true });
          try {
            rec.stop();
          } catch {
            resolve();
          }
        });
      }
      releaseMic();
      const mime = session.current.mime || chunks.current[0]?.type || 'audio/webm';
      const blob = new Blob(chunks.current, { type: mime });
      session.current = { ...session.current, seconds: Math.round(elapsed.current), transcript: finalRef.current, finished: true };
      await voiceVault.saveSession(session.current);
      if (!blob.size) {
        await voiceVault.remove(session.current.id);
        cbs.current.onClose();
        return;
      }
      await cbs.current.onFinish({ sessionId: session.current.id, blob, mime, seconds: elapsed.current, transcript: liveRef.current ? '' : finalRef.current, cut });
      cbs.current.onClose();
    },
    [releaseMic, stopSR, stopSegment]
  );

  // ---- start recording on mount ----
  useEffect(() => {
    let cancelled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    voiceVault.listSessions().then((list) => !cancelled && setOrphans(list));
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError('Este navegador no permite grabar audio. Prueba con Chrome, Edge o Safari actualizados.');
        return setPhase('error');
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e: any) {
        setError(e?.name === 'NotFoundError' ? 'No encontré un micrófono conectado.' : 'No se pudo acceder al micrófono. Revisa los permisos del navegador.');
        return setPhase('error');
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      // Lost microphone → stop at once and keep what was recorded.
      stream.getAudioTracks().forEach((t) => (t.onended = () => phaseRef.current !== 'saving' && finish(true)));

      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx: AudioContext = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        ctxRef.current = ctx;
        analyserRef.current = an;
      } catch {
        /* no waveform, recording still works */
      }

      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      session.current.mime = rec.mimeType || mime || 'audio/webm';
      rec.ondataavailable = (e) => {
        if (!e.data?.size) return;
        chunks.current.push(e.data);
        voiceVault.addChunk(session.current.id, chunkN.current++, e.data);
        session.current.seconds = Math.round(elapsed.current);
        session.current.transcript = finalRef.current;
        voiceVault.saveSession(session.current);
      };
      rec.onerror = () => finish(true);
      recRef.current = rec;
      await voiceVault.saveSession(session.current);
      rec.start(1000);
      lastTick.current = performance.now();
      setPhase('recording');
      startSR();
      if (cbs.current.transcribeLive) {
        fallback = setTimeout(() => {
          if (heardSR.current || done.current) return;
          segOn.current = true;
          setAiLive(true);
          startSegment();
        }, 5000);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      segOn.current = false;
      stopSegment();
      // Unmounted without finishing (note closed): stop, the audio stays in the vault to recover.
      if (!done.current) {
        stopSR();
        try {
          if (recRef.current?.state !== 'inactive') recRef.current?.stop();
        } catch {
          /* ignore */
        }
        releaseMic();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connection comes back → live text resumes.
  useEffect(() => {
    const on = () => phaseRef.current === 'recording' && !srRef.current && startSR();
    const off = () => setTextState((s) => (s === 'none' ? s : 'offline'));
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [startSR]);

  // ---- waveform + timer (one animation loop) ----
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    let lastSec = -1;
    const buf = new Uint8Array(1024);
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const recording = phaseRef.current === 'recording';
      if (recording) {
        elapsed.current += (now - lastTick.current) / 1000;
        const s = Math.floor(elapsed.current);
        if (s !== lastSec) {
          lastSec = s;
          setSeconds(elapsed.current);
        }
      }
      lastTick.current = now;
      const an = analyserRef.current;
      if (recording && an && now - lastPush > 60) {
        lastPush = now;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        levels.current.push(Math.min(1, rms * 4.5));
        if (levels.current.length > 600) levels.current.splice(0, levels.current.length - 600);
        // "No te escucho" after ~5 s of near silence.
        if (rms < 0.012) {
          if (!quietSince.current) quietSince.current = now;
          else if (now - quietSince.current > 5000) setQuiet(true);
        } else {
          quietSince.current = 0;
          seg.current.voice = true;
          setQuiet(false);
        }
      }
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const mid = h / 2;
      const step = 4;
      const head = w * 0.72; // the "playhead": newest sample sits here, older ones scroll left.
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, mid - 0.5, w, 1);
      const L = levels.current;
      for (let i = L.length - 1, x = head; i >= 0 && x > -step; i--, x -= step) {
        const amp = Math.max(1.5, L[i] * (h * 0.46));
        g.fillStyle = recording ? '#ff453a' : 'rgba(255,69,58,0.55)';
        g.fillRect(x - 1, mid - amp, 2, amp * 2);
      }
      g.fillStyle = '#ff453a';
      g.fillRect(head + 2, 4, 1.5, h - 8);
      g.beginPath();
      g.arc(head + 2.75, 4, 3, 0, Math.PI * 2);
      g.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    textRef.current?.scrollTo({ top: textRef.current.scrollHeight });
    onLiveText?.([finalText, interim].filter(Boolean).join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalText, interim]);

  const pause = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    stopSR();
    stopSegment();
    setInterim('');
    setPhase('paused');
    setTextState((s) => (s === 'live' ? 'paused' : s));
  };
  const resume = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    lastTick.current = performance.now();
    phaseRef.current = 'recording';
    setPhase('recording');
    startSR();
    startSegment();
  };
  const discard = async () => {
    if (elapsed.current > 3 && asking !== 'discard') return setAsking('discard');
    done.current = true;
    stopSR();
    segOn.current = false;
    stopSegment();
    try {
      if (recRef.current?.state !== 'inactive') recRef.current?.stop();
    } catch {
      /* ignore */
    }
    releaseMic();
    await voiceVault.remove(session.current.id);
    cbs.current.onClose();
  };
  const recover = async (s: VoiceSession) => {
    const blob = await voiceVault.blob(s.id);
    setOrphans((o) => o.filter((x) => x.id !== s.id));
    if (!blob) return voiceVault.remove(s.id);
    await cbs.current.onFinish({ sessionId: s.id, blob, mime: s.mime || blob.type, seconds: s.seconds, transcript: s.transcript });
  };
  const forget = async (s: VoiceSession) => {
    setAsking(null);
    await voiceVault.remove(s.id);
    setOrphans((o) => o.filter((x) => x.id !== s.id));
  };

  /** Moves anywhere on the screen, always staying inside it. */
  const startDrag = (e: React.PointerEvent) => {
    const box = rootRef.current;
    if (!box || (e.target as HTMLElement).closest('button, [data-no-drag]')) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    const from = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const left = r.left - pos.x;
    const top = r.top - pos.y;
    const move = (ev: PointerEvent) =>
      setPos({
        x: Math.min(window.innerWidth - r.width - left, Math.max(-left, ev.clientX - from.x)),
        y: Math.min(window.innerHeight - r.height - top, Math.max(-top, ev.clientY - from.y)),
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** The corner changes its width; it grows from the center, like it sits. */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const from = e.clientX;
    const base = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(Math.min(620, window.innerWidth - 24), Math.max(260, base + (ev.clientX - from) * 2)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const askBar = (text: string, yes: string, onYes: () => void) => (
    <div className="flex items-center gap-2 border-b border-white/10 bg-rose-500/15 px-4 py-2 text-xs">
      <span className="min-w-0 flex-1 text-rose-100">{text}</span>
      <button onClick={onYes} className="rounded-md bg-rose-500 px-2 py-0.5 font-semibold text-white hover:bg-rose-400">
        {yes}
      </button>
      <button onClick={() => setAsking(null)} className="rounded-md px-2 py-0.5 font-semibold text-zinc-300 hover:bg-white/10">
        Cancelar
      </button>
    </div>
  );

  const others = orphans.filter((s) => s.id !== session.current.id && !exclude.includes(s.id));
  const statusLine =
    phase === 'paused'
      ? 'En pausa'
      : textState === 'offline' && !navigator.onLine
        ? 'Sin conexión: el audio se sigue grabando y el texto se hará después'
        : textState === 'none' && !aiLive
          ? 'Grabando el audio · el texto se hará al terminar'
          : quiet
            ? 'No te escucho… ¿está bien el micrófono?'
            : 'Grabando y transcribiendo en vivo';

  return (
    <div
      ref={rootRef}
      onPointerDown={startDrag}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width }}
      className="theme-fixed pointer-events-auto relative max-w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-[#111214]/95 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl active:cursor-grabbing"
    >
      {asking === 'discard' && askBar('¿Descartar esta grabación? Se borra el audio.', 'Sí, descartar', discard)}
      {others.length > 0 && (
        <div className="space-y-1.5 border-b border-white/10 bg-amber-400/10 px-4 py-2.5 text-xs">
          {others.slice(0, 3).map((s) => (
            <div key={s.id}>
            {asking === s.id ? (
              askBar('¿Borrar esa grabación de este dispositivo?', 'Sí, borrar', () => forget(s))
            ) : (
            <div className="flex items-center gap-2">
              <Undo2 className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="min-w-0 flex-1 truncate text-amber-100">
                Grabación guardada en este dispositivo · {clock(s.seconds)} ·{' '}
                {new Date(s.startedAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <button onClick={() => recover(s)} className="rounded-md bg-amber-300 px-2 py-0.5 font-semibold text-black hover:bg-amber-200">
                Recuperar
              </button>
              <button onClick={() => setAsking(s.id)} title="Borrar del dispositivo" className="rounded-md p-1 text-amber-200/70 hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' ? (
        <div className="flex items-center gap-3 px-4 py-4 text-sm">
          <Mic className="h-5 w-5 shrink-0 text-rose-400" />
          <p className="flex-1 text-zinc-200">{error}</p>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10">
            Cerrar
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 pt-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-[#ff453a]' : 'bg-zinc-500'}`} />
            <span className="font-mono text-xl font-light tabular-nums tracking-tight">{clock(seconds)}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
              {textState === 'offline' && <WifiOff className="mr-1 inline h-3 w-3 text-amber-300" />}
              {statusLine}
            </span>
          </div>
          <canvas ref={canvasRef} className="mt-1 h-12 w-full" />
          {!onLiveText && (
            <div ref={textRef} data-no-drag="" className="max-h-28 min-h-[2.5rem] cursor-text touch-auto overflow-y-auto px-4 text-sm leading-relaxed text-zinc-100">
              {finalText || interim ? (
                <>
                  {finalText} <span className="text-zinc-500">{interim}</span>
                </>
              ) : (
                <span className="text-zinc-500">{textState === 'live' || aiLive ? 'Habla, aquí aparece lo que dices…' : 'Tu audio queda guardado igual.'}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
            <button onClick={discard} disabled={phase === 'saving'} title="Descartar" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-rose-300 disabled:opacity-40">
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => finish(false)}
              disabled={phase === 'starting' || phase === 'saving'}
              title="Terminar y guardar"
              className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-white/80 disabled:opacity-50"
            >
              {phase === 'saving' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5 rounded-[3px] fill-[#ff453a] text-[#ff453a]" />}
            </button>
            <button
              onClick={phase === 'paused' ? resume : pause}
              disabled={phase !== 'recording' && phase !== 'paused'}
              title={phase === 'paused' ? 'Seguir grabando' : 'Pausa'}
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 disabled:opacity-40"
            >
              {phase === 'paused' ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
            </button>
          </div>
        </>
      )}
      <span onPointerDown={startResize} title="Arrastra para achicarla o agrandarla" className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none after:absolute after:bottom-1.5 after:right-1.5 after:h-2 after:w-2 after:rounded-br-sm after:border-b-2 after:border-r-2 after:border-white/40" />
    </div>
  );
}
