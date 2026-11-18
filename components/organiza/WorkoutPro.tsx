'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Dumbbell, Pause, Play, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { AssessmentModal } from '@/components/organiza/Assessment';
import { BodyProfileBlock } from '@/components/organiza/BodyProfile';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { coverCss, WEEK, weekdayOf } from '@/components/organiza/model';
import { MediaPanel } from '@/components/organiza/Recipes';
import dynamic from 'next/dynamic';

// El mono 3D (three.js, ~600 KB) se baja solo al abrir Workout Pro, no con el resto de la app.
const BodyMap3D = dynamic(() => import('@/components/organiza/BodyMap3D').then((m) => m.BodyMap3D), { ssr: false, loading: () => <div className="h-[440px]" /> });
const MuscleCover = dynamic(() => import('@/components/organiza/BodyMap3D').then((m) => m.MuscleCover), { ssr: false, loading: () => <span className="absolute inset-0 animate-pulse bg-white/[0.03]" /> });
import { playOnce } from '@/components/organiza/sounds';
import { notify } from '@/components/organiza/notify';
import {
  exercisesOf, isoDay, LIBRARY, MODES, PLACES, MUSCLES, muscleLabel, strength, weekFor, weekStatus, useWorkoutPro,
  type DayPlan, type Feel, type Place, type LoggedExercise, type Mode, type MuscleId, type Routine, type RoutineExercise, type Version, type WorkoutApi,
} from '@/components/organiza/workoutData';

/**
 * 🏋️ Workout Pro (Emanuel, 2026-11-17): a la izquierda la semana y las rutinas en galería; a la derecha la
 * figura con los músculos de los últimos 7 días y el progreso de fuerza. «Entrenar» abre el modo entreno
 * (series para marcar, peso y reps, timer de descanso que suena, video + Spotify) y al final «¿cómo te fue?».
 */

