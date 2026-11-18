'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Link2, MessageCircle, Play, Plus, Send, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';
import { useDb } from '@/components/organiza/db';
import { MicButton } from '@/components/organiza/DayAdjust';
import { useAssessment } from '@/components/organiza/assessmentData';
import { profileOf } from '@/components/organiza/Goals';
import { TrainMode } from '@/components/organiza/WorkoutFocus';
import { compare, comparisonText, type Checkin, type Comparison } from '@/components/organiza/experimentData';
import { estimateMinutes } from '@/components/organiza/planData';
import { isoDay, muscleLabel, type Routine, type RoutineExercise, type WorkoutApi } from '@/components/organiza/workoutData';

/**
 * 🧪 Entrenamientos experimentales (MODIFICACIÓN 07, 2026-11-18). Conversas con la IA (nube
 * /api/organiza/workout-experiment): entiende la propuesta y su procedencia, pregunta qué buscas, revisa compatibilidad
 * con tu perfil, adapta y arma un plan APARTE (organiza_experiments, SQL 53). Lo pruebas X semanas en el Focus
 * (entrenos marcados con experiment_id), anotas sensaciones y cómo amaneciste, la app compara con tu habitual
 * (experimentData.compare) y la IA recomienda. Tu planner principal nunca cambia solo: incorporar = rutina NUEVA con permiso.
 */

type Msg = { role: 'user' | 'assistant'; text: string };
type Claim = { text: string; kind: 'evidencia' | 'opinion' | 'recomendacion_personal' | 'sin_fuente'; source: string };
type Plan = { title: string; weeks: number; sessions_per_week: number; notes: string; adaptations: string[]; exercises: { name: string; muscles: string[]; sets: number; reps: string; rest: number; key: boolean }[] };
type Verdict = { decision?: 'incorporar' | 'modificar' | 'descartar' | 'seguir_probando'; why?: string; changes?: string[]; cautions?: string; at?: string; final?: string };
export type Experiment = {
  id: string; title: string; origin: string; goal: string; status: 'borrador' | 'en_prueba' | 'terminado' | 'incorporado' | 'descartado';
  weeks: number | null; started_at: string | null; ends_at: string | null; chat: Msg[];
  analysis: { compatibility?: { level: 'ok' | 'cuidado' | 'no'; text: string }[]; claims?: Claim[]; links?: string[]; pasted?: string; sources_read?: { link: string; ok: boolean }[] };
  routine: Partial<Plan>; checkins: Checkin[]; verdict: Verdict; created_at?: string;
};

const KIND_LABEL: Record<Claim['kind'], { t: string; c: string }> = {
  evidencia: { t: '📚 Evidencia', c: 'bg-emerald-500/15 text-emerald-200' },
  opinion: { t: '💬 Opinión', c: 'bg-sky-500/15 text-sky-200' },
  recomendacion_personal: { t: '🙋 Recomendación personal', c: 'bg-violet-500/15 text-violet-200' },
  sin_fuente: { t: '❔ Sin fuente verificada', c: 'bg-white/10 text-zinc-300' },
};
const DECISION: Record<NonNullable<Verdict['decision']>, string> = { incorporar: '✅ Incorporar', modificar: '🔧 Modificar', descartar: '🗑️ Descartar', seguir_probando: '⏳ Seguir probando' };
const addDays = (d: string, n: number) => isoDay(new Date(new Date(`${d}T12:00`).getTime() + n * 86_400_000));
const field = 'w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60';

