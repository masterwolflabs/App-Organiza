'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, Volume2, VolumeX, X } from 'lucide-react';
import { APP } from '@/app.config';
import { spokenText, TOUR_SCRIPT, TourScriptStep, voiceVersion } from '@/utils/tourScript';

// Guided tour (de Finance): dims the app, lights up one element at a time
// (found by its data-tour="…" attribute), explains it in a card and reads it
// aloud with the robot's voice, at 1x, 1.25x, 1.5x or 2x.
// Steps whose element isn't on screen show the card centered instead.

interface GuidedTourProps {
  open: boolean;
  /** Side effects when a step starts: abrir su sección. */
  onEnterStep: (step: TourScriptStep) => void;
  onClose: () => void;
  /** Otro guion (p. ej. el tour de una acción del Horario). */
  steps?: TourScriptStep[];
}

const VOICE_KEY = 'organiza-tour-voice';
const RATE_KEY = 'organiza-tour-rate';
const RATES = [1, 1.25, 1.5, 2];
const PAD = 8;

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(name: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

// --- Voice -------------------------------------------------------------------

function useTourVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    token.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (step: TourScriptStep, rate: number) => {
      stop();
      const my = token.current;
      // Fallback: the browser's own voice (if the high-quality voice can't load).
      const fallback = () => {
        if (my !== token.current || !('speechSynthesis' in window)) return setSpeaking(false);
        const u = new SpeechSynthesisUtterance(spokenText(step));
        const voices = window.speechSynthesis.getVoices();
        u.voice = voices.find((v) => v.lang === 'es-CL') ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
        u.lang = u.voice?.lang ?? 'es-CL';
        u.rate = rate;
        u.onend = () => my === token.current && setSpeaking(false);
        window.speechSynthesis.speak(u);
      };
      const a = new Audio(`${APP.cloudUrl}/api/tour/voice?step=${step.id}&v=${voiceVersion(step)}`);
      a.playbackRate = rate;
      a.preservesPitch = true;
      audioRef.current = a;
      let failed = false;
      const fail = () => {
        if (failed) return;
        failed = true;
        fallback();
      };
      a.onerror = fail;
      a.onended = () => my === token.current && setSpeaking(false);
      setSpeaking(true);
      a.play().catch(fail);
    },
    [stop]
  );

  useEffect(() => stop, [stop]);
  const setRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);
  return { speak, stop, speaking, setRate };
}

// --- Component ---------------------------------------------------------------