const SHORT = WEEK.map((w) => w.slice(0, 3));
const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/50';
const mmss = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(Math.round(s)) % 60).padStart(2, '0')}`;
const xid = () => Math.random().toString(36).slice(2, 9);
const minutesOf = (r: Routine, v: Version) => (v === 'corta' ? r.short_minutes ?? 30 : r.full_minutes ?? 60);
/** Músculos de una rutina (para su portada con el mono). */
const routineMuscles = (r: Routine, v?: Version) => [...new Set((v ? exercisesOf(r, v) : r.exercises).flatMap((e) => e.muscles))];
const kg = (n: number) => `${String(n).replace('.', ',')} kg`;

/* ── Tarjeta de rutina ────────────────────────────────────────────────────────────── */

const RoutineCard: React.FC<{ r: Routine; version?: Version; sub?: string; done?: boolean; onOpen: () => void; onTrain?: () => void }> = ({ r, version, sub, done, onOpen, onTrain }) => (
  <div className={`overflow-hidden rounded-2xl bg-[#17191f] ring-1 transition hover:ring-white/25 ${done ? 'ring-emerald-400/50' : 'ring-white/10'}`}>
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <div className="relative h-28 bg-gradient-to-br from-red-500/30 to-orange-400/10" style={coverCss(r.cover_url)}>
        {!r.cover_url && <MuscleCover muscles={routineMuscles(r, version)} fallback={<span className="absolute inset-0 flex items-center justify-center text-4xl">{r.emoji}</span>} />}
        {r.code && <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-[#fff] backdrop-blur">{r.code === 'cerro' ? '⛰️' : r.code}{r.core ? ' · masivo' : ''}</span>}
        {done && <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-[#09090b]">✓ Hecho</span>}
      </div>
      <div className="space-y-0.5 px-3 py-2">
        <p className="line-clamp-2 text-sm font-semibold text-white">{r.title || 'Rutina sin nombre'}</p>
        <p className="text-[11px] text-zinc-400">{sub ?? `⏱️ ${r.full_minutes ?? 60} min completa · ${r.short_minutes ?? 30} min corta`}</p>
        {version && <p className="text-[11px] text-zinc-500">{exercisesOf(r, version).length} ejercicios · {[...new Set(exercisesOf(r, version).flatMap((e) => e.muscles))].slice(0, 4).map(muscleLabel).join(', ')}</p>}
      </div>
    </button>
    {onTrain && (
      <button type="button" onClick={onTrain} className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs font-bold text-red-200 hover:bg-red-500/15">
        <Play className="h-3.5 w-3.5" /> Entrenar
      </button>
    )}
  </div>
);

/* ── MODIFICACIÓN 01 (17 nov): banner, dónde entrenas y rutina personalizada ─────────── */

const Hero: React.FC = () => (
  <header className="theme-fixed relative mb-4 overflow-hidden rounded-3xl bg-[#0b0c10] ring-1 ring-white/10">
    <img src="/workout/banner.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[70%_30%] sm:object-[center_30%]" draggable={false} />
    <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c10] via-[#0b0c10]/80 to-[#0b0c10]/10" />
    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10]/70 to-transparent" />
    <div className="relative max-w-xl px-5 py-8 sm:px-8 sm:py-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400 [text-shadow:0_0_10px_rgba(239,68,68,0.6)]">🏋️ Workout Pro</p>
      <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-[#fff] sm:text-5xl">Entrena a tu manera</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#d4d4d8] sm:text-base">Construye una rutina que se adapte a tus objetivos, tu tiempo y tu estilo de vida.</p>
    </div>
  </header>
);

/** En casa · Al aire libre · Gimnasio: se elige y se guarda (`training.place`); la lógica por lugar viene después. */
const PlacePicker: React.FC<{ value: Place | null; onPick: (p: Place) => void }> = ({ value, onPick }) => (
  <section className="mb-4" aria-label="Dónde entrenas">
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
      {PLACES.map((p) => {
        const on = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(p.id)}
            className={`theme-fixed group relative h-28 overflow-hidden rounded-2xl bg-[#0b0c10] text-left transition sm:h-40 ${on ? 'ring-2 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55),0_0_26px_rgba(239,68,68,0.3)]' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
          >
            <img src={p.img} alt="" className={`absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105 ${on ? '' : 'opacity-75 group-hover:opacity-90'}`} draggable={false} />
            <span className="absolute inset-0 bg-gradient-to-t from-[#0b0c10]/90 via-[#0b0c10]/30 to-transparent" />
            {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[#fff] shadow-[0_0_10px_rgba(239,68,68,0.8)]"><Check className="h-3.5 w-3.5" /></span>}
            <span className="absolute inset-x-0 bottom-0 p-2.5 sm:p-4">
              <span className="block text-sm font-bold leading-tight text-[#fff] sm:text-lg">{p.emoji} {p.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);

const PersonalizeCTA: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button type="button" onClick={onOpen} className="wp-attn theme-fixed group relative mb-5 flex w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#7f1d1d] via-[#b91c1c] to-[#ea580c] p-4 text-left ring-1 ring-red-400/40 sm:gap-4 sm:p-5">
    <span className="wp-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[#fff] ring-1 ring-white/25 sm:h-12 sm:w-12"><Sparkles className="h-6 w-6" /></span>
    <span className="relative min-w-0 flex-1">
      <span className="block font-display text-base font-semibold text-[#fff] sm:text-xl">Crear mi rutina personalizada</span>
      <span className="mt-0.5 block text-xs leading-snug text-[#fee2e2] sm:text-sm">Responde una evaluación y descubre cómo organizar tus entrenamientos según tus objetivos y disponibilidad.</span>
    </span>
    <ChevronRight className="relative h-5 w-5 shrink-0 text-[#fff] transition group-hover:translate-x-1" />
  </button>
);

/* ── La semana: un bloque con 7 días parejos ─────────────────────────────────────── */

const WeekBlock: React.FC<{
  api: WorkoutApi;
  week: Record<string, DayPlan>;
  today: number;
  monday: Date;
  status: { met: boolean; text: string };
  doneOn: (wd: number) => boolean;
  onMode: (m: Mode) => void;
  onDay: (wd: number) => void;
  onTrain: (r: Routine, v: Version) => void;
}> = ({ api, week, today, monday, status, doneOn, onMode, onDay, onTrain }) => (
  <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
    <div className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-semibold text-white">🗓️ Tu semana</h2>
        <p className={`mt-0.5 text-xs font-semibold ${status.met ? 'text-emerald-300' : 'text-zinc-400'}`}>{status.text}</p>
      </div>
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white/[0.04] p-1 ring-1 ring-white/10">
        {MODES.map((m) => (
          <button key={m.id} type="button" data-help={m.help} onClick={() => onMode(m.id)} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${api.training.mode === m.id ? 'bg-red-500 text-[#fff] shadow' : 'text-zinc-400 hover:text-zinc-100'}`}>{m.emoji} {m.label}</button>
        ))}
      </div>
    </div>
    <div className="-mx-3 -my-2 grid snap-x auto-cols-[minmax(138px,1fr)] grid-flow-col gap-2.5 overflow-x-auto px-3 py-3">
      {WEEK.map((w, wd) => {
        const p = week[String(wd)] ?? { routine: null, version: 'completa' as Version };
        const r = api.routines.find((x) => x.id === p.routine);
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + wd);
        const done = doneOn(wd);
        const isToday = wd === today;
        return (
          <div key={wd} className={`flex snap-start flex-col overflow-hidden rounded-2xl bg-[#17191f] ring-1 transition ${isToday ? 'ring-2 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.55),0_0_26px_rgba(239,68,68,0.35)]' : done ? 'ring-emerald-400/40' : 'ring-white/10 hover:ring-white/20'}`}>
            <button type="button" onClick={() => onDay(wd)} className="flex flex-1 flex-col text-left">
              <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2">
                <span className={`text-xs font-bold ${isToday ? 'text-red-400 [text-shadow:0_0_8px_rgba(239,68,68,0.6)]' : 'text-zinc-300'}`}>{SHORT[wd]} <span className="font-normal opacity-70">{date.getDate()}</span></span>
                {done ? <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-[#09090b]">✓</span> : isToday ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-[#fff] shadow-[0_0_8px_rgba(239,68,68,0.8)]">hoy</span> : null}
              </div>
              <div className="relative mx-2 h-20 overflow-hidden rounded-xl bg-white/[0.03]" style={r ? coverCss(r.cover_url) : undefined}>
                {r ? (
                  !r.cover_url && <MuscleCover muscles={routineMuscles(r, p.version)} fallback={<span className="absolute inset-0 flex items-center justify-center text-3xl">{r.emoji}</span>} />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl">🌿</span>
                )}
                {r?.code && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-bold text-[#fff] backdrop-blur">{r.code === 'cerro' ? '⛰️' : r.code}</span>}
              </div>
              <div className="flex-1 px-2.5 py-2">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{r ? r.title : 'Descanso'}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{r ? `${p.version === 'corta' ? '⚡ Corta' : 'Completa'} · ${minutesOf(r, p.version)} min` : done ? 'Igual entrenaste 💪' : 'Recupera'}</p>
              </div>
            </button>
            {r ? (
              <button type="button" onClick={() => onTrain(r, p.version)} className={`flex items-center justify-center gap-1 border-t border-white/10 py-1.5 text-[11px] font-bold ${isToday ? 'bg-red-500 text-[#fff] hover:bg-red-400' : 'text-red-200 hover:bg-red-500/15'}`}>
                <Play className="h-3 w-3" /> Entrenar
              </button>
            ) : (
              <span aria-hidden className="py-1.5 text-[11px]">&nbsp;</span>
            )}
          </div>
        );
      })}
    </div>
  </section>
);

/* ── Vista ────────────────────────────────────────────────────────────────────────── */

export const WorkoutProView: React.FC = () => {
  const api = useWorkoutPro();
  return <WorkoutProScreen api={api} />;
};

/** La pantalla con su `api` (separada para poder mostrarla con datos de prueba). */
export const WorkoutProScreen: React.FC<{ api: WorkoutApi }> = ({ api }) => {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [train, setTrain] = useState<{ r: Routine; v: Version } | null>(null);
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [personalize, setPersonalize] = useState(false);
  const today = weekdayOf(new Date());
  const week = api.training.week ?? {};
  const planned = Object.values(week).filter((d) => d.routine).length;
  const status = weekStatus(api.logs, api.training.mode, planned);
  const monday = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - today);
  }, [today]);
  const doneOn = (wd: number) => {
    const day = isoDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + wd));
    return api.logs.some((l) => l.day === day);
  };
  const editingRoutine = api.routines.find((r) => r.id === editing) ?? null;
  const progress = strength(api.logs).slice(0, 8);

  const setMode = async (mode: Mode) => {
    if (mode === 'mixta') return api.saveTraining({ ...api.training, mode });
    if (api.training.mode && api.training.mode !== 'mixta' && api.training.mode !== mode && !(await confirm({ title: `¿Cambiar tu semana a «${MODES.find((m) => m.id === mode)?.label}»?`, message: 'Los días se arman de nuevo con tus rutinas. Después puedes cambiar cualquier día.', confirmLabel: 'Cambiar' }))) return;
    await api.saveTraining({ ...api.training, mode, week: weekFor(mode, api.routines) });
  };
  const setDay = (wd: number, p: DayPlan) => api.saveTraining({ ...api.training, mode: 'mixta', week: { ...week, [String(wd)]: p } });

  if (!api.ready) return <p className="text-sm text-zinc-500">Cargando Workout Pro…</p>;
  return (
    <div className="mx-auto max-w-7xl">
      <Hero />
      <PlacePicker value={api.training.place ?? null} onPick={(place) => api.saveTraining({ ...api.training, place })} />
      <PersonalizeCTA onOpen={() => setPersonalize(true)} />

      <WeekBlock
        api={api}
        week={week}
        today={today}
        monday={monday}
        status={status}
        doneOn={doneOn}
        onMode={setMode}
        onDay={setDayOpen}
        onTrain={(r, v) => setTrain({ r, v })}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="flex-1 font-display text-xl font-semibold text-white">📋 Tus rutinas</h2>
              <button type="button" onClick={async () => { const r = await api.addRoutine(); if (r) setEditing(r.id); }} className="inline-flex items-center gap-1 rounded-xl bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.14]"><Plus className="h-3.5 w-3.5" /> Nueva rutina</button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {api.routines.map((r) => <RoutineCard key={r.id} r={r} onOpen={() => setEditing(r.id)} />)}
            </div>
          </section>
          <BodyProfileBlock />
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
            <h2 className="mb-1 font-display text-xl font-semibold text-white">🧍 Lo que entrenaste</h2>
            <BodyMap3D counts={api.counts} picked={muscle} onPick={setMuscle} />
            {muscle && (
              <div className="mt-3 rounded-xl bg-black/25 p-3 text-xs text-zinc-300">
                <p className="mb-1 flex items-center justify-between font-semibold text-white">{muscleLabel(muscle)} · {api.counts[muscle] ?? 0} en 7 días <button type="button" aria-label="Cerrar" onClick={() => setMuscle(null)}><X className="h-3.5 w-3.5" /></button></p>
                <p className="text-zinc-400">Clave: {LIBRARY[muscle].filter((e) => e.key).map((e) => e.name).join(' · ')}</p>
                <p className="text-zinc-500">Detalle: {LIBRARY[muscle].filter((e) => !e.key).map((e) => e.name).join(' · ') || '—'}</p>
              </div>
            )}
          </section>
          <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
            <h2 className="mb-2 text-sm font-semibold text-white">📈 Fuerza</h2>
            {progress.length ? (
              <ul className="space-y-1">
                {progress.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-zinc-300">{p.name}</span>
                    <span className="tabular-nums text-zinc-100">{p.now ? kg(p.now) : '—'}</span>
                    {p.now > p.before && p.before > 0 && <span className="font-bold text-emerald-300">▲ {kg(+(p.now - p.before).toFixed(1))}</span>}
                    {!p.now && p.before > 0 && <span className="text-zinc-500">antes {kg(p.before)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">Anota peso y reps en el modo entreno y aquí ves cómo subes semana a semana.</p>
            )}
          </section>
          {api.logs.length > 0 && (
            <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
              <h2 className="mb-2 text-sm font-semibold text-white">🗒️ Últimos entrenos</h2>
              <ul className="space-y-1">
                {api.logs.slice(0, 6).map((l) => (
                  <li key={l.id} className="group flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-zinc-500">{new Date(`${l.day}T12:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-200">{l.title}</span>
                    <span className="text-zinc-400" data-help="Calidad: ejercicios clave hechos">⭐ {l.quality_done}/{l.quality_total}</span>
                    <button type="button" aria-label="Borrar entreno" onClick={async () => { if (await confirm({ title: `¿Borrar el entreno «${l.title}»?`, confirmLabel: 'Borrar', tone: 'danger' })) api.removeLog(l.id); }} className="text-zinc-600 opacity-0 hover:text-rose-300 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {dayOpen !== null && <DayChooser wd={dayOpen} api={api} plan={week[String(dayOpen)] ?? { routine: null, version: 'completa' }} onSave={(p) => { setDay(dayOpen, p); setDayOpen(null); }} onEdit={(id) => { setDayOpen(null); setEditing(id); }} onClose={() => setDayOpen(null)} />}
      {editingRoutine && <RoutineEditor r={editingRoutine} api={api} onTrain={(v) => { setEditing(null); setTrain({ r: editingRoutine, v }); }} onClose={() => setEditing(null)} />}
      {personalize && <AssessmentModal place={api.training.place ?? null} onPlace={(p) => PLACES.some((x) => x.id === p) && api.saveTraining({ ...api.training, place: p as Place })} onClose={() => setPersonalize(false)} />}
      {train && <TrainMode r={train.r} version={train.v} api={api} onClose={() => setTrain(null)} />}
    </div>
  );
};

/* ── Elegir qué va un día ─────────────────────────────────────────────────────────── */

const DayChooser: React.FC<{ wd: number; api: WorkoutApi; plan: DayPlan; onSave: (p: DayPlan) => void; onEdit: (id: string) => void; onClose: () => void }> = ({ wd, api, plan, onSave, onEdit, onClose }) => {
  const [routine, setRoutine] = useState<string | null>(plan.routine);
  const [version, setVersion] = useState<Version>(plan.version);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div role="dialog" aria-label={`Entrenamiento del ${WEEK[wd]}`} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <p className="font-semibold text-white">🗓️ {WEEK[wd]}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRoutine(null)} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${!routine ? 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/50' : 'text-zinc-300 ring-white/10'}`}>🌿 Descanso</button>
            {api.routines.map((r) => (
              <button key={r.id} type="button" onClick={() => setRoutine(r.id)} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${routine === r.id ? 'bg-red-500/20 text-[#fff] ring-red-400/60' : 'text-zinc-300 ring-white/10 hover:bg-white/[0.04]'}`}>
                {r.emoji} {r.code && r.code !== 'cerro' ? `${r.code} · ` : ''}{r.title}
              </button>
            ))}
          </div>
          {routine && (
            <div className="flex gap-2">
              {(['completa', 'corta'] as Version[]).map((v) => {
                const r = api.routines.find((x) => x.id === routine)!;
                return (
                  <button key={v} type="button" onClick={() => setVersion(v)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${version === v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>
                    {v === 'completa' ? '🏋️ Completa' : '⚡ Corta'} <span className="block text-[11px] font-normal opacity-80">~{minutesOf(r, v)} min · {exercisesOf(r, v).length} ejercicios</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => onSave({ routine, version })} className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-[#fff] hover:bg-red-400">Guardar</button>
            {routine && <button type="button" onClick={() => onEdit(routine)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.1]">Editar rutina</button>}
          </div>
          <p className="text-[11px] text-zinc-500">Cambiar un día pasa tu semana a 🧩 Mixta.</p>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Editar una rutina ────────────────────────────────────────────────────────────── */

const RoutineEditor: React.FC<{ r: Routine; api: WorkoutApi; onTrain: (v: Version) => void; onClose: () => void }> = ({ r, api, onTrain, onClose }) => {
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<MuscleId | ''>('');
  const set = (p: Partial<Routine>) => api.patchRoutine(r.id, p);
  const setEx = (id: string, p: Partial<RoutineExercise>) => set({ exercises: r.exercises.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const move = (i: number, d: number) => {
    const n = [...r.exercises];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
    set({ exercises: n });
  };
  const addFrom = (name: string, muscles: MuscleId[], key: boolean) => set({ exercises: [...r.exercises, { id: xid(), name, muscles, key, sets: 3, reps: '10', rest: 90, weight: null }] });
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-label={`Rutina ${r.title}`} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#14161b] ring-1 ring-white/10">
          <div className="relative h-40 bg-gradient-to-br from-red-500/30 to-orange-400/10" style={coverCss(r.cover_url)}>
            {!r.cover_url && <MuscleCover muscles={routineMuscles(r)} fallback={<span className="absolute inset-0 flex items-center justify-center text-5xl">{r.emoji}</span>} />}
            <button type="button" onClick={() => setPicking((v) => !v)} className="absolute bottom-2 right-2 rounded-lg bg-black/55 px-2 py-1 text-xs font-semibold text-[#fff] backdrop-blur">🖼️ Portada</button>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute right-2 top-2 rounded-lg bg-black/55 p-1.5 text-[#fff]"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-4 p-5">
            {picking && <CoverPicker value={r.cover_url} rank={9} title={r.title} onPick={(c) => { set({ cover_url: c }); setPicking(false); }} />}
            <div className="flex gap-2">
              <input value={r.emoji} onChange={(e) => set({ emoji: e.target.value.slice(0, 4) })} aria-label="Emoji" className={`${field} w-14 text-center`} />
              <input value={r.title} onChange={(e) => set({ title: e.target.value })} placeholder="Nombre de la rutina" aria-label="Nombre" className={`${field} flex-1 text-base font-semibold`} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
              <label className="flex items-center gap-1.5">🏋️ Completa <input type="number" min={5} value={r.full_minutes ?? ''} onChange={(e) => set({ full_minutes: Number(e.target.value) || null })} className={`${field} w-16 py-1 text-center`} /> min</label>
              <label className="flex items-center gap-1.5">⚡ Corta <input type="number" min={5} value={r.short_minutes ?? ''} onChange={(e) => set({ short_minutes: Number(e.target.value) || null })} className={`${field} w-16 py-1 text-center`} /> min</label>
              <label className="flex cursor-pointer items-center gap-1.5" data-help="Día masivo: con los masivos hechos tu semana está cumplida"><input type="checkbox" checked={r.core} onChange={(e) => set({ core: e.target.checked })} className="accent-red-500" /> Día masivo</label>
            </div>
            <textarea value={r.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Notas (de qué se trata este día)" className={field} />

            <div>
              <p className="mb-1.5 text-sm font-semibold text-white">Ejercicios <span className="font-normal text-zinc-500">· ⭐ = clave (van en la versión corta)</span></p>
              <ul className="space-y-2">
                {r.exercises.map((e, i) => (
                  <li key={e.id} className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label={e.key ? 'Quitar de clave' : 'Marcar como clave'} data-help={e.key ? 'Clave: va en la versión corta' : 'De detalle: solo en la completa'} onClick={() => setEx(e.id, { key: !e.key })} className={e.key ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}><Star className="h-4 w-4" fill={e.key ? 'currentColor' : 'none'} /></button>
                      <input value={e.name} onChange={(x) => setEx(e.id, { name: x.target.value })} aria-label="Ejercicio" className={`${field} flex-1 py-1`} />
                      <div className="flex flex-col">
                        <button type="button" aria-label="Subir" disabled={!i} onClick={() => move(i, -1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Bajar" disabled={i === r.exercises.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <button type="button" aria-label="Quitar ejercicio" onClick={() => set({ exercises: r.exercises.filter((x) => x.id !== e.id) })} className="p-1 text-zinc-600 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <label className="flex items-center gap-1">Series <input type="number" min={1} value={e.sets} onChange={(x) => setEx(e.id, { sets: Math.max(1, Number(x.target.value) || 1) })} className="w-12 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /></label>
                      <label className="flex items-center gap-1">Reps <input value={e.reps} onChange={(x) => setEx(e.id, { reps: x.target.value })} className="w-20 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /></label>
                      <label className="flex items-center gap-1">Descanso <input type="number" min={0} step={15} value={e.rest} onChange={(x) => setEx(e.id, { rest: Math.max(0, Number(x.target.value) || 0) })} className="w-14 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /> s</label>
                      <label className="flex items-center gap-1">Peso <input type="number" min={0} step={0.5} value={e.weight ?? ''} onChange={(x) => setEx(e.id, { weight: x.target.value === '' ? null : Number(x.target.value) })} className="w-16 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /> kg</label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {MUSCLES.map((m) => {
                        const on = e.muscles.includes(m.id);
                        return <button key={m.id} type="button" onClick={() => setEx(e.id, { muscles: on ? e.muscles.filter((x) => x !== m.id) : [...e.muscles, m.id] })} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${on ? 'bg-red-500/25 text-red-100 ring-red-400/50' : 'text-zinc-500 ring-white/10 hover:text-zinc-300'}`}>{m.label}</button>;
                      })}
                    </div>
                    <input value={e.video ?? ''} onChange={(x) => setEx(e.id, { video: x.target.value || undefined })} placeholder="Video de la técnica (link de YouTube, opcional)" className={`${field} mt-2 py-1 text-xs`} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                <p className="mb-2 text-xs font-semibold text-zinc-300">＋ Agregar ejercicio por músculo</p>
                <div className="flex flex-wrap gap-1">
                  {MUSCLES.map((m) => <button key={m.id} type="button" onClick={() => setAdding(adding === m.id ? '' : m.id)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${adding === m.id ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-400 ring-white/15'}`}>{m.label}</button>)}
                </div>
                {adding && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {LIBRARY[adding].map((x) => <button key={x.name} type="button" onClick={() => addFrom(x.name, x.muscles, !!x.key)} className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-zinc-100 hover:bg-white/[0.12]">{x.key ? '⭐ ' : ''}{x.name}</button>)}
                    <button type="button" onClick={() => addFrom('Ejercicio nuevo', [adding], false)} className="rounded-lg px-2 py-1 text-xs text-sky-300 ring-1 ring-sky-400/30">Otro…</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => onTrain('completa')} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-[#fff] hover:bg-red-400"><Play className="h-4 w-4" /> Entrenar completa</button>
              <button type="button" onClick={() => onTrain('corta')} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 py-2 text-sm font-bold text-[#fff] hover:bg-white/[0.14]">⚡ Entrenar corta</button>
              <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar la rutina «${r.title}»?`, message: 'Los días que la tenían quedan en descanso. Tus entrenos anotados no se borran.', confirmLabel: 'Borrar', tone: 'danger' })) { await api.removeRoutine(r.id); onClose(); } }} className="ml-auto rounded-xl px-3 py-2 text-sm text-zinc-500 hover:text-rose-300">Borrar rutina</button>
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Modo entreno ─────────────────────────────────────────────────────────────────── */

export const TrainMode: React.FC<{ r: Routine; version: Version; api: WorkoutApi; onClose: () => void }> = ({ r, version: initial, api, onClose }) => {
  const [version, setVersion] = useState<Version>(initial);
  const list = exercisesOf(r, version);
  const [log, setLog] = useState<Record<string, { weight: number | null; reps: number | null; done: boolean }[]>>(() =>
    Object.fromEntries(r.exercises.map((e) => [e.id, Array.from({ length: Math.max(1, e.sets) }, () => ({ weight: e.weight ?? null, reps: Number.parseInt(e.reps, 10) || null, done: false }))])),
  );
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [rest, setRest] = useState<{ until: number; total: number; name: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState(false);
  const rang = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (running) setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);
  // El descanso suena al terminar (una vez).
  useEffect(() => {
    if (!rest || rang.current || now < rest.until) return;
    rang.current = true;
    playOnce('alarma');
    void notify('💪 ¡A la siguiente serie!', rest.name);
  }, [now, rest]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !review && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, review]);
  const mark = (e: RoutineExercise, i: number) => {
    const sets = log[e.id];
    const done = !sets[i].done;
    setLog((l) => ({ ...l, [e.id]: l[e.id].map((s, k) => (k === i ? { ...s, done } : s)) }));
    if (done && e.rest > 0) {
      rang.current = false;
      setRest({ until: Date.now() + e.rest * 1000, total: e.rest, name: e.name });
    }
  };
  const setSet = (id: string, i: number, p: Partial<{ weight: number | null; reps: number | null }>) => setLog((l) => ({ ...l, [id]: l[id].map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const keys = list.filter((e) => e.key);
  const keyDone = keys.filter((e) => log[e.id]?.some((s) => s.done)).length;
  const left = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  return (
    <BodyPortal>
      <div role="dialog" aria-label={`Modo entreno: ${r.title}`} className="theme-fixed fixed inset-0 z-[96] flex flex-col bg-[#0b0c0f] text-left">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <Dumbbell className="h-5 w-5 text-red-300" />
          <p className="min-w-0 flex-1 truncate font-semibold text-white">{r.emoji} {r.title}</p>
          <div className="flex rounded-lg bg-white/[0.05] p-0.5 text-xs">
            {(['completa', 'corta'] as Version[]).map((v) => <button key={v} type="button" onClick={() => setVersion(v)} className={`rounded-md px-2.5 py-1 font-semibold ${version === v ? 'bg-red-500 text-[#fff]' : 'text-zinc-400'}`}>{v === 'completa' ? 'Completa' : '⚡ Corta'}</button>)}
          </div>
          <button type="button" onClick={onClose} aria-label="Salir del modo entreno" className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="min-w-0 p-4 md:h-full md:basis-1/2 md:overflow-y-auto">
            <MediaPanel doing="mientras entrenas" store="mp-entreno-video" />
          </div>
          <div className="space-y-4 border-white/10 p-4 md:h-full md:min-w-[400px] md:basis-1/2 md:overflow-y-auto md:border-l">
            <div className="flex items-center gap-3">
              <p className="font-display text-4xl font-semibold tabular-nums text-[#fff]">{mmss(elapsed)}</p>
              <span className="text-xs text-zinc-500">de ~{minutesOf(r, version)} min · ⭐ {keyDone}/{keys.length}</span>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setRunning((v) => !v)} aria-label={running ? 'Pausar' : 'Seguir'} className="rounded-xl bg-white/10 p-2 text-[#fff]">{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                <button type="button" onClick={() => { setRunning(false); setReview(true); }} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#09090b] hover:bg-emerald-400">Terminé</button>
              </div>
            </div>
            {rest && (
              <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${left > 0 ? 'bg-sky-500/10 ring-sky-400/40' : 'animate-pulse bg-emerald-500/15 ring-emerald-400/50'}`}>
                <span className="font-display text-3xl font-semibold tabular-nums text-[#fff]">{left > 0 ? mmss(left) : '¡Vamos!'}</span>
                <span className="min-w-0 flex-1 text-xs text-zinc-300">{left > 0 ? `Descanso · ${rest.name}` : 'A la siguiente serie'}</span>
                {left > 0 && <button type="button" onClick={() => setRest((x) => (x ? { ...x, until: x.until + 15000 } : x))} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-[#fff]">+15 s</button>}
                <button type="button" onClick={() => setRest(null)} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-[#fff]">{left > 0 ? 'Saltar' : 'OK'}</button>
              </div>
            )}
            <ul className="space-y-3">
              {list.map((e) => {
                const sets = log[e.id] ?? [];
                const all = sets.every((s) => s.done);
                return (
                  <li key={e.id} className={`rounded-2xl p-3 ring-1 ${all ? 'bg-emerald-500/[0.07] ring-emerald-400/30' : 'bg-white/[0.03] ring-white/10'}`}>
                    <div className="flex items-start gap-2">
                      {e.key && <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" fill="currentColor" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{e.name}</p>
                        <p className="text-[11px] text-zinc-500">{e.sets} × {e.reps}{e.rest ? ` · descanso ${e.rest} s` : ''}{e.muscles.length ? ` · ${e.muscles.map(muscleLabel).join(', ')}` : ''}</p>
                      </div>
                      {e.video && <a href={e.video} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-sky-300 hover:text-sky-200">▶ Técnica</a>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {sets.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <button type="button" aria-label={`Serie ${i + 1} ${s.done ? 'hecha' : 'pendiente'}`} onClick={() => mark(e, i)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 ${s.done ? 'bg-emerald-500 ring-emerald-400' : 'ring-white/30 hover:ring-white/60'}`}>{s.done ? <Check className="h-4 w-4 text-[#fff]" /> : <span className="text-[11px] font-bold text-zinc-300">{i + 1}</span>}</button>
                          <input type="number" inputMode="decimal" min={0} step={0.5} value={s.weight ?? ''} placeholder="kg" onChange={(x) => setSet(e.id, i, { weight: x.target.value === '' ? null : Number(x.target.value) })} aria-label="Peso" className="w-20 rounded-lg bg-white/[0.06] px-2 py-1 text-center text-sm text-white outline-none ring-1 ring-white/10" />
                          <span className="text-xs text-zinc-500">kg ×</span>
                          <input type="number" inputMode="numeric" min={0} value={s.reps ?? ''} placeholder="reps" onChange={(x) => setSet(e.id, i, { reps: x.target.value === '' ? null : Number(x.target.value) })} aria-label="Repeticiones" className="w-16 rounded-lg bg-white/[0.06] px-2 py-1 text-center text-sm text-white outline-none ring-1 ring-white/10" />
                          <span className="text-xs text-zinc-500">reps</span>
                        </div>
                      ))}
                      <button type="button" onClick={() => setLog((l) => ({ ...l, [e.id]: [...l[e.id], { ...(l[e.id].at(-1) ?? { weight: null, reps: null }), done: false }] }))} className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300">＋ otra serie</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        {review && <HowItWent r={r} version={version} list={list} log={log} minutes={Math.max(1, Math.round(elapsed / 60))} api={api} onCancel={() => { setReview(false); setRunning(true); }} onDone={onClose} />}
      </div>
    </BodyPortal>
  );
};

/** Al terminar: calidad (clave hechos), «¿cómo te fue?» y el peso para la próxima. */
const HowItWent: React.FC<{ r: Routine; version: Version; list: RoutineExercise[]; log: Record<string, { weight: number | null; reps: number | null; done: boolean }[]>; minutes: number; api: WorkoutApi; onCancel: () => void; onDone: () => void }> = ({ r, version, list, log, minutes, api, onCancel, onDone }) => {
  const [feel, setFeel] = useState<Feel | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const keys = list.filter((e) => e.key);
  const keyDone = keys.filter((e) => log[e.id]?.some((s) => s.done)).length;
  const anyDone = list.some((e) => log[e.id]?.some((s) => s.done));
  const save = async () => {
    setBusy(true);
    const exercises: LoggedExercise[] = list.map((e) => ({ name: e.name, muscles: e.muscles, key: e.key, sets: (log[e.id] ?? []).map((s) => ({ weight: s.weight, reps: s.reps, done: s.done })) }));
    await api.addLog({ routine_id: r.id, day: isoDay(), title: r.title, core: r.core, version, exercises, quality_done: keyDone, quality_total: keys.length, minutes, feel, notes: note.trim() });
    // El peso para la próxima: el mejor de hoy (+2,5 kg si estuvo fácil).
    const next = r.exercises.map((e) => {
      const top = Math.max(0, ...(log[e.id] ?? []).filter((s) => s.done && s.weight).map((s) => s.weight ?? 0));
      return top ? { ...e, weight: feel === 'facil' ? top + 2.5 : top } : e;
    });
    await api.patchRoutine(r.id, { exercises: next });
    setBusy(false);
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[97] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
        <p className="text-lg font-semibold text-white">🏁 ¿Cómo te fue?</p>
        <div className="rounded-xl bg-white/[0.04] p-3 text-sm text-zinc-200">
          <p className="font-semibold">⭐ Calidad {keyDone} de {keys.length}</p>
          <p className="text-xs text-zinc-400">{keyDone === keys.length && keys.length ? 'Hiciste todo lo clave: entreno de calidad. 💯' : keyDone ? 'Bien: lo que hiciste cuenta. La próxima suma uno más.' : 'Moverte ya cuenta. La próxima, parte por los ⭐.'} · {minutes} min</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([['facil', '😌', 'Fácil', 'subo peso'], ['bien', '💪', 'Bien', 'igual'], ['duro', '🥵', 'Duro', 'me cuesta']] as const).map(([id, e, label, sub]) => (
            <button key={id} type="button" onClick={() => setFeel(id)} className={`rounded-xl px-2 py-2 text-sm font-semibold ring-1 ${feel === id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-200 ring-white/15'}`}>{e} {label}<span className="block text-[10px] font-normal opacity-75">{sub}</span></button>
          ))}
        </div>
        {feel === 'facil' && <p className="text-xs text-emerald-300">La próxima vez cada ejercicio parte con +2,5 kg.</p>}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="¿Algo que anotar? (molestias, máquina ocupada…)" className={field} />
        <div className="flex gap-2">
          <button type="button" disabled={busy || !anyDone} onClick={save} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#09090b] hover:bg-emerald-400 disabled:opacity-50">{busy ? 'Guardando…' : anyDone ? 'Guardar entreno' : 'Marca al menos una serie'}</button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.1]">Seguir</button>
        </div>
      </div>
    </div>
  );
};

/* ── En una acción del Horario («Entrenar») ───────────────────────────────────────── */

/** La rutina del día de la acción + botón Entrenar (abre el modo entreno). */
export const WorkoutOfDay: React.FC<{ weekdays: number[] }> = ({ weekdays }) => {
  const api = useWorkoutPro();
  const today = weekdayOf(new Date());
  const [day, setDay] = useState(weekdays.includes(today) ? today : weekdays[0] ?? today);
  const [train, setTrain] = useState<{ r: Routine; v: Version } | null>(null);
  const p = api.training.week?.[String(day)];
  const r = api.routines.find((x) => x.id === p?.routine);
  if (!api.ready) return <p className="text-sm text-zinc-500">Cargando…</p>;
  return (
    <div className="space-y-2">
      {weekdays.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {[...weekdays].sort((a, b) => a - b).map((d) => <button key={d} type="button" onClick={() => setDay(d)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${d === day ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-400 ring-white/15'}`}>{SHORT[d]}</button>)}
        </div>
      )}
      {r && p ? (
        <div className="max-w-xs"><RoutineCard r={r} version={p.version} sub={`${p.version === 'corta' ? '⚡ Corta' : '🏋️ Completa'} · ~${minutesOf(r, p.version)} min`} onOpen={() => setTrain({ r, v: p.version })} onTrain={() => setTrain({ r, v: p.version })} /></div>
      ) : (
        <p className="text-sm text-zinc-500">🌿 El {WEEK[day].toLowerCase()} es de descanso en tu plan.</p>
      )}
      <a href="#entrenamiento" className="text-xs font-semibold text-zinc-400 hover:text-white">Ver Workout Pro →</a>
      {train && <TrainMode r={train.r} version={train.v} api={api} onClose={() => { setTrain(null); api.reload(); }} />}
    </div>
  );
};
