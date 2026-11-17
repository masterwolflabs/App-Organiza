'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 🔊🎙️ Voz de la evaluación de Workout Pro (MODIFICACIÓN 04, 2026-11-17) — solo lo que el dispositivo trae, gratis:
 *  · Leer en voz alta: `speechSynthesis` (todas las plataformas modernas). Voces en español del dispositivo;
 *    elige la más natural disponible. Ajustes (encendida, lectura automática, velocidad, voz) por dispositivo.
 *  · Responder hablando: `SpeechRecognition` (Chrome, Edge, Safari). Si no existe o falla (Firefox, algunas apps
 *    de escritorio), se dice claramente y se responde escribiendo: nunca se finge que escucha.
 */

export type VoiceSettings = { enabled: boolean; auto: boolean; rate: number; voice: string | null };
const KEY = 'wp-coach-voice';
const DEFAULTS: VoiceSettings = { enabled: true, auto: true, rate: 1.05, voice: null };

/** Mejor voz en español: primero las «naturales/premium», luego Chile/Latinoamérica, luego cualquier español. */
function pickVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const es = list.filter((v) => v.lang.toLowerCase().startsWith('es'));
  if (!es.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/(natural|neural|premium|enhanced|mejorad|siri)/i.test(v.name) ? 40 : 0) +
    (/es-(cl|419|mx|us|ar|co)/i.test(v.lang) ? 20 : 0) +
    (/google/i.test(v.name) ? 10 : 0) +
    (/(paulina|mónica|monica|jorge|diego|juan|francisca|sabina)/i.test(v.name) ? 8 : 0) +
    (v.localService ? 2 : 0);
  return [...es].sort((a, b) => score(b) - score(a))[0];
}

export function useCoachVoice() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULTS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) setSettings({ ...DEFAULTS, ...s });
    } catch {}
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es')));
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const update = useCallback((p: Partial<VoiceSettings>) => {
    setSettings((s) => {
      const n = { ...s, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {}
      if (p.enabled === false && supported) window.speechSynthesis.cancel();
      return n;
    });
  }, [supported]);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !settings.enabled || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const all = synth.getVoices();
    const v = all.find((x) => x.voiceURI === settings.voice) ?? pickVoice(all);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'es-CL';
    u.rate = settings.rate;
    u.pitch = 1.05; // un poco más de energía, sin sonar artificial
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
  }, [settings, supported]);

  const current = voices.find((x) => x.voiceURI === settings.voice) ?? pickVoice(voices);
  return { supported, settings, update, voices, current, speak, stop, speaking };
}

/* ── Micrófono ────────────────────────────────────────────────────────────────────── */

type Rec = { start: () => void; stop: () => void; abort: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: unknown; onend: unknown; onerror: unknown };
export type MicState = 'idle' | 'listening' | 'unsupported' | 'denied' | 'error';

/** Escucha y devuelve el texto (lo provisorio mientras hablas y lo final al terminar). No guarda nada solo. */
export function useMicAnswer(onFinal: (text: string) => void) {
  const [state, setState] = useState<MicState>('idle');
  const [interim, setInterim] = useState('');
  const rec = useRef<Rec | null>(null);
  const finalText = useRef('');
  const cb = useRef(onFinal);
  cb.current = onFinal;

  useEffect(() => {
    const W = window as unknown as Record<string, unknown>;
    const SR = (W.SpeechRecognition || W.webkitSpeechRecognition) as (new () => Rec) | undefined;
    if (!SR) {
      setState('unsupported');
      return;
    }
    const r = new SR();
    r.lang = 'es-CL';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      let live = '';
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const t = e.results[k][0].transcript;
        if (e.results[k].isFinal) finalText.current += t;
        else live += t;
      }
      setInterim((finalText.current + live).trim());
    };
    r.onend = () => {
      const t = finalText.current.trim();
      finalText.current = '';
      setInterim('');
      setState((s) => (s === 'listening' ? 'idle' : s));
      if (t) cb.current(t);
    };
    r.onerror = (e: { error?: string }) => {
      finalText.current = '';
      setInterim('');
      setState(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'denied' : e?.error === 'no-speech' || e?.error === 'aborted' ? 'idle' : 'error');
    };
    rec.current = r;
    return () => r.abort();
  }, []);

  const start = useCallback(() => {
    if (!rec.current) return;
    finalText.current = '';
    setInterim('');
    try {
      rec.current.start();
      setState('listening');
    } catch {
      setState('error');
    }
  }, []);
  const stop = useCallback(() => rec.current?.stop(), []);
  return { state, interim, start, stop, available: state !== 'unsupported' };
}