export const GuidedTour: React.FC<GuidedTourProps> = ({ open, onEnterStep, onClose, steps = TOUR_SCRIPT }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [vw, setVw] = useState(1024);
  const [vh, setVh] = useState(768);
  const [rate, setRateState] = useState(1);
  const { speak, stop, speaking, setRate } = useTourVoice();
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const enterRef = useRef(onEnterStep);
  enterRef.current = onEnterStep;

  const step = steps[index];
  const target = step.target;
  const last = index === steps.length - 1;

  useEffect(() => {
    try {
      setVoiceOn(localStorage.getItem(VOICE_KEY) !== 'off');
      const saved = Number(localStorage.getItem(RATE_KEY));
      if (RATES.includes(saved)) setRateState(saved);
    } catch {
      /* private mode */
    }
  }, []);

  // A fresh start every time the tour opens.
  useEffect(() => {
    if (open) {
      setIndex(0);
    } else stop();
  }, [open, stop]);

  // Enter the step: side effects, then find + frame its element.
  useEffect(() => {
    if (!open) return;
    enterRef.current(step);
    setRect(null);
    if (!target) return;
    let raf = 0;
    let tries = 0;
    let scrolled = false;
    const tick = () => {
      const el = findTarget(target);
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r0 = el.getBoundingClientRect();
          if (r0.top < 80 || r0.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
        }
        const r = el.getBoundingClientRect();
        setRect((prev) =>
          prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height }
        );
      } else if (++tries > 180) {
        setRect(null); // not on screen — the card shows centered
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, index, step, target]);

  // Read the step aloud.
  useEffect(() => {
    if (!open || !voiceOn) return stop();
    speak(step, rateRef.current);
  }, [open, voiceOn, index, step, speak, stop]);

  useEffect(() => {
    const measure = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, onClose]);

  const toggleVoice = () => {
    const v = !voiceOn;
    setVoiceOn(v);
    try {
      localStorage.setItem(VOICE_KEY, v ? 'on' : 'off');
    } catch {
      /* private mode */
    }
  };

  const cycleRate = () => {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRateState(r);
    setRate(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* private mode */
    }
  };

  if (!open) return null;

  // Card placement.
  const isPhone = vw < 640;
  const cardW = Math.min(380, vw - 24);
  const hole = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  let cardStyle: React.CSSProperties;
  if (!hole) {
    cardStyle = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 150) };
  } else if (isPhone) {
    const targetLow = hole.top + hole.height / 2 > vh / 2;
    cardStyle = targetLow ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 12 };
  } else {
    const left = Math.min(Math.max(16, hole.left + hole.width / 2 - cardW / 2), vw - cardW - 16);
    const below = vh - (hole.top + hole.height);
    if (below >= 250) cardStyle = { left, top: hole.top + hole.height + 14 };
    else if (hole.top >= 250) cardStyle = { left, bottom: vh - hole.top + 14 };
    else cardStyle = { left: Math.max(16, hole.left - cardW - 16) > 16 ? hole.left - cardW - 16 : vw - cardW - 16, top: 16 };
  }

  return (
    <>
      {/* Click shield (the tour is driven only from its card). */}
      <div className="fixed inset-0 z-[90]" onClick={(e) => e.stopPropagation()} />
      {hole ? (
        <div
          className="pointer-events-none fixed z-[91] rounded-2xl ring-2 ring-sky-400/80 transition-all duration-300"
          style={{ ...hole, boxShadow: '0 0 0 9999px rgba(3,4,8,0.74), 0 0 32px 4px rgba(56,189,248,0.35)' }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[91] bg-[rgba(3,4,8,0.74)]" />
      )}

      <div
        role="dialog"
        aria-label={step.title}
        className="fixed z-[92] rounded-2xl border border-white/10 bg-[#111216] p-5 shadow-2xl shadow-black/70"
        style={{ ...cardStyle, width: isPhone && hole ? undefined : cardW }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-sky-400">
            <Compass className="h-3.5 w-3.5" /> Tutorial · {index + 1} de {steps.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleVoice}
              title={voiceOn ? 'Silenciar voz' : 'Activar voz'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${voiceOn ? 'text-sky-300 hover:bg-sky-500/10' : 'text-zinc-500 hover:bg-white/5'}`}
            >
              {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {voiceOn && speaking && (
                <span className="flex h-3 items-end gap-[2px]">
                  {[0, 1, 2].map((b) => (
                    <span key={b} className="w-[2px] animate-pulse rounded-full bg-sky-300" style={{ height: `${6 + b * 3}px`, animationDelay: `${b * 120}ms` }} />
                  ))}
                </span>
              )}
            </button>
            <button onClick={cycleRate} data-help="Velocidad de la voz" aria-label={`Velocidad ${rate}x`} className="rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums text-sky-300 hover:bg-sky-500/10">
              {rate}x
            </button>
            <button onClick={onClose} title="Saltar tutorial" className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <h3 className="text-base font-bold text-white">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">
            {last ? 'Cerrar' : 'Saltar tutorial'}
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button onClick={back} className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5">
                <ArrowLeft className="h-3.5 w-3.5" /> Atrás
              </button>
            )}
            <button onClick={next} className="flex items-center gap-1 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500">
              {last ? '¡Empezar!' : index === 0 ? 'Comenzar' : 'Siguiente'} {!last && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

/** "¿Quieres hacer el tutorial?": se pregunta una vez por sesión. */
export const TourPrompt: React.FC<{ name: string; onStart: () => void; onDismiss: (never: boolean) => void }> = ({ name, onStart, onDismiss }) => {
  const [never, setNever] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl shadow-black/70">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/20">
          <Compass className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-bold text-white">Hola{name ? `, ${name}` : ''} 👋 ¿Hacemos el tutorial?</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Un recorrido guiado con voz, de un par de minutos. Lo puedes saltar, retroceder y acelerar cuando quieras.
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="h-3.5 w-3.5 accent-sky-500" />
          No volver a preguntarme (está en tu perfil → Tutorial de la app)
        </label>
        <div className="mt-5 flex gap-2">
          <button onClick={() => onDismiss(never)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5">
            Ahora no
          </button>
          <button onClick={onStart} className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500">
            Sí, empezar
          </button>
        </div>
      </div>
    </div>
  );
};
