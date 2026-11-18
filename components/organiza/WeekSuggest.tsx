'use client';

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';
import { WEEK } from '@/components/organiza/model';
import { allAnswers, answerLabel, QUESTIONS, useAssessment } from '@/components/organiza/assessmentData';
import { exercisesOf, minutesFor, muscleLabel, type DayPlan, type WorkoutApi } from '@/components/organiza/workoutData';
import { versionLabel, VERSIONS, type Version } from '@/components/organiza/planData';

/**
 * 🧩 Semana sugerida por IA (MOD 06, 2026-11-18). La nube (/api/organiza/workout-week) propone rutina + versión por
 * día con su porqué, usando SOLO tus rutinas. Se muestra al lado de tu semana actual y se aplica únicamente si aceptas
 * (queda como 🧩 Mixta, editable día a día). Tus rutinas no cambian.
 */

type Suggestion = { summary: string; days: { weekday: number; routine_id: string; version: Version; why: string }[] };

export const WeekSuggest: React.FC<{ api: WorkoutApi; todayNote: string; onClose: () => void }> = ({ api, todayNote, onClose }) => {
  const confirm = useConfirm();
  const assessment = useAssessment();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sug, setSug] = useState<Suggestion | null>(null);
  const week = api.training.week ?? {};
  const name = (id: string | null | undefined) => api.routines.find((r) => r.id === id);

  const ask = async () => {
    setBusy(true);
    setErr('');
    try {
      const all = allAnswers(assessment.state);
      const pick = ['dias', 'duracion', 'duracion_rango', 'organizacion', 'objetivo', 'experiencia', 'molestias_detalle', 'poco_tiempo', 'recuperacion'];
      const ctx = pick.map((id) => { const q = QUESTIONS.find((x) => x.id === id); return q && all[id] !== undefined ? `${q.title} ${answerLabel(q, all[id])}` : ''; }).filter(Boolean).join(' · ');
      const routines = api.routines.map((r) => ({
        id: r.id, title: r.title, core: r.core,
        muscles: [...new Set(r.exercises.flatMap((e) => e.muscles))].map(muscleLabel).join(', '),
        minutes: VERSIONS.map((v) => `${v.label} ${minutesFor(r, v.id)}m/${exercisesOf(r, v.id).length}ej`).join(', '),
      }));
      const current = WEEK.map((d, i) => { const p = week[String(i)]; const r = name(p?.routine); return `${d}: ${r ? `${r.title} (${versionLabel(p!.version).label})` : 'descanso'}`; }).join('; ');
      const today = (new Date().getDay() + 6) % 7;
      const res = await authFetch(cloudAI('/api/organiza/workout-week'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines, context: `${ctx || 'Sin evaluación respondida.'} Semana actual: ${current}. Hoy: ${todayNote || 'sin registro de cómo llega'}.`, today, app: APP.slug }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No pude proponer la semana.');
      setSug(j);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const apply = async () => {
    if (!sug) return;
    if (!(await confirm({ title: '¿Aplicar esta semana?', message: 'Tu semana pasa a 🧩 Mixta con lo propuesto. Puedes cambiar cualquier día después. Tus rutinas no cambian.', confirmLabel: 'Aplicar' }))) return;
    const next: Record<string, DayPlan> = Object.fromEntries(sug.days.map((d) => [String(d.weekday), { routine: d.routine_id || null, version: d.version }]));
    await api.saveTraining({ ...api.training, mode: 'mixta', week: next });
    onClose();
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Semana sugerida" onClick={(e) => e.stopPropagation()} className="theme-fixed flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-2xl sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="flex-1 font-display text-lg font-semibold text-white">✨ Semana sugerida</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {!sug ? (
              <>
                <p className="text-sm text-zinc-300">La IA mira tus rutinas (y cuánto dura cada versión), tus días y tiempo disponibles, cómo prefieres organizarte y cómo llegas hoy, y te propone qué hacer cada día. <b>No cambia nada hasta que tú la apliques.</b></p>
                {err && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">{err}</p>}
                <button type="button" disabled={busy} onClick={ask} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-50"><Sparkles className="h-4 w-4" /> {busy ? 'Armando tu semana…' : 'Sugerir mi semana'}</button>
              </>
            ) : (
              <>
                <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-200">🤖 {sug.summary}</p>
                <ul className="space-y-1.5">
                  {sug.days.map((d) => {
                    const now = week[String(d.weekday)];
                    const rNow = name(now?.routine);
                    const rNew = name(d.routine_id);
                    const same = (now?.routine ?? null) === (d.routine_id || null) && (!rNew || now?.version === d.version);
                    return (
                      <li key={d.weekday} className={`rounded-xl px-3 py-2 ring-1 ${same ? 'bg-white/[0.02] ring-white/5' : 'bg-red-500/[0.06] ring-red-400/30'}`}>
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="w-20 shrink-0 font-semibold text-zinc-300">{WEEK[d.weekday]}</span>
                          <span className="text-zinc-500 line-through decoration-zinc-600">{!same ? (rNow ? `${rNow.title} · ${versionLabel(now!.version).label}` : 'Descanso') : ''}</span>
                          <span className="font-semibold text-white">{rNew ? `${rNew.title} · ${versionLabel(d.version).emoji} ${versionLabel(d.version).label} · ~${minutesFor(rNew, d.version)} min` : '🌿 Descanso'}</span>
                          {same && <span className="text-[11px] text-zinc-500">(igual que ahora)</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-400">{d.why}</p>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={apply} className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-[#fff] hover:bg-red-400">Aplicar a mi semana</button>
                  <button type="button" onClick={() => setSug(null)} className="rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/[0.1]">Otra propuesta</button>
                  <button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-400 hover:bg-white/[0.06]">Descartar</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
