'use client';

import React, { useMemo, useState } from 'react';
import { Check, Pause, Pencil, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';
import { MUSCLES, type WorkoutApi, type WorkoutLog } from '@/components/organiza/workoutData';
import { METRICS, useBodyLogs, type BodyLog } from '@/components/organiza/bodyData';
import { allAnswers, answerLabel, QUESTIONS, useAssessment } from '@/components/organiza/assessmentData';
import { exercises } from '@/components/organiza/progressData';
import {
  aiContext, currentValue, GOAL_TYPES, METRIC_KINDS, metricLabel, progressOf, unitOf, useGoals,
  type Direction, type Goal, type GoalMetric, type GoalsApi, type GoalType, type MetricKind,
} from '@/components/organiza/goalsData';

/**
 * 🎯 Objetivos inteligentes (MODIFICACIÓN 04, 2026-11-18). La IA propone (nube), tú decides: aceptar, modificar,
 * rechazar, pausar, reanudar o completar. El progreso se mide con tus datos (goalsData.currentValue). Nunca cambia
 * tu rutina. Al llegar a la meta o a la fecha de revisión, te pregunta qué hacer (nada se ajusta solo).
 */

const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${String(+v.toFixed(1)).replace('.', ',')}${unit ? ` ${unit}` : ''}`);
const day = (s: string | null) => (s ? new Date(`${s}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '');
const field = 'w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60';
const typeOf = (t: GoalType) => GOAL_TYPES.find((x) => x.id === t) ?? GOAL_TYPES[0];
const today = () => new Date().toISOString().slice(0, 10);

/** Las respuestas de la evaluación que le sirven a la IA (en palabras). */
export function profileOf(state: ReturnType<typeof useAssessment>['state']): Record<string, string> {
  const all = allAnswers(state);
  const pick = ['objetivo', 'objetivo_otro', 'experiencia', 'lugar', 'equipo_casa', 'equipo_gimnasio', 'equipo_aire_libre', 'equipo_extra', 'equipo_detalle', 'dias', 'duracion', 'prioridades', 'molestias_detalle', 'intensidad', 'progresion', 'recuperacion', 'poco_tiempo', 'ejercicios_evitar'];
  return Object.fromEntries(pick.map((id) => {
    const q = QUESTIONS.find((x) => x.id === id);
    return [q?.title ?? id, q && all[id] !== undefined ? answerLabel(q, all[id]) : ''];
  }).filter(([, v]) => v && v !== '—'));
}

/* ── Tarjeta de un objetivo ───────────────────────────────────────────────────────── */

