'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Mic, Minus, Pencil, Plus, RotateCcw, Settings2, Sparkles, Square, Volume2, VolumeX, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import {
  allAnswers, answerLabel, isAnswered, numberFromSpeech, optionsFromSpeech, PROVISIONAL_LEVELS, SECTION_LABEL, toggleMulti, useAssessment, valid, visibleQuestions,
  type Answer, type AssessmentApi, type Level, type Question, type Section,
} from '@/components/organiza/assessmentData';
import { useCoachVoice, useMicAnswer } from '@/components/organiza/coachVoice';

/**
 * 🧪 Evaluación personalizada de Workout Pro (MODIFICACIÓN 04, 2026-11-17): inicio (básica / avanzada) →
 * una pregunta por paso con progreso, Volver / Continuar, voz de entrenador y micrófono → resultados.
 * Las preguntas vienen de `assessment.ts` (provisionales por ahora); aquí no hay ninguna pregunta escrita.
 */

type Screen = { kind: 'home' } | { kind: 'flow'; level: Level } | { kind: 'results' };
const LEVEL_LABEL: Record<Level, string> = { basica: 'Evaluación básica', intermedia: 'Evaluación intermedia', avanzada: 'Evaluación avanzada' };
const isTrial = (l: Level) => PROVISIONAL_LEVELS.includes(l);
const grad = 'bg-gradient-to-r from-[#7f1d1d] via-[#b91c1c] to-[#ea580c]';