export function useExperiments() {
  const db = useDb();
  const [list, setList] = useState<Experiment[]>([]);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const rows = await db.select<Experiment>('organiza_experiments').catch(() => []);
    setList(rows.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1)));
    setReady(true);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);
  const create = useCallback(async (p: Partial<Experiment>) => {
    const [made] = await db.insert<Experiment>('organiza_experiments', { title: 'Experimento', status: 'borrador', chat: [], analysis: {}, routine: {}, checkins: [], verdict: {}, ...p });
    if (made) setList((l) => [made, ...l]);
    return made ?? null;
  }, [db]);
  const patch = useCallback(async (id: string, p: Partial<Experiment>) => {
    setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_experiments', { id }, { ...p, updated_at: new Date().toISOString() });
  }, [db]);
  const remove = useCallback(async (id: string) => {
    setList((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_experiments', { id });
  }, [db]);
  return { list, ready, create, patch, remove, reload: load };
}
type ExpApi = ReturnType<typeof useExperiments>;

/** El plan como rutina para el Focus (no se guarda en tus rutinas). */
const routineOf = (e: Experiment): Routine => {
  const exercises: RoutineExercise[] = (e.routine.exercises ?? []).map((x, i) => ({ id: `${e.id.slice(0, 6)}-${i}`, name: x.name, muscles: x.muscles as RoutineExercise['muscles'], key: x.key, sets: x.sets, reps: x.reps, rest: x.rest, weight: null }));
  const full = estimateMinutes(exercises);
  return { id: `exp-${e.id}`, code: '', title: `🧪 ${e.routine.title || e.title}`, emoji: '🧪', cover_url: null, kind: 'fuerza', core: false, exercises, full_minutes: full, short_minutes: Math.min(full, 30), notes: e.routine.notes ?? '', sort: 0 };
};
const musclesOf = (e: Experiment) => [...new Set((e.routine.exercises ?? []).map((x) => x.muscles[0]).filter(Boolean))];

/* ── Conversación ─────────────────────────────────────────────────────────────────── */

const Chat: React.FC<{ exp: Experiment | null; api: ExpApi; prefill?: string; onStart: (e: Experiment) => void; onClose: () => void }> = ({ exp: initial, api, prefill, onStart, onClose }) => {
  const assessment = useAssessment();
  const [exp, setExp] = useState<Experiment | null>(initial);
  const [text, setText] = useState(prefill ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [link, setLink] = useState('');
  const [links, setLinks] = useState<string[]>(initial?.analysis.links ?? []);
  const [pasted, setPasted] = useState(initial?.analysis.pasted ?? '');
  const end = useRef<HTMLDivElement>(null);
  const chat = exp?.chat ?? [];
  // Con llaves: en Chrome nuevo scrollIntoView devuelve una promesa, y un efecto solo puede devolver su limpieza.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'end' });
  }, [chat.length, busy]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr('');
    let cur = exp;
    if (!cur) {
      cur = await api.create({ title: t.slice(0, 60) });
      if (!cur) {
        setErr('No pude guardar la conversación. Revisa tu conexión.');
        setBusy(false);
        return;
      }
    }
    const next: Msg[] = [...cur.chat, { role: 'user', text: t }];
    setExp({ ...cur, chat: next });
    setText('');
    try {
      const profile = Object.entries(profileOf(assessment.state)).map(([k, v]) => `${k}: ${v}`).join(' · ');
      const res = await authFetch(cloudAI('/api/organiza/workout-experiment'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', chat: next, links, pasted, profile, app: APP.slug }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'La IA no pudo responder.');
      const updated: Experiment = {
        ...cur,
        chat: [...next, { role: 'assistant', text: j.reply }],
        origin: j.origin || cur.origin,
        goal: j.goal || cur.goal,
        title: j.plan?.title || cur.title,
        analysis: { ...cur.analysis, compatibility: j.compatibility, claims: j.claims, links, pasted, sources_read: j.sources_read },
        routine: j.plan ?? cur.routine,
        weeks: j.plan?.weeks ?? cur.weeks,
      };
      setExp(updated);
      await api.patch(cur.id, { chat: updated.chat, origin: updated.origin, goal: updated.goal, title: updated.title, analysis: updated.analysis, routine: updated.routine, weeks: updated.weeks });
    } catch (e) {
      setErr((e as Error).message);
      await api.patch(cur.id, { chat: next });
    }
    setBusy(false);
  };

  const plan = exp?.routine?.exercises?.length ? (exp.routine as Plan) : null;
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Probar algo nuevo" onClick={(e) => e.stopPropagation()} className="theme-fixed flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-[min(820px,94vh)] sm:max-w-2xl sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <FlaskConical className="h-5 w-5 text-red-300" />
            <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-white">{exp?.title && exp.chat.length ? exp.title : 'Probar algo nuevo'}</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!chat.length && (
              <div className="rounded-2xl bg-white/[0.04] p-4 text-sm text-zinc-300 ring-1 ring-white/10">
                <p className="font-semibold text-white">Cuéntame qué quieres probar 🧪</p>
                <p className="mt-1">Por ejemplo: «Quiero probar una rutina diferente para tríceps que me recomendaron». Dime de dónde viene (un amigo, un video, tu entrenador) y, si tienes, agrega la fuente.</p>
                <p className="mt-2 text-[11px] text-zinc-500">Lo que armemos es una prueba aparte: tu planner no cambia.</p>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'bg-red-500 text-[#fff]' : 'bg-white/[0.06] text-zinc-100 ring-1 ring-white/10'}`}>{m.text}</p>
              </div>
            ))}
            {busy && <p className="text-xs text-zinc-500">Pensando…</p>}
            {err && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">{err}</p>}

            {exp && (exp.origin || exp.goal || exp.analysis.compatibility?.length || exp.analysis.claims?.length) ? (
              <div className="space-y-2 rounded-2xl bg-white/[0.03] p-3 text-xs ring-1 ring-white/10">
                {exp.origin && <p className="text-zinc-300"><b className="text-zinc-100">De dónde viene:</b> {exp.origin}</p>}
                {exp.goal && <p className="text-zinc-300"><b className="text-zinc-100">Lo que buscas:</b> {exp.goal}</p>}
                {!!exp.analysis.compatibility?.length && <ul className="space-y-1">{exp.analysis.compatibility.map((c, i) => <li key={i} className="text-zinc-300">{c.level === 'ok' ? '✅' : c.level === 'cuidado' ? '⚠️' : '⛔'} {c.text}</li>)}</ul>}
                {!!exp.analysis.claims?.length && (
                  <div>
                    <p className="mb-1 font-semibold text-zinc-100">Qué tan respaldado está</p>
                    <ul className="space-y-1">{exp.analysis.claims.map((c, i) => <li key={i} className="text-zinc-300"><span className={`mr-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${KIND_LABEL[c.kind]?.c ?? ''}`}>{KIND_LABEL[c.kind]?.t ?? c.kind}</span>{c.text}{c.source && <span className="text-zinc-500"> · {c.source}</span>}</li>)}</ul>
                  </div>
                )}
                {exp.analysis.sources_read?.some((x) => !x.ok) && <p className="text-amber-300">No pude leer: {exp.analysis.sources_read.filter((x) => !x.ok).map((x) => x.link).join(', ')} (videos o páginas con sesión). Pega el texto si quieres que lo considere.</p>}
              </div>
            ) : null}

            {plan && (
              <div className="space-y-2 rounded-2xl bg-red-500/[0.06] p-3 ring-1 ring-red-400/30">
                <p className="font-semibold text-white">🧪 Plan experimental: {plan.title}</p>
                <p className="text-xs text-zinc-300">{plan.weeks} semanas · {plan.sessions_per_week} {plan.sessions_per_week === 1 ? 'vez' : 'veces'} por semana · ~{estimateMinutes(plan.exercises)} min</p>
                <ul className="space-y-1 text-xs">{plan.exercises.map((x, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-1.5"><span className="text-zinc-100">{x.key ? '⭐ ' : ''}{x.name} <span className="text-zinc-500">· {x.muscles.map(muscleLabel).join(', ')}</span></span><span className="tabular-nums text-zinc-300">{x.sets} × {x.reps}</span></li>)}</ul>
                {!!plan.adaptations?.length && <div className="text-xs text-zinc-300"><b className="text-zinc-100">Lo que adapté:</b><ul className="ml-4 list-disc">{plan.adaptations.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
                {plan.notes && <p className="text-xs text-zinc-400">{plan.notes}</p>}
                {exp?.status === 'borrador' && <button type="button" onClick={() => exp && onStart(exp)} className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-bold text-[#fff] hover:bg-red-400">Empezar la prueba ({plan.weeks} semanas)</button>}
                <p className="text-[11px] text-zinc-500">Es una prueba aparte: tu planner principal sigue igual. Puedes seguir conversando para ajustarlo.</p>
              </div>
            )}
            <div ref={end} />
          </div>

          <div className="space-y-2 border-t border-white/10 p-3">
            {sourcesOpen && (
              <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                <p className="text-xs text-zinc-400">Fuentes (opcional): un link a un artículo o el texto de la recomendación. Los videos no se pueden leer: pega lo que dice.</p>
                <div className="flex gap-2"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={field} /><button type="button" onClick={() => { if (/^https:\/\//.test(link.trim())) { setLinks((l) => [...new Set([...l, link.trim()])].slice(0, 3)); setLink(''); } }} className="rounded-xl bg-white/[0.08] px-3 text-xs font-semibold text-white">Agregar</button></div>
                {links.map((l) => <p key={l} className="flex items-center gap-2 text-[11px] text-zinc-300"><Link2 className="h-3 w-3" /><span className="min-w-0 flex-1 truncate">{l}</span><button type="button" onClick={() => setLinks((x) => x.filter((y) => y !== l))} className="text-zinc-500 hover:text-rose-300"><X className="h-3 w-3" /></button></p>)}
                <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} placeholder="O pega aquí el texto (lo que dice el video, el mensaje de tu amigo…)" className={`${field} resize-none`} />
              </div>
            )}
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => setSourcesOpen((o) => !o)} aria-label="Fuentes" data-help="Agregar fuentes" className={`rounded-xl p-2.5 ring-1 ring-white/10 ${sourcesOpen || links.length || pasted ? 'bg-white/[0.1] text-white' : 'text-zinc-400 hover:bg-white/[0.06]'}`}><Link2 className="h-4 w-4" /></button>
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Escribe o dicta…" aria-label="Mensaje" className={`${field} max-h-32 min-h-[42px] flex-1 resize-none`} />
              <MicButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} className="p-2.5" />
              <button type="button" disabled={busy || !text.trim()} onClick={send} aria-label="Enviar" className="rounded-xl bg-red-500 p-2.5 text-[#fff] hover:bg-red-400 disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Sensaciones después de un entreno del experimento ────────────────────────────── */

const CheckinModal: React.FC<{ onSave: (c: Omit<Checkin, 'day' | 'log_id' | 'soreness_next'>) => void; onSkip: () => void }> = ({ onSave, onSkip }) => {
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [pain, setPain] = useState<Checkin['pain']>('no');
  const [notes, setNotes] = useState('');
  const row = (label: string, v: number | null, set: (n: number) => void, opts: string[]) => (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-white">{label}</p>
      <div className="grid grid-cols-5 gap-1.5">{opts.map((o, i) => <button key={i} type="button" onClick={() => set(i + 1)} className={`rounded-xl py-2 text-lg ring-1 ${v === i + 1 ? 'bg-red-500 ring-red-400' : 'ring-white/15 hover:bg-white/[0.06]'}`}>{o}</button>)}</div>
    </div>
  );
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-3 sm:items-center">
        <div role="dialog" aria-label="Sensaciones del experimento" className="theme-fixed w-full max-w-md space-y-4 rounded-3xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <p className="font-display text-lg font-semibold text-white">🧪 ¿Cómo se sintió el experimento?</p>
          {row('¿Lo disfrutaste?', enjoyment, setEnjoyment, ['😖', '😕', '😐', '🙂', '🤩'])}
          {row('¿Qué tan exigente fue?', effort, setEffort, ['🍃', '🙂', '💪', '🔥', '🥵'])}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">¿Molestias o dolor?</p>
            <div className="grid grid-cols-3 gap-1.5">{([['no', 'No'], ['molestia', 'Molestia'], ['dolor', 'Dolor']] as [Checkin['pain'], string][]).map(([v, l]) => <button key={v} type="button" onClick={() => setPain(v)} className={`rounded-xl py-2 text-sm font-semibold ring-1 ${pain === v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{l}</button>)}</div>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="¿Algo que notaste? (bombeo, técnica, una máquina…)" className={`${field} resize-none`} />
          <div className="flex gap-2">
            <button type="button" onClick={() => onSave({ enjoyment, effort, pain, notes: notes.trim() })} className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-[#fff]">Guardar</button>
            <button type="button" onClick={onSkip} className="rounded-xl px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]">Ahora no</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Comparar y decidir ───────────────────────────────────────────────────────────── */

const Decide: React.FC<{ e: Experiment; workout: WorkoutApi; api: ExpApi; onChat: (msg: string) => void; onClose: () => void }> = ({ e, workout, api, onChat, onClose }) => {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [v, setV] = useState<Verdict>(e.verdict ?? {});
  const muscles = musclesOf(e);
  const c: Comparison = useMemo(() => compare({ logs: workout.logs, experimentId: e.id, muscles, started: e.started_at ?? isoDay(), ends: e.ends_at, today: isoDay(), checkins: e.checkins ?? [] }), [workout.logs, e, muscles]);
  const ask = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await authFetch(cloudAI('/api/organiza/workout-experiment'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'evaluate', title: e.title, goal: e.goal, comparison: comparisonText(c, muscleLabel), checkins: (e.checkins ?? []).map((x) => `${x.day}: disfrute ${x.enjoyment ?? '-'}/5, exigencia ${x.effort ?? '-'}/5, ${x.pain}${x.soreness_next != null ? `, agujetas al día siguiente ${x.soreness_next}/3` : ''}${x.notes ? `, «${x.notes}»` : ''}`).join('\n'), app: APP.slug }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No pude evaluar.');
      const nv = { ...j, at: new Date().toISOString() };
      setV(nv);
      await api.patch(e.id, { verdict: nv });
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  };
  const incorporate = async () => {
    if (!(await confirm({ title: `¿Guardar «${e.routine.title || e.title}» en tus rutinas?`, message: 'Se crea como rutina NUEVA. Tu semana no cambia: la pones en un día cuando quieras.', confirmLabel: 'Guardar rutina' }))) return;
    const r = routineOf(e);
    const made = await workout.addRoutine({ title: e.routine.title || e.title, emoji: '🧪', kind: 'fuerza', core: false, code: '', exercises: r.exercises.map((x) => ({ ...x, id: Math.random().toString(36).slice(2, 9) })), full_minutes: r.full_minutes, short_minutes: r.short_minutes, notes: `Nació de un experimento (${e.started_at} → ${e.ends_at}).` });
    if (made) {
      await api.patch(e.id, { status: 'incorporado', verdict: { ...v, final: 'incorporado' } });
      onClose();
    }
  };
  const row = (label: string, a: string | number | null, b: string | number | null) => (
    <tr className="border-t border-white/5"><td className="py-1.5 text-zinc-400">{label}</td><td className="py-1.5 text-right tabular-nums text-zinc-100">{a ?? '—'}</td><td className="py-1.5 text-right tabular-nums text-zinc-400">{b ?? '—'}</td></tr>
  );
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Comparar y decidir" onClick={(x) => x.stopPropagation()} className="theme-fixed flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-xl sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="flex-1 font-display text-lg font-semibold text-white">⚖️ {e.title}: ¿y?</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <p className="text-xs text-zinc-400">{muscles.map(muscleLabel).join(', ')} · experimento {c.trial.from} → {c.trial.to} vs tu habitual {c.habitual.from} → {c.habitual.to}</p>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-zinc-500"><th className="text-left font-normal" /><th className="text-right font-normal">🧪 Experimento</th><th className="text-right font-normal">Habitual</th></tr></thead>
              <tbody>
                {row('Sesiones', c.exp.sessions, c.hab.sessions)}
                {row('Series por semana', c.exp.setsPerWeek, c.hab.setsPerWeek)}
                {row('Volumen por semana (kg)', c.exp.volumePerWeek.toLocaleString('es-CL'), c.hab.volumePerWeek.toLocaleString('es-CL'))}
                {row('Mejor carga', c.exp.best ? `${c.exp.best.weight} kg × ${c.exp.best.reps ?? '—'}` : null, c.hab.best ? `${c.hab.best.weight} kg × ${c.hab.best.reps ?? '—'}` : null)}
                {row('Reps en reserva (prom.)', c.exp.avgRir, c.hab.avgRir)}
                {row('Exigencia (1 fácil – 3 duro)', c.exp.feel, c.hab.feel)}
                {row('Disfrute (1–5)', c.exp.enjoyment, null)}
                {row('Agujetas al día siguiente (0–3)', c.exp.sorenessNext, null)}
                {row('Sesiones con molestia o dolor', c.exp.painSessions, null)}
              </tbody>
            </table>
            {c.exp.best && c.hab.best && c.exp.best.name !== c.hab.best.name && <p className="text-[11px] text-zinc-500">Ojo: las mejores cargas son de ejercicios distintos ({c.exp.best.name} vs {c.hab.best.name}); no se comparan directamente.</p>}
            {c.notes.map((n, i) => <p key={i} className="text-xs text-amber-200">• {n}</p>)}

            {v.decision ? (
              <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">🤖 {DECISION[v.decision]}</p>
                <p className="text-sm text-zinc-300">{v.why}</p>
                {!!v.changes?.length && <ul className="ml-4 list-disc text-xs text-zinc-300">{v.changes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                {v.cautions && <p className="text-xs text-amber-200">⚠️ {v.cautions}</p>}
                <p className="text-[11px] text-zinc-500">Es una recomendación con tus números. Tú decides.</p>
              </div>
            ) : null}
            {err && <p className="text-xs text-amber-300">{err}</p>}
            <button type="button" disabled={busy} onClick={ask} className="w-full rounded-xl bg-white/[0.08] py-2.5 text-sm font-bold text-white hover:bg-white/[0.14] disabled:opacity-50">{busy ? 'Analizando…' : v.decision ? 'Pedir otra recomendación' : '🤖 Pedir recomendación a la IA'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={incorporate} className="rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-[#09090b]">✅ Incorporar</button>
              <button type="button" onClick={() => { onClose(); onChat(`Quiero modificar el experimento.${v.changes?.length ? ` La recomendación fue: ${v.changes.join('; ')}.` : ''}`); }} className="rounded-xl bg-white/[0.08] py-2.5 text-sm font-bold text-white">🔧 Modificar</button>
              <button type="button" onClick={async () => { await api.patch(e.id, { ends_at: addDays(e.ends_at ?? isoDay(), 14) }); onClose(); }} className="rounded-xl bg-white/[0.08] py-2.5 text-sm font-bold text-white">⏳ 2 semanas más</button>
              <button type="button" onClick={async () => { if (await confirm({ title: '¿Descartar el experimento?', message: 'Queda en tu historial. Tus entrenos anotados no se borran.', confirmLabel: 'Descartar' })) { await api.patch(e.id, { status: 'descartado', verdict: { ...v, final: 'descartado' } }); onClose(); } }} className="rounded-xl bg-white/[0.08] py-2.5 text-sm font-bold text-zinc-300">🗑️ Descartar</button>
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Bloque en Workout Pro ────────────────────────────────────────────────────────── */

export const ExperimentsBlock: React.FC<{ workout: WorkoutApi }> = ({ workout }) => {
  const api = useExperiments();
  const confirm = useConfirm();
  const [chat, setChat] = useState<{ e: Experiment | null; prefill?: string } | null>(null);
  const [train, setTrain] = useState<Experiment | null>(null);
  const [checkin, setCheckin] = useState<{ e: Experiment; logId: string | null } | null>(null);
  const [decide, setDecide] = useState<Experiment | null>(null);
  const [past, setPast] = useState(false);
  const today = isoDay();
  const active = api.list.filter((e) => e.status === 'borrador' || e.status === 'en_prueba');
  const done = api.list.filter((e) => !active.includes(e));

  const start = async (e: Experiment) => {
    const weeks = e.routine.weeks ?? e.weeks ?? 4;
    await api.patch(e.id, { status: 'en_prueba', started_at: today, ends_at: addDays(today, weeks * 7 - 1), weeks });
    setChat(null);
  };

  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-semibold text-white">🧪 Experimentos</h2>
        <button type="button" onClick={() => setChat({ e: null })} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Plus className="h-3.5 w-3.5" /> Probar algo nuevo</button>
      </div>
      {!api.ready ? <p className="text-sm text-zinc-500">Cargando…</p> : !active.length ? (
        <p className="text-sm text-zinc-500">¿Te recomendaron una rutina distinta? Conversa con la IA, pruébala unas semanas aparte y compárala con lo tuyo. Tu planner no cambia.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((e) => {
            const sessions = workout.logs.filter((l) => l.experiment_id === e.id);
            const day = e.started_at ? Math.max(1, Math.round((new Date(`${today}T12:00`).getTime() - new Date(`${e.started_at}T12:00`).getTime()) / 86_400_000) + 1) : 0;
            const total = e.started_at && e.ends_at ? Math.round((new Date(`${e.ends_at}T12:00`).getTime() - new Date(`${e.started_at}T12:00`).getTime()) / 86_400_000) + 1 : 0;
            const over = e.ends_at ? today > e.ends_at : false;
            const lastSession = sessions[0];
            const pendingNext = lastSession && lastSession.day < today && e.checkins.some((c) => c.log_id === lastSession.id && c.soreness_next === null);
            return (
              <li key={e.id} className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                <div className="flex items-start gap-2">
                  <span className="text-xl">🧪</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{e.title}</p>
                    <p className="text-[11px] text-zinc-400">{e.status === 'borrador' ? 'Conversando · aún no empieza' : `${over ? 'Período terminado' : `Día ${Math.min(day, total)} de ${total}`} · ${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}`}{e.goal ? ` · busca: ${e.goal}` : ''}</p>
                  </div>
                  <button type="button" aria-label="Borrar" onClick={async () => { if (await confirm({ title: `¿Borrar «${e.title}»?`, message: 'Se borra la conversación y el plan. Tus entrenos anotados se quedan.', confirmLabel: 'Borrar', tone: 'danger' })) api.remove(e.id); }} className="rounded-lg p-1 text-zinc-600 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {e.status === 'en_prueba' && total > 0 && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, (day / total) * 100)}%` }} /></span>}
                {pendingNext && (
                  <div className="mt-2 rounded-xl bg-white/[0.04] p-2.5 text-xs text-zinc-300">
                    <p>¿Cómo amaneciste después del experimento del {new Date(`${lastSession.day}T12:00`).toLocaleDateString('es-CL', { weekday: 'long' })}? (agujetas)</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5">{['Nada', 'Poco', 'Medio', 'Mucho'].map((l, i) => <button key={l} type="button" onClick={() => api.patch(e.id, { checkins: e.checkins.map((c) => (c.log_id === lastSession.id ? { ...c, soreness_next: i } : c)) })} className="rounded-lg py-1.5 font-semibold ring-1 ring-white/15 hover:bg-white/[0.06]">{l}</button>)}</div>
                  </div>
                )}
                {over && e.status === 'en_prueba' && <p className="mt-2 text-xs text-amber-200">🏁 Terminó el período de prueba: compáralo y decide.</p>}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {e.status === 'en_prueba' && <button type="button" onClick={() => setTrain(e)} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Play className="h-3.5 w-3.5" /> Entrenar experimento</button>}
                  <button type="button" onClick={() => setChat({ e })} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]"><MessageCircle className="h-3.5 w-3.5" /> {e.status === 'borrador' ? 'Seguir conversando' : 'Conversar'}</button>
                  {e.status === 'en_prueba' && <button type="button" onClick={() => setDecide(e)} className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">⚖️ Comparar y decidir</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setPast((p) => !p)} className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">{past ? '▾' : '▸'} Historial ({done.length})</button>
          {past && <ul className="mt-1.5 space-y-1">{done.map((e) => <li key={e.id} className="flex items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-1.5 text-xs ring-1 ring-white/5"><span>{e.status === 'incorporado' ? '✅' : '🗑️'}</span><span className="min-w-0 flex-1 truncate text-zinc-300">{e.title}</span><span className="text-zinc-500">{e.status}</span></li>)}</ul>}
        </div>
      )}

      {chat && <Chat key={chat.e?.id ?? 'nuevo'} exp={chat.e ? api.list.find((x) => x.id === chat.e!.id) ?? chat.e : null} api={api} prefill={chat.prefill} onStart={start} onClose={() => setChat(null)} />}
      {train && <TrainMode r={routineOf(train)} version="completa" api={workout} experimentId={train.id} onClose={() => setTrain(null)} onSaved={(logId) => setCheckin({ e: train, logId })} />}
      {checkin && (
        <CheckinModal
          onSkip={() => setCheckin(null)}
          onSave={async (c) => {
            const e = api.list.find((x) => x.id === checkin.e.id) ?? checkin.e;
            await api.patch(e.id, { checkins: [...(e.checkins ?? []), { ...c, day: today, log_id: checkin.logId, soreness_next: null }] });
            setCheckin(null);
          }}
        />
      )}
      {decide && <Decide e={api.list.find((x) => x.id === decide.id) ?? decide} workout={workout} api={api} onChat={(msg) => setChat({ e: decide, prefill: msg })} onClose={() => setDecide(null)} />}
    </section>
  );
};