const GoalCard: React.FC<{ g: Goal; logs: WorkoutLog[]; body: BodyLog[]; api: GoalsApi; onEdit: (g: Goal) => void; compact?: boolean }> = ({ g, logs, body, api, onEdit, compact }) => {
  const confirm = useConfirm();
  const cur = currentValue(g.metric, logs, body);
  const unit = g.unit || unitOf(g.metric);
  const pr = progressOf(g, cur.value);
  const t = typeOf(g.type);
  const review = g.status === 'activo' && g.review_at && g.review_at <= today();
  const [open, setOpen] = useState(g.status === 'propuesto');
  return (
    <li className={`rounded-2xl p-3 ring-1 ${g.status === 'propuesto' ? 'bg-red-500/[0.06] ring-red-400/30' : g.status === 'pausado' ? 'bg-white/[0.02] ring-white/10 opacity-80' : 'bg-white/[0.04] ring-white/10'}`}>
      <div className="flex items-start gap-2">
        <span className="text-xl">{t.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{g.title}{g.source === 'ia' && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-px align-middle text-[9px] font-bold text-zinc-300">IA</span>}{g.status === 'pausado' && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-px align-middle text-[9px] font-bold text-amber-200">PAUSADO</span>}</p>
          <p className="text-xs text-zinc-400">{g.outcome}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-zinc-400">{metricLabel(g.metric)}</span>
          <span className="shrink-0 tabular-nums text-zinc-200"><b className="text-white">{fmt(cur.value, unit)}</b> → {g.metric.direction === 'keep' ? 'mantener ' : ''}{fmt(g.target, unit)}</span>
        </div>
        {g.status !== 'propuesto' && pr.pct !== null && (
          <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-white/10"><span className={`block h-full rounded-full transition-all ${pr.reached ? 'bg-emerald-400' : 'bg-red-500'}`} style={{ width: `${pr.pct}%` }} /></span>
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          {g.status === 'propuesto' ? `Hoy: ${fmt(cur.value, unit)} · ${cur.note}` : `${pr.text} Partiste en ${fmt(g.baseline, unit)}${g.started_at ? ` (${day(g.started_at)})` : ''}. ${cur.note}`}
          {g.period_weeks ? ` · Revisión estimada: ${g.review_at ? day(g.review_at) : `en ~${g.period_weeks} semanas`}` : ''}
        </p>
      </div>

      {g.status === 'activo' && pr.reached && <p className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">🎉 Llegaste a la meta. ¿La das por completada o la subimos? (Tú decides.)</p>}
      {review && !pr.reached && <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-400/30">📆 Llegó la fecha de revisión. Mira tu avance real: puedes seguir, ajustar la meta o pausarla.</p>}

      {!compact && g.next_action && <p className="mt-2 text-xs text-zinc-300">👉 <b>Próxima acción:</b> {g.next_action}</p>}
      {!compact && (g.why || g.how) && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300">{open ? 'Ocultar el porqué' : '¿Por qué y cómo se evalúa?'}</button>
          {open && (
            <div className="mt-1.5 space-y-1 rounded-xl bg-black/20 p-2.5 text-xs text-zinc-300">
              {g.why && <p><b className="text-zinc-100">Por qué:</b> {g.why}</p>}
              {g.how && <p><b className="text-zinc-100">Cómo se evalúa:</b> {g.how}</p>}
            </div>
          )}
        </>
      )}

      {!compact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {g.status === 'propuesto' && (
            <>
              <button type="button" onClick={() => api.accept(g, cur.value)} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Check className="h-3.5 w-3.5" /> Aceptar</button>
              <button type="button" onClick={() => onEdit(g)} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]"><Pencil className="h-3.5 w-3.5" /> Modificar</button>
              <button type="button" onClick={() => api.patch(g.id, { status: 'rechazado' }, 'Rechazado')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]">Rechazar</button>
            </>
          )}
          {g.status === 'activo' && (
            <>
              <button type="button" onClick={() => api.patch(g.id, { status: 'completado', completed_at: new Date().toISOString() }, `Completado con ${fmt(cur.value, unit)}`)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-[#09090b] hover:bg-emerald-400"><Check className="h-3.5 w-3.5" /> Completar</button>
              <button type="button" onClick={() => onEdit(g)} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]"><Pencil className="h-3.5 w-3.5" /> Modificar</button>
              <button type="button" onClick={() => api.patch(g.id, { status: 'pausado' }, 'Pausado')} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]"><Pause className="h-3.5 w-3.5" /> Pausar</button>
            </>
          )}
          {g.status === 'pausado' && <button type="button" onClick={() => api.patch(g.id, { status: 'activo' }, 'Reanudado')} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]"><Play className="h-3.5 w-3.5" /> Reanudar</button>}
          {(g.status === 'completado' || g.status === 'rechazado' || g.status === 'pausado') && (
            <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar «${g.title}»?`, confirmLabel: 'Borrar', tone: 'danger' })) api.remove(g.id); }} className="ml-auto rounded-lg p-1.5 text-zinc-600 hover:text-rose-300" aria-label="Borrar objetivo"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      )}
    </li>
  );
};

/* ── Crear / modificar ────────────────────────────────────────────────────────────── */

const Editor: React.FC<{ g: Goal | null; logs: WorkoutLog[]; body: BodyLog[]; api: GoalsApi; onClose: () => void }> = ({ g, logs, body, api, onClose }) => {
  const exNames = useMemo(() => exercises(logs).map((x) => x.name), [logs]);
  const bodyMetrics = METRICS.filter((m) => !['height', 'age'].includes(m.id));
  const [type, setType] = useState<GoalType>(g?.type ?? 'fuerza');
  const [title, setTitle] = useState(g?.title ?? '');
  const [outcome, setOutcome] = useState(g?.outcome ?? '');
  const [metric, setMetric] = useState<GoalMetric>(g?.metric ?? { kind: 'exercise_weight', exercise: exNames[0] ?? '', direction: 'up' });
  const [target, setTarget] = useState(g?.target != null ? String(g.target) : '');
  const [weeks, setWeeks] = useState(g?.period_weeks != null ? String(g.period_weeks) : '');
  const [next, setNext] = useState(g?.next_action ?? '');
  const [busy, setBusy] = useState(false);
  const cur = currentValue(metric, logs, body);
  const unit = unitOf(metric);
  const tnum = target.trim() === '' ? null : Number(target.replace(',', '.'));
  const ok = title.trim() && tnum !== null && Number.isFinite(tnum) && (metric.kind !== 'exercise_weight' || metric.exercise) && (metric.kind !== 'muscle_sets' || metric.muscle) && (metric.kind !== 'body' || metric.body);
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const w = weeks.trim() ? Math.max(1, Math.min(52, Math.round(Number(weeks)))) : null;
    const base = { type, title: title.trim(), outcome: outcome.trim(), metric, unit, target: tnum, period_weeks: w, next_action: next.trim() };
    if (g) {
      const reviewFrom = g.started_at ? new Date(`${g.started_at}T12:00`) : new Date();
      const review_at = g.status === 'activo' && w ? new Date(reviewFrom.getTime() + w * 7 * 86_400_000).toISOString().slice(0, 10) : g.review_at;
      // Si cambia el indicador de un objetivo activo, el punto de partida pasa a ser tu valor de hoy.
      const sameMetric = JSON.stringify(g.metric) === JSON.stringify(metric);
      await api.patch(g.id, { ...base, review_at, ...(g.status === 'activo' && !sameMetric ? { baseline: cur.value, started_at: new Date().toISOString().slice(0, 10) } : {}) }, 'Modificado por ti');
    } else {
      const now = new Date();
      await api.add({ ...base, baseline: cur.value, started_at: now.toISOString().slice(0, 10), review_at: w ? new Date(now.getTime() + w * 7 * 86_400_000).toISOString().slice(0, 10) : null, status: 'activo', why: '', how: metricLabel(metric), source: 'usuario' }, 'Creado por ti');
    }
    setBusy(false);
    onClose();
  };
  const setKind = (kind: MetricKind) => setMetric({ kind, direction: kind === 'body' ? 'down' : 'up', exercise: kind === 'exercise_weight' ? exNames[0] ?? '' : undefined, muscle: kind === 'muscle_sets' ? 'pecho' : undefined, body: kind === 'body' ? 'weight' : undefined });
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[97] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-label={g ? 'Modificar objetivo' : 'Nuevo objetivo'} onClick={(e) => e.stopPropagation()} className="theme-fixed max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center"><p className="flex-1 font-display text-lg font-semibold text-white">{g ? '✏️ Modificar objetivo' : '🎯 Nuevo objetivo'}</p><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
          <label className="block text-xs text-zinc-400">Tipo<select value={type} onChange={(e) => setType(e.target.value as GoalType)} className={`${field} mt-1`}>{GOAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}</select></label>
          <label className="block text-xs text-zinc-400">Nombre<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Mejorar mi press de banca" className={`${field} mt-1`} /></label>
          <label className="block text-xs text-zinc-400">Resultado buscado<input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Ej.: Más fuerza de empuje con buena técnica" className={`${field} mt-1`} /></label>
          <div className="space-y-2 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <label className="block text-xs text-zinc-400">¿Cómo se mide?<select value={metric.kind} onChange={(e) => setKind(e.target.value as MetricKind)} className={`${field} mt-1`}>{METRIC_KINDS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            {metric.kind === 'exercise_weight' && (exNames.length ? <select value={metric.exercise} onChange={(e) => setMetric({ ...metric, exercise: e.target.value })} aria-label="Ejercicio" className={field}>{exNames.map((n) => <option key={n} value={n}>{n}</option>)}</select> : <p className="text-xs text-amber-300">Aún no hay ejercicios con peso registrados: entrena con el Focus primero.</p>)}
            {metric.kind === 'muscle_sets' && <select value={metric.muscle} onChange={(e) => setMetric({ ...metric, muscle: e.target.value })} aria-label="Músculo" className={field}>{MUSCLES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>}
            {metric.kind === 'body' && <select value={metric.body} onChange={(e) => setMetric({ ...metric, body: e.target.value })} aria-label="Medida" className={field}>{bodyMetrics.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.unit})</option>)}</select>}
            <div className="flex gap-1.5">
              {([['up', 'Subir'], ['down', 'Bajar'], ['keep', 'Mantener']] as [Direction, string][]).map(([d, l]) => <button key={d} type="button" onClick={() => setMetric({ ...metric, direction: d })} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 ${metric.direction === d ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{l}</button>)}
            </div>
            <p className="text-[11px] text-zinc-500">Hoy: <b className="text-zinc-200">{fmt(cur.value, unit)}</b> · {cur.note}</p>
            <label className="block text-xs text-zinc-400">Meta {unit && `(${unit})`}<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={cur.value !== null ? `Ej.: ${fmt(cur.value)}` : '—'} className={`${field} mt-1`} /></label>
          </div>
          <label className="block text-xs text-zinc-400">Revisar en (semanas, opcional)<input inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="Ej.: 6" className={`${field} mt-1`} /><span className="mt-0.5 block text-[10px] text-zinc-600">Es una fecha para mirar tu avance, no un plazo que cumplir.</span></label>
          <label className="block text-xs text-zinc-400">Próxima acción (opcional)<input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Ej.: anotar peso y reps en cada serie de press" className={`${field} mt-1`} /></label>
          <button type="button" disabled={!ok || busy} onClick={save} className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-40">{busy ? 'Guardando…' : g ? 'Guardar cambios' : 'Crear objetivo'}</button>
          <p className="text-center text-[11px] text-zinc-500">Un objetivo nunca cambia tu rutina.</p>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Bloque en Workout Pro ────────────────────────────────────────────────────────── */

export const GoalsBlock: React.FC<{ workout: WorkoutApi }> = ({ workout }) => {
  const api = useGoals();
  const body = useBodyLogs();
  const assessment = useAssessment();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [asking, setAsking] = useState(false);
  const [focus, setFocus] = useState<GoalType | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [past, setPast] = useState(false);
  const logs = workout.logs;
  const by = (s: Goal['status'][]) => api.goals.filter((g) => s.includes(g.status));

  const propose = async () => {
    setBusy(true);
    setErr('');
    setNote('');
    try {
      const { context, exercises: exNames } = aiContext(logs, body.logs, profileOf(assessment.state), api.goals);
      const res = await authFetch(cloudAI('/api/organiza/workout-goals'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context, exercises: exNames, focus, app: APP.slug }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No pude proponer objetivos.');
      setNote(j.note || '');
      for (const g of (j.goals ?? []) as Omit<Goal, 'id' | 'events' | 'completed_at' | 'status' | 'source' | 'baseline' | 'started_at' | 'review_at' | 'unit'>[]) {
        const cur = currentValue(g.metric, logs, body.logs);
        await api.add({ ...g, unit: unitOf(g.metric), baseline: cur.value, started_at: null, review_at: null, status: 'propuesto', source: 'ia' }, 'Propuesto por la IA');
      }
      if (!(j.goals ?? []).length) setErr('La IA no encontró objetivos medibles con tus datos actuales. Entrena con el Focus o completa tu perfil y vuelve a intentar.');
      setAsking(false);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-semibold text-white">🎯 Tus objetivos</h2>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1 rounded-xl bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.14]"><Plus className="h-3.5 w-3.5" /> Crear</button>
        <button type="button" onClick={() => setAsking((a) => !a)} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Sparkles className="h-3.5 w-3.5" /> Proponer con IA</button>
      </div>

      {asking && (
        <div className="mb-3 space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          <p className="text-xs text-zinc-300">La IA mira tus entrenos, récords, series por músculo, perfil físico y evaluación, y te propone metas medibles. Tú decides cuáles aceptar.</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFocus('')} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${!focus ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>✨ Lo que más me sirva</button>
            {GOAL_TYPES.map((t) => <button key={t.id} type="button" onClick={() => setFocus(t.id)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${focus === t.id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{t.emoji} {t.label}</button>)}
          </div>
          <button type="button" disabled={busy} onClick={propose} className="w-full rounded-xl bg-red-500 py-2 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-50">{busy ? 'Analizando tus datos…' : 'Proponer objetivos'}</button>
        </div>
      )}
      {err && <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">{err}</p>}
      {note && <p className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">🤖 {note}</p>}

      {!api.ready ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : !api.goals.length ? (
        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-zinc-400">Aún no tienes objetivos. Pide una propuesta a la IA o crea el tuyo.</p>
      ) : (
        <div className="space-y-4">
          {by(['propuesto']).length > 0 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">Propuestas para revisar</p><ul className="space-y-2">{by(['propuesto']).map((g) => <GoalCard key={g.id} g={g} logs={logs} body={body.logs} api={api} onEdit={setEditing} />)}</ul></div>}
          {by(['activo', 'pausado']).length > 0 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">En curso</p><ul className="space-y-2">{by(['activo', 'pausado']).map((g) => <GoalCard key={g.id} g={g} logs={logs} body={body.logs} api={api} onEdit={setEditing} />)}</ul></div>}
          {by(['completado', 'rechazado']).length > 0 && (
            <div>
              <button type="button" onClick={() => setPast((p) => !p)} className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">{past ? '▾' : '▸'} Historial ({by(['completado', 'rechazado']).length})</button>
              {past && <ul className="mt-1.5 space-y-1.5">{by(['completado', 'rechazado']).map((g) => (
                <li key={g.id} className="flex items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2 text-xs ring-1 ring-white/5">
                  <span>{g.status === 'completado' ? '🏁' : '✖️'}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{g.title}</span>
                  <span className="text-zinc-500">{g.status === 'completado' ? `completado ${g.completed_at ? day(g.completed_at.slice(0, 10)) : ''}` : 'rechazado'}</span>
                  <button type="button" onClick={() => api.remove(g.id)} aria-label="Borrar" className="text-zinc-600 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}</ul>}
            </div>
          )}
        </div>
      )}
      {editing && <Editor g={editing === 'new' ? null : editing} logs={logs} body={body.logs} api={api} onClose={() => setEditing(null)} />}
    </section>
  );
};

/** 🎯 Resumen para el Centro de Progreso: objetivos en curso con su avance real. */
export const GoalsSummary: React.FC<{ logs: WorkoutLog[]; body: BodyLog[] }> = ({ logs, body }) => {
  const api = useGoals();
  const active = api.goals.filter((g) => g.status === 'activo');
  if (!api.ready || !active.length) return null;
  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <h3 className="font-display text-lg font-semibold text-white">🎯 Tus objetivos en curso</h3>
      <p className="mt-0.5 text-xs text-zinc-400">Medidos con tus datos de hoy (últimas 4 semanas o tu último registro).</p>
      <ul className="mt-3 space-y-2">{active.map((g) => <GoalCard key={g.id} g={g} logs={logs} body={body} api={api} onEdit={() => {}} compact />)}</ul>
    </section>
  );
};