export const AssessmentModal: React.FC<{ place: string | null; onPlace?: (p: string) => void; onClose: () => void }> = ({ place, onPlace, onClose }) => {
  const api = useAssessment();
  const voice = useCoachVoice();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const close = () => {
    voice.stop();
    onClose();
  };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={close}>
        <div role="dialog" aria-label="Crear mi rutina personalizada" onClick={(e) => e.stopPropagation()} className="flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-[min(760px,94vh)] sm:max-w-xl sm:rounded-3xl">
          {!api.ready ? (
            <p className="m-auto text-sm text-zinc-500">Cargando tu evaluación…</p>
          ) : screen.kind === 'flow' ? (
            <Flow key={screen.level} level={screen.level} api={api} voice={voice} place={place} onPlace={onPlace} onExit={() => { voice.stop(); setScreen({ kind: 'home' }); }} onDone={() => { voice.stop(); setScreen({ kind: 'results' }); }} />
          ) : screen.kind === 'results' ? (
            <Results api={api} onBack={() => setScreen({ kind: 'home' })} onEdit={(level, i) => { api.save(level, { step: i }); setScreen({ kind: 'flow', level }); }} onClose={close} />
          ) : (
            <Home api={api} voice={voice} onStart={(level) => setScreen({ kind: 'flow', level })} onResults={() => setScreen({ kind: 'results' })} onClose={close} />
          )}
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Inicio ───────────────────────────────────────────────────────────────────────── */


const Home: React.FC<{ api: AssessmentApi; voice: ReturnType<typeof useCoachVoice>; onStart: (l: Level) => void; onResults: () => void; onClose: () => void }> = ({ api, voice, onStart, onResults, onClose }) => {
  const all = allAnswers(api.state);
  const card = (level: Level, emoji: string, sub: string, optional: boolean) => {
    const st = api.state[level];
    const qs = visibleQuestions(level, all);
    if (!qs.length)
      return (
        <div className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.02] p-4 opacity-60 ring-1 ring-white/10">
          <span className="text-3xl">{emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold text-white">{LEVEL_LABEL[level]}<span className="rounded-full bg-white/10 px-2 py-px text-[10px] font-bold text-zinc-300">PRÓXIMAMENTE</span></span>
            <span className="mt-0.5 block text-xs text-zinc-400">{sub}</span>
          </span>
        </div>
      );
    const done = qs.filter((q) => isAnswered(st.answers[q.id])).length;
    const label = st.done_at ? 'Editar respuestas' : done ? `Continuar (${done} de ${qs.length})` : 'Empezar';
    return (
      <button type="button" onClick={() => onStart(level)} className="group flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-4 text-left ring-1 ring-white/10 transition hover:bg-white/[0.07] hover:ring-white/25">
        <span className="text-3xl">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 font-semibold text-white">
            {LEVEL_LABEL[level]}
            {optional && <span className="rounded-full bg-white/10 px-2 py-px text-[10px] font-bold text-zinc-300">OPCIONAL</span>}
            {isTrial(level) && <span className="rounded-full bg-amber-500/20 px-2 py-px text-[10px] font-bold text-amber-200">🧪 EXPERIMENTAL</span>}
            {st.done_at && <span className="rounded-full bg-emerald-500 px-2 py-px text-[10px] font-bold text-[#09090b]">✓ LISTA</span>}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-400">{sub}</span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-red-500 transition-all" style={{ width: `${qs.length ? (done / qs.length) * 100 : 0}%` }} /></span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-red-300">{label}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </button>
    );
  };
  return (
    <>
      <div className={`theme-fixed relative ${grad} px-5 py-6`}>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute right-3 top-3 rounded-lg bg-black/30 p-1.5 text-[#fff] hover:bg-black/45"><X className="h-4 w-4" /></button>
        <Sparkles className="h-8 w-8 text-[#fff]" />
        <p className="mt-2 font-display text-2xl font-semibold text-[#fff]">Tu rutina personalizada</p>
        <p className="mt-1 text-sm text-[#fee2e2]">Responde a tu ritmo: se guarda solo y puedes seguir cuando quieras.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {card('basica', '⚡', 'Lo esencial: objetivo, lugar, tiempo, molestias y alimentación. Es lo primero.', false)}
        {card('intermedia', '🎯', 'Cómo entrenas: organización, intensidad, cargas, cardio y recuperación. No repite lo que ya contaste.', true)}
        {card('avanzada', '🔬', 'Profundiza solo en lo que todavía haga falta.', true)}
        {api.state.basica.done_at && (
          <button type="button" onClick={onResults} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-sm font-bold text-[#fff] hover:bg-red-400">📊 Ver mi perfil</button>
        )}
        <VoicePanel voice={voice} />
      </div>
    </>
  );
};

/* ── Ajustes de voz ───────────────────────────────────────────────────────────────── */

const VoicePanel: React.FC<{ voice: ReturnType<typeof useCoachVoice>; compact?: boolean }> = ({ voice, compact }) => {
  const s = voice.settings;
  if (!voice.supported) return <p className="text-xs text-zinc-500">🔇 Este navegador no puede leer en voz alta. El cuestionario funciona igual.</p>;
  return (
    <div className={`space-y-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 ${compact ? '' : 'mt-2'}`}>
      <p className="text-sm font-semibold text-white">🔊 Voz del entrenador</p>
      <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
        Voz encendida
        <input type="checkbox" checked={s.enabled} onChange={(e) => voice.update({ enabled: e.target.checked })} className="h-4 w-4 accent-red-500" />
      </label>
      <label className={`flex items-center justify-between gap-3 text-sm text-zinc-300 ${s.enabled ? '' : 'opacity-40'}`}>
        Leer cada pregunta sola
        <input type="checkbox" disabled={!s.enabled} checked={s.auto} onChange={(e) => voice.update({ auto: e.target.checked })} className="h-4 w-4 accent-red-500" />
      </label>
      <label className={`block text-sm text-zinc-300 ${s.enabled ? '' : 'opacity-40'}`}>
        <span className="flex justify-between">Velocidad <b className="tabular-nums text-zinc-100">{s.rate.toFixed(2).replace('.', ',')}×</b></span>
        <input type="range" min={0.7} max={1.5} step={0.05} disabled={!s.enabled} value={s.rate} onChange={(e) => voice.update({ rate: Number(e.target.value) })} className="mt-1 w-full accent-red-500" />
      </label>
      <label className={`block text-sm text-zinc-300 ${s.enabled ? '' : 'opacity-40'}`}>
        Voz
        <select disabled={!s.enabled || !voice.voices.length} value={voice.current?.voiceURI ?? ''} onChange={(e) => voice.update({ voice: e.target.value || null })} className="mt-1 w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10">
          {!voice.voices.length && <option value="">Sin voces en español en este dispositivo</option>}
          {voice.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
        </select>
      </label>
      <button type="button" disabled={!s.enabled} onClick={() => voice.speak('¡Vamos! Cuéntame, ¿cuántos días a la semana puedes entrenar?')} className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14] disabled:opacity-40">▶ Probar voz</button>
    </div>
  );
};

/* ── Una pregunta por paso ────────────────────────────────────────────────────────── */

const Flow: React.FC<{ level: Level; api: AssessmentApi; voice: ReturnType<typeof useCoachVoice>; place: string | null; onPlace?: (p: string) => void; onExit: () => void; onDone: () => void }> = ({ level, api, voice, place, onPlace, onExit, onDone }) => {
  const st = api.state[level];
  const answers = st.answers;
  const qs = visibleQuestions(level, allAnswers(api.state));
  const i = Math.min(st.step, Math.max(0, qs.length - 1));
  const q = qs[i];
  const [settingsOpen, setSettingsOpen] = useState(false);

  // El lugar ya elegido en Workout Pro llega marcado.
  useEffect(() => {
    if (level === 'basica' && place && !isAnswered(answers.lugar)) api.save('basica', { answers: { ...answers, lugar: place } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = q ? `${q.say ?? q.title}${q.help ? `. ${q.help}` : ''}` : '';
  useEffect(() => {
    if (q && voice.settings.enabled && voice.settings.auto) voice.speak(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  if (!q) return <p className="m-auto p-6 text-center text-sm text-zinc-400">No hay preguntas en este nivel todavía.</p>;
  const v = answers[q.id] ?? null;
  const set = (val: Answer) => {
    api.save(level, { answers: { ...answers, [q.id]: val } });
    if (q.id === 'lugar' && typeof val === 'string') onPlace?.(val);
  };
  const go = (n: number) => {
    voice.stop();
    if (n < 0) return onExit();
    if (n >= qs.length) {
      api.save(level, { step: qs.length - 1, done_at: new Date().toISOString() }, true);
      return onDone();
    }
    api.save(level, { step: n });
  };
  const ok = valid(q, v);
  const last = i === qs.length - 1;

  return (
    <>
      <div className="border-b border-white/10 px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(i - 1)} aria-label="Volver" className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-5 w-5" /></button>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-zinc-400">{LEVEL_LABEL[level]}{isTrial(level) ? ' · experimental' : ''}</p>
          {voice.supported && (
            <>
              <button type="button" onClick={() => voice.update({ enabled: !voice.settings.enabled })} aria-label={voice.settings.enabled ? 'Apagar la voz' : 'Encender la voz'} data-help={voice.settings.enabled ? 'Apagar la voz' : 'Encender la voz'} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white">{voice.settings.enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
              <button type="button" disabled={!voice.settings.enabled} onClick={() => (voice.speaking ? voice.stop() : voice.speak(lines))} aria-label="Repetir la pregunta" data-help="Repetir la pregunta" className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30">{voice.speaking ? <Square className="h-4 w-4" /> : <RotateCcw className="h-5 w-5" />}</button>
              <button type="button" onClick={() => setSettingsOpen((x) => !x)} aria-label="Ajustes de voz" data-help="Velocidad y voz" className={`rounded-lg p-1.5 hover:bg-white/10 hover:text-white ${settingsOpen ? 'bg-white/10 text-white' : 'text-zinc-300'}`}><Settings2 className="h-5 w-5" /></button>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500" style={{ width: `${((i + (ok && isAnswered(v) ? 1 : 0)) / qs.length) * 100}%` }} /></span>
          <span className="text-[11px] tabular-nums text-zinc-500">{i + 1} de {qs.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {settingsOpen && <div className="mb-5"><VoicePanel voice={voice} compact /></div>}
        <h2 className="font-display text-2xl font-semibold leading-snug text-white sm:text-3xl">{q.title}</h2>
        {q.help && <p className="mt-2 text-sm text-zinc-400">{q.help}</p>}
        {!q.required && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Opcional</p>}
        <div className="mt-6"><Input q={q} v={v} set={set} /></div>
        {q.voice !== false && <VoiceAnswer key={q.id} q={q} v={v} set={set} onListen={voice.stop} />}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        <button type="button" onClick={() => { voice.stop(); api.save(level, { step: i }, true); onExit(); }} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200">Guardar y salir</button>
        <span className="flex-1 text-center text-[11px] text-zinc-600">{api.saving === 'saving' ? 'Guardando…' : api.saving === 'saved' ? '✓ Guardado' : api.saving === 'error' ? '⚠️ Guardado solo en este equipo' : ''}</span>
        {!q.required && !isAnswered(v) ? (
          <button type="button" onClick={() => go(i + 1)} className="rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-bold text-zinc-100 hover:bg-white/[0.14]">{last ? 'Terminar' : 'Saltar'}</button>
        ) : (
          <button type="button" disabled={!ok} onClick={() => go(i + 1)} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-40">{last ? 'Terminar' : 'Continuar'} <ChevronRight className="h-4 w-4" /></button>
        )}
      </div>
    </>
  );
};

/* ── Respuestas por tipo ──────────────────────────────────────────────────────────── */

const Input: React.FC<{ q: Question; v: Answer; set: (v: Answer) => void }> = ({ q, v, set }) => {
  const field = 'w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-base text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60';
  if (q.type === 'single' || q.type === 'multi') {
    const multi = q.type === 'multi';
    const picked = multi ? ((v as string[] | null) ?? []) : v;
    return (
      <div className={`grid gap-2.5 ${(q.options?.length ?? 0) > 3 ? 'sm:grid-cols-2' : ''}`}>
        {q.options?.map((o) => {
          const on = multi ? (picked as string[]).includes(o.id) : picked === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => (multi ? set(toggleMulti(q, picked as string[], o.id)) : set(on ? null : o.id))}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${on ? 'bg-red-500/15 text-white ring-2 ring-red-500 shadow-[0_0_14px_rgba(239,68,68,0.35)]' : 'bg-white/[0.04] text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.07]'}`}
            >
              {o.emoji && <span className="text-2xl">{o.emoji}</span>}
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{o.label}</span>{o.help && <span className="mt-0.5 block text-xs font-normal text-zinc-400">{o.help}</span>}</span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${multi ? 'rounded-md' : 'rounded-full'} ${on ? 'bg-red-500 text-[#fff]' : 'ring-1 ring-white/25'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
            </button>
          );
        })}
        {multi && <p className="text-[11px] text-zinc-500">Puedes marcar varias.</p>}
      </div>
    );
  }
  if (q.type === 'number' && q.min !== undefined && q.max !== undefined && q.max - q.min <= 7 && (q.step ?? 1) === 1) {
    return (
      <div>
        <div className="flex justify-between gap-2">
          {Array.from({ length: q.max - q.min + 1 }, (_, k) => q.min! + k).map((x) => (
            <button key={x} type="button" aria-pressed={v === x} onClick={() => set(v === x ? null : x)} className={`flex-1 rounded-2xl py-4 font-display text-xl font-semibold transition ${v === x ? 'bg-red-500 text-[#fff] shadow-[0_0_14px_rgba(239,68,68,0.45)]' : 'bg-white/[0.05] text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]'}`}>{x}</button>
          ))}
        </div>
        {q.unit && <p className="mt-2 text-center text-xs text-zinc-500">{typeof v === 'number' ? `${v} ${v === 1 ? q.unit.replace(/s$/, '') : q.unit}` : q.unit}</p>}
      </div>
    );
  }
  if (q.type === 'number') {
    const n = typeof v === 'number' ? v : null;
    const step = q.step ?? 1;
    const clamp = (x: number) => Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, +x.toFixed(2)));
    return (
      <div className="flex items-center justify-center gap-3">
        <button type="button" aria-label="Menos" onClick={() => set(clamp((n ?? q.min ?? 0) - step))} className="rounded-2xl bg-white/[0.06] p-4 text-white hover:bg-white/[0.12]"><Minus className="h-5 w-5" /></button>
        <label className="flex items-baseline gap-2">
          <input type="number" inputMode="decimal" min={q.min} max={q.max} step={step} value={n ?? ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} aria-label={q.title} className="w-28 bg-transparent text-center font-display text-5xl font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" placeholder="–" />
          {q.unit && <span className="text-lg text-zinc-400">{q.unit}</span>}
        </label>
        <button type="button" aria-label="Más" onClick={() => set(clamp((n ?? (q.min ?? 0) - step) + step))} className="rounded-2xl bg-white/[0.06] p-4 text-white hover:bg-white/[0.12]"><Plus className="h-5 w-5" /></button>
      </div>
    );
  }
  if (q.type === 'scale') {
    const min = q.min ?? 1;
    const max = q.max ?? 5;
    return (
      <div>
        <div className="flex justify-between gap-2">
          {Array.from({ length: max - min + 1 }, (_, k) => min + k).map((x) => (
            <button key={x} type="button" aria-pressed={v === x} onClick={() => set(v === x ? null : x)} className={`flex-1 rounded-2xl py-4 font-display text-xl font-semibold transition ${v === x ? 'bg-red-500 text-[#fff] shadow-[0_0_14px_rgba(239,68,68,0.45)]' : 'bg-white/[0.05] text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]'}`}>{x}</button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-zinc-500"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>
      </div>
    );
  }
  return <textarea value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} rows={4} placeholder={q.placeholder ?? 'Escribe aquí…'} aria-label={q.title} className={`${field} resize-none`} />;
};

/* ── Responder hablando: escuchar → mostrar lo escuchado (editable) → confirmar ───────── */

const VoiceAnswer: React.FC<{ q: Question; v: Answer; set: (v: Answer) => void; onListen: () => void }> = ({ q, v, set, onListen }) => {
  const [heard, setHeard] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const mic = useMicAnswer((t) => { setHeard(t); setNote(''); });

  if (!mic.available) return <p className="mt-5 text-center text-[11px] text-zinc-500">🎙️ Este navegador no permite responder hablando aquí. Responde tocando o escribiendo (en Chrome o Safari sí funciona).</p>;

  const apply = () => {
    const t = (heard ?? '').trim();
    if (!t) return;
    if (q.type === 'text') set([typeof v === 'string' ? v.trim() : '', t].filter(Boolean).join(' '));
    else if (q.type === 'number' || q.type === 'scale') {
      const n = numberFromSpeech(t);
      if (n === null || (q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) return setNote(`No encontré un número válido${q.min !== undefined ? ` (de ${q.min} a ${q.max})` : ''}. Corrige el texto o elige con los botones.`);
      set(n);
    } else {
      const ids = optionsFromSpeech(q, t);
      if (!ids.length) return setNote('No reconocí ninguna de las opciones. Corrige el texto o toca la tuya.');
      set(q.type === 'multi' ? [...new Set([...((v as string[] | null) ?? []), ...ids])] : ids[0]);
    }
    setHeard(null);
    setNote('');
  };

  return (
    <div className="mt-6 space-y-2">
      {heard !== null ? (
        <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-red-400/30">
          <p className="text-xs font-semibold text-zinc-300">🎙️ Esto escuché. Corrígelo si hace falta:</p>
          <textarea value={heard} onChange={(e) => setHeard(e.target.value)} rows={2} aria-label="Lo que escuché" className="w-full resize-none rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60" />
          {note && <p className="text-xs text-amber-300">{note}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={apply} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Check className="h-3.5 w-3.5" /> Usar esta respuesta</button>
            <button type="button" onClick={() => { setHeard(null); setNote(''); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]">Descartar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => { if (mic.state === 'listening') mic.stop(); else { onListen(); mic.start(); } }}
            aria-pressed={mic.state === 'listening'}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${mic.state === 'listening' ? 'bg-red-500 text-[#fff] shadow-[0_0_0_6px_rgba(239,68,68,0.18),0_0_22px_rgba(239,68,68,0.5)]' : 'bg-white/[0.07] text-zinc-100 ring-1 ring-white/15 hover:bg-white/[0.12]'}`}
          >
            <Mic className="h-4 w-4" /> {mic.state === 'listening' ? 'Escuchando… toca para terminar' : 'Responder hablando'}
          </button>
          {mic.state === 'listening' && <p className="min-h-[1.25rem] text-center text-sm italic text-zinc-300">{mic.interim || '…'}</p>}
          {mic.state === 'denied' && <p className="text-center text-xs text-amber-300">Sin permiso para el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentar.</p>}
          {mic.state === 'error' && <p className="text-center text-xs text-amber-300">No pude escuchar en este dispositivo. Responde tocando o escribiendo.</p>}
        </div>
      )}
    </div>
  );
};

/* ── Resultados (con datos de prueba mientras las preguntas sean provisionales) ───────── */

const Results: React.FC<{ api: AssessmentApi; onBack: () => void; onEdit: (l: Level, i: number) => void; onClose: () => void }> = ({ api, onBack, onEdit, onClose }) => {
  const confirm = useConfirm();
  const rows = useMemo(() => {
    const out: { section: Section; q: Question; level: Level; i: number; v: Answer | undefined }[] = [];
    const all = allAnswers(api.state);
    for (const level of ['basica', 'intermedia', 'avanzada'] as Level[]) visibleQuestions(level, all).forEach((q, i) => out.push({ section: q.section, q, level, i, v: all[q.id] }));
    return out;
  }, [api.state]);
  const sections = (Object.keys(SECTION_LABEL) as Section[]).filter((s) => rows.some((r) => r.section === s && isAnswered(r.v)));
  return (
    <>
      <div className={`theme-fixed relative ${grad} px-5 py-5`}>
        <button type="button" aria-label="Volver" onClick={onBack} className="absolute left-3 top-3 rounded-lg bg-black/30 p-1.5 text-[#fff] hover:bg-black/45"><ArrowLeft className="h-4 w-4" /></button>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute right-3 top-3 rounded-lg bg-black/30 p-1.5 text-[#fff] hover:bg-black/45"><X className="h-4 w-4" /></button>
        <p className="mt-6 font-display text-2xl font-semibold text-[#fff]">📊 Tu perfil {api.state.avanzada.done_at || api.state.intermedia.done_at ? 'deportivo' : 'básico'}</p>
        <p className="mt-1 text-sm text-[#fee2e2]">Lo que nos contaste. Toca ✏️ para cambiar algo cuando cambien tus circunstancias.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-400 ring-1 ring-white/10">Solo lo que tú respondiste: nada se completa ni se adivina. Es la base para los siguientes niveles.</p>
        {sections.map((s) => (
          <section key={s} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <p className="mb-2 text-sm font-semibold text-white">{SECTION_LABEL[s]}</p>
            <ul className="space-y-1.5">
              {rows.filter((r) => r.section === s && isAnswered(r.v)).map((r) => (
                <li key={r.q.id} className="flex items-start gap-2 text-sm">
                  <span className="min-w-0 flex-1 text-zinc-400">{r.q.title}{isTrial(r.level) && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-px text-[9px] font-bold text-amber-200">🧪 EXPERIMENTAL</span>}<span className="block whitespace-pre-line font-semibold text-zinc-100">{answerLabel(r.q, r.v)}</span></span>
                  <button type="button" aria-label={`Cambiar: ${r.q.title}`} onClick={() => onEdit(r.level, r.i)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-200"><Pencil className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-2xl border border-dashed border-white/15 p-4">
          <p className="text-sm font-semibold text-white">✨ Recomendaciones personalizadas</p>
          <p className="mt-1 text-xs text-zinc-400">Aquí aparecerán cuando completemos las siguientes etapas. Con el nivel básico todavía no se arma ninguna rutina.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {['Tu semana ideal', 'Tus ejercicios clave'].map((t) => (
              <div key={t} className="rounded-xl bg-white/[0.03] p-3 opacity-60 ring-1 ring-white/10">
                <span className="rounded-full bg-white/10 px-2 py-px text-[10px] font-bold text-zinc-300">EJEMPLO</span>
                <p className="mt-1.5 text-sm font-semibold text-zinc-200">{t}</p>
                <p className="text-[11px] text-zinc-500">Próximamente</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-center gap-4 pt-1">
          {(['basica', 'intermedia', 'avanzada'] as Level[]).filter((l) => Object.keys(api.state[l].answers).length).map((l) => (
            <button key={l} type="button" onClick={async () => { if (await confirm({ title: `¿Borrar tus respuestas de la ${LEVEL_LABEL[l].toLowerCase()}?`, message: 'Empiezas de nuevo desde la primera pregunta.', confirmLabel: 'Borrar', tone: 'danger' })) { api.reset(l); onBack(); } }} className="text-[11px] font-semibold text-zinc-500 hover:text-rose-300">Rehacer {LEVEL_LABEL[l].replace('Evaluación ', '')}</button>
          ))}
        </div>
      </div>
    </>
  );
};
