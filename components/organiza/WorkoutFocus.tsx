'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Minus, Music2, Pause, Play, Plus, Star, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { MediaPanel } from '@/components/organiza/Recipes';
import { playOnce } from '@/components/organiza/sounds';
import { notify } from '@/components/organiza/notify';
import { VERSIONS } from '@/components/organiza/planData';
import { usePlanCtx } from '@/components/organiza/planCtx';
import {
  exercisesOf, isoDay, lastTime, minutesFor, muscleLabel,
  type Feel, type LoggedExercise, type Routine, type RoutineExercise, type SetKind, type Version, type WorkoutApi,
} from '@/components/organiza/workoutData';

/**
 * 🏋️ Workout Focus 2.0 (MODIFICACIÓN 02, Emanuel 2026-11-18) — evoluciona el modo Entrenar (mismo lugar, mismo
 * guardado en `organiza_workout_logs`, mismo reproductor `MediaPanel` de video + Spotify).
 * - Un ejercicio a la vez con controles grandes; la serie activa abierta, las demás en una línea (toca para corregir).
 * - Series de aproximación (no cuentan), efectivas y de descarga; peso y reps con −/+; reps en reserva (RIR) opcional.
 * - «Última vez» del historial como referencia. Nunca sube el peso solo ni empuja al fallo.
 * - Descanso sugerido (el de la rutina): se puede alargar, acortar o saltar; suena al terminar.
 * - Todo se guarda al instante en el equipo (sirve sin conexión); al terminar va a la nube, o queda pendiente y
 *   se sube solo la próxima vez. Pausa real (el tiempo y el descanso se congelan). Pantalla encendida mientras entrenas.
 */

type FSet = { kind: SetKind; weight: number | null; reps: number | null; rir: number | null; done: boolean };
type Rest = { until: number; total: number; name: string } | { left: number; total: number; name: string; paused: true };
type Session = {
  routineId: string;
  version: Version;
  day: string;
  startedAt: number;
  pausedMs: number;
  pausedAt: number | null;
  current: number;
  sets: Record<string, FSet[]>;
  rest: Rest | null;
};

const KEY = (id: string) => `wp-focus:${id}`;
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s)) % 60).padStart(2, '0')}`;
const kg = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${String(+n.toFixed(2)).replace('.', ',')}`);
const KIND: Record<SetKind, { tag: (n: number) => string; label: string; tone: string }> = {
  warmup: { tag: (n) => `A${n}`, label: 'Aproximación', tone: 'bg-sky-500/20 text-sky-200' },
  work: { tag: (n) => String(n), label: 'Efectiva', tone: 'bg-white/10 text-zinc-100' },
  drop: { tag: (n) => `D${n}`, label: 'Descarga', tone: 'bg-violet-500/20 text-violet-200' },
};
const RIR = [
  { v: 0, label: 'Fallo' },
  { v: 1, label: '1' },
  { v: 2, label: '2' },
  { v: 3, label: '3' },
  { v: 4, label: '4+' },
];

function freshSets(r: Routine, api: WorkoutApi, version: Version = 'completa'): Record<string, FSet[]> {
  let firstKey = true;
  // MOD 06: las series salen de la versión elegida (los ejercicios fuera de la versión quedan con sus series base).
  const planned = new Map(exercisesOf(r, version).map((e) => [e.id, e]));
  return Object.fromEntries(
    r.exercises.map((base) => {
      const e = planned.get(base.id) ?? base;
      const ref = lastTime(api.logs, e.name);
      const target = Number.parseInt(e.reps, 10) || null;
      const work: FSet[] = Array.from({ length: Math.max(1, e.sets) }, (_, i) => {
        const prev = ref?.sets.filter((s) => s.kind !== 'drop')[i] ?? ref?.sets.at(-1);
        return { kind: 'work', weight: prev?.weight ?? e.weight ?? null, reps: prev?.reps ?? target, rir: null, done: false };
      });
      // Aproximación sugerida en los ⭐ (2 en el primero de la sesión, cuando el cuerpo está frío). Se puede quitar.
      const warm = e.key ? (firstKey ? 2 : 1) : 0;
      if (e.key) firstKey = false;
      const warmups: FSet[] = Array.from({ length: warm }, () => ({ kind: 'warmup', weight: null, reps: null, rir: null, done: false }));
      return [e.id, [...warmups, ...work]];
    }),
  );
}

function loadSession(r: Routine, version: Version, api: WorkoutApi): { s: Session; resumed: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(r.id)) ?? 'null') as Session | null;
    if (saved && saved.day === isoDay() && saved.routineId === r.id) {
      // Ejercicios agregados a la rutina después de empezar: también aparecen.
      const base = freshSets(r, api);
      return { s: { ...saved, sets: { ...base, ...saved.sets } }, resumed: true };
    }
  } catch {}
  return { s: { routineId: r.id, version, day: isoDay(), startedAt: Date.now(), pausedMs: 0, pausedAt: null, current: 0, sets: freshSets(r, api, version), rest: null }, resumed: false };
}

/* ── Controles ────────────────────────────────────────────────────────────────────── */

const Stepper: React.FC<{ value: number | null; step: number; unit: string; label: string; onChange: (v: number | null) => void; placeholder?: string }> = ({ value, step, unit, label, onChange, placeholder = '—' }) => (
  <div className="flex items-center gap-1.5">
    <button type="button" aria-label={`Menos ${label}`} onClick={() => onChange(Math.max(0, +((value ?? 0) - step).toFixed(2)))} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-[#fff] active:scale-95 hover:bg-white/[0.14]"><Minus className="h-5 w-5" /></button>
    <label className="flex min-w-0 flex-1 flex-col items-center">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-label={label}
        className="w-full bg-transparent text-center font-display text-3xl font-semibold tabular-nums text-[#fff] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-[11px] text-zinc-500">{unit}</span>
    </label>
    <button type="button" aria-label={`Más ${label}`} onClick={() => onChange(+((value ?? 0) + step).toFixed(2))} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-[#fff] active:scale-95 hover:bg-white/[0.14]"><Plus className="h-5 w-5" /></button>
  </div>
);

/* ── Workout Focus ────────────────────────────────────────────────────────────────── */

export const TrainMode: React.FC<{ r: Routine; version: Version; api: WorkoutApi; onClose: () => void; /** Lo que elegiste en «¿Cómo llegas?» (ej. menos series), visible todo el entreno. */ hint?: string }> = ({ r, version, api, onClose, hint }) => {
  const confirm = useConfirm();
  usePlanCtx();
  const [{ s: initial, resumed }] = useState(() => loadSession(r, version, api));
  const [s, setS] = useState<Session>(initial);
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState<number | null>(null);
  const [music, setMusic] = useState(false);
  const [finish, setFinish] = useState(false);
  const [tipHidden, setTipHidden] = useState(false);
  const [notice, setNotice] = useState(resumed ? 'Retomaste tu entreno donde lo dejaste.' : '');
  const rang = useRef(false);

  // Guardado instantáneo en el equipo (funciona sin conexión).
  const update = useCallback((f: (x: Session) => Session) => {
    setS((x) => {
      const n = f(x);
      try {
        localStorage.setItem(KEY(r.id), JSON.stringify(n));
      } catch {}
      return n;
    });
  }, [r.id]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY(r.id), JSON.stringify(s));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Pantalla encendida mientras entrenas (si el equipo lo permite).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const ask = () => nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    ask();
    const vis = () => document.visibilityState === 'visible' && ask();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, []);

  const list = exercisesOf(r, s.version);
  const idx = Math.min(s.current, Math.max(0, list.length - 1));
  const e = list[idx];
  const sets = (e && s.sets[e.id]) || [];
  const active = sets.findIndex((x) => !x.done);
  const open = editing ?? (active >= 0 ? active : null);
  const paused = s.pausedAt !== null;
  const elapsed = Math.floor(((s.pausedAt ?? now) - s.startedAt - s.pausedMs) / 1000);
  const restLeft = s.rest ? ('paused' in s.rest ? s.rest.left : Math.ceil((s.rest.until - now) / 1000)) : 0;

  // El descanso suena al terminar (una vez).
  useEffect(() => {
    if (!s.rest || 'paused' in s.rest || rang.current || now < s.rest.until) return;
    rang.current = true;
    playOnce('alarma');
    void notify('💪 ¡A la siguiente serie!', s.rest.name);
  }, [now, s.rest]);

  const workAll = list.flatMap((x) => (s.sets[x.id] ?? []).filter((y) => y.kind === 'work'));
  const workDone = workAll.filter((y) => y.done).length;
  const exDone = (x: RoutineExercise) => (s.sets[x.id] ?? []).filter((y) => y.kind === 'work').every((y) => y.done);
  const failures = list.flatMap((x) => s.sets[x.id] ?? []).filter((y) => y.done && y.rir === 0).length;
  const ref = e ? lastTime(api.logs, e.name) : null;

  const setSet = (i: number, p: Partial<FSet>) => update((x) => ({ ...x, sets: { ...x.sets, [e.id]: x.sets[e.id].map((y, k) => (k === i ? { ...y, ...p } : y)) } }));
  const counter = (kind: SetKind, i: number) => sets.slice(0, i + 1).filter((y) => y.kind === kind).length;

  const complete = (i: number) => {
    const set = sets[i];
    const done = !set.done;
    setSet(i, { done });
    setEditing(null);
    if (!done) return;
    const secs = set.kind === 'warmup' ? Math.min(60, Math.round((e.rest || 60) / 2)) : e.rest;
    if (secs > 0) {
      rang.current = false;
      update((x) => ({ ...x, rest: { until: Date.now() + secs * 1000, total: secs, name: e.name } }));
    }
  };
  const addSet = (kind: SetKind) => update((x) => {
    const cur = x.sets[e.id] ?? [];
    const lastWork = [...cur].reverse().find((y) => y.kind === 'work');
    const n: FSet = kind === 'warmup' ? { kind, weight: null, reps: null, rir: null, done: false } : kind === 'drop' ? { kind, weight: null, reps: null, rir: null, done: false } : { kind, weight: lastWork?.weight ?? null, reps: lastWork?.reps ?? null, rir: null, done: false };
    const at = kind === 'warmup' ? cur.findIndex((y) => y.kind !== 'warmup') : cur.length;
    const list2 = [...cur];
    list2.splice(at < 0 ? cur.length : at, 0, n);
    return { ...x, sets: { ...x.sets, [e.id]: list2 } };
  });
  const removeSet = (i: number) => {
    update((x) => ({ ...x, sets: { ...x.sets, [e.id]: x.sets[e.id].filter((_, k) => k !== i) } }));
    setEditing(null);
  };
  const go = (n: number) => {
    setEditing(null);
    update((x) => ({ ...x, current: Math.max(0, Math.min(list.length - 1, n)) }));
  };
  const togglePause = () => update((x) => {
    if (x.pausedAt === null) {
      const rest = x.rest && !('paused' in x.rest) ? { left: Math.max(0, Math.ceil((x.rest.until - Date.now()) / 1000)), total: x.rest.total, name: x.rest.name, paused: true as const } : x.rest;
      return { ...x, pausedAt: Date.now(), rest };
    }
    const rest = x.rest && 'paused' in x.rest ? { until: Date.now() + x.rest.left * 1000, total: x.rest.total, name: x.rest.name } : x.rest;
    return { ...x, pausedMs: x.pausedMs + (Date.now() - x.pausedAt), pausedAt: null, rest };
  });
  const shiftRest = (secs: number) => update((x) => {
    if (!x.rest) return x;
    if ('paused' in x.rest) return { ...x, rest: { ...x.rest, left: Math.max(0, x.rest.left + secs) } };
    rang.current = false;
    return { ...x, rest: { ...x.rest, until: Math.max(Date.now(), x.rest.until + secs * 1000) } };
  });
  const exit = () => {
    setNotice('');
    onClose();
  };

  return (
    <BodyPortal>
      <div role="dialog" aria-label={`Workout Focus: ${r.title}`} className="theme-fixed fixed inset-0 z-[96] flex flex-col bg-[#0b0c0f] text-left">
        {/* Encabezado: tiempo, progreso y controles */}
        <header className="border-b border-white/10 px-4 pb-3 pt-2.5">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 shrink-0 text-red-300" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{r.title}</p>
            <select
              value={s.version}
              aria-label="Versión de la rutina"
              onChange={(ev) => {
                const v = ev.target.value as Version;
                const fresh = freshSets(r, api, v);
                // Los ejercicios que aún no empiezas toman las series de la nueva versión; lo ya anotado se respeta.
                update((x) => ({ ...x, version: v, current: 0, sets: Object.fromEntries(Object.entries(x.sets).map(([id, l]) => [id, l.some((y) => y.done) ? l : fresh[id] ?? l])) }));
              }}
              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-xs font-semibold text-zinc-100 outline-none ring-1 ring-white/10"
            >
              {VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.emoji} {v.label}</option>)}
            </select>
            <button type="button" onClick={() => setMusic((m) => !m)} aria-label="Música y video" aria-pressed={music} className={`rounded-lg p-2 md:hidden ${music ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10'}`}><Music2 className="h-5 w-5" /></button>
            <button type="button" onClick={exit} aria-label="Salir (tu entreno queda guardado)" data-help="Salir: tu entreno queda guardado para seguir después" className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <p className={`font-display text-4xl font-semibold tabular-nums ${paused ? 'text-zinc-500' : 'text-[#fff]'}`}>{mmss(elapsed)}</p>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-[11px] text-zinc-400"><span>{workDone} de {workAll.length} series efectivas</span><span>~{minutesFor(r, s.version)} min</span></div>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all" style={{ width: `${workAll.length ? (workDone / workAll.length) * 100 : 0}%` }} /></span>
            </div>
            <button type="button" onClick={togglePause} aria-label={paused ? 'Seguir' : 'Pausar'} className={`flex h-12 w-12 items-center justify-center rounded-2xl ${paused ? 'bg-red-500 text-[#fff]' : 'bg-white/10 text-[#fff] hover:bg-white/15'}`}>{paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}</button>
            <button type="button" onClick={() => setFinish(true)} className="h-12 rounded-2xl bg-emerald-500 px-4 text-sm font-bold text-[#09090b] hover:bg-emerald-400">Terminar</button>
          </div>
          {/* Checklist de ejercicios */}
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
            {list.map((x, i) => {
              const all = s.sets[x.id] ?? [];
              const w = all.filter((y) => y.kind === 'work');
              const d = w.filter((y) => y.done).length;
              return (
                <button key={x.id} type="button" onClick={() => go(i)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${i === idx ? 'bg-red-500 text-[#fff] ring-red-400' : exDone(x) ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40' : 'text-zinc-300 ring-white/15'}`}>
                  {exDone(x) ? <Check className="h-3.5 w-3.5" /> : <span className="tabular-nums opacity-80">{d}/{w.length}</span>}
                  <span className="max-w-[140px] truncate">{x.name}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Ejercicio actual */}
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
            {hint && <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/30">🔋 {hint}</p>}
            {notice && <p className="mb-3 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-zinc-300">{notice}</p>}
            {paused && <p className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/30">⏸️ En pausa: el tiempo y el descanso están congelados.</p>}

            {s.rest && (
              <div className={`mb-4 rounded-3xl px-4 py-3 ring-1 ${restLeft > 0 ? 'bg-sky-500/10 ring-sky-400/40' : 'bg-emerald-500/15 ring-emerald-400/50'}`}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-4xl font-semibold tabular-nums text-[#fff]">{restLeft > 0 ? mmss(restLeft) : '¡Vamos!'}</span>
                  <span className="min-w-0 flex-1 text-xs text-zinc-300">{restLeft > 0 ? `Descanso sugerido · ${s.rest.name}` : 'Cuando estés listo, a la siguiente serie'}</span>
                </div>
                {restLeft > 0 && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, (restLeft / Math.max(1, s.rest.total)) * 100)}%` }} /></span>}
                <div className="mt-2 flex gap-2">
                  {restLeft > 0 && <button type="button" onClick={() => shiftRest(-15)} className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-semibold text-[#fff]">−15 s</button>}
                  {restLeft > 0 && <button type="button" onClick={() => shiftRest(30)} className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-semibold text-[#fff]">+30 s</button>}
                  <button type="button" onClick={() => update((x) => ({ ...x, rest: null }))} className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-semibold text-[#fff]">{restLeft > 0 ? 'Saltar' : 'OK'}</button>
                </div>
              </div>
            )}

            {e ? (
              <section>
                <div className="flex items-start gap-2">
                  {e.key && <Star className="mt-1 h-5 w-5 shrink-0 text-amber-300" fill="currentColor" />}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-semibold leading-tight text-white">{e.name}</h2>
                    <p className="mt-0.5 text-xs text-zinc-400"><span className={`mr-1.5 rounded-full px-1.5 py-px text-[9px] font-bold ${e.role === 'principal' ? 'bg-red-500/25 text-red-100' : 'bg-white/10 text-zinc-300'}`}>{e.role === 'principal' ? 'PRINCIPAL' : 'COMPLEMENTO'}</span>{e.sets} × {e.reps}{e.rest ? ` · descanso ~${e.rest} s` : ''}{e.muscles.length ? ` · ${e.muscles.map(muscleLabel).join(', ')}` : ''}</p>
                    {e.intensity && <p className="mt-0.5 text-[11px] text-sky-300">🎚️ {e.intensity}</p>}
                    {e.warn && <p className="mt-0.5 text-[11px] text-amber-300">⚠️ {e.warn}</p>}
                  </div>
                  {e.video && <a href={e.video} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-white/10">▶ Técnica</a>}
                </div>
                <p className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
                  {ref ? <>🔁 <b>Última vez</b> ({new Date(`${ref.day}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}): {ref.sets.map((x) => `${kg(x.weight)}×${x.reps ?? '—'}`).join(' · ')} kg×reps</> : '🆕 Primera vez con este ejercicio: anota lo que hagas y la próxima verás tu referencia.'}
                </p>

                <ul className="mt-4 space-y-2">
                  {sets.map((x, i) => {
                    const meta = KIND[x.kind];
                    const isOpen = open === i;
                    return (
                      <li key={i} className={`rounded-2xl ring-1 ${isOpen ? 'bg-white/[0.05] ring-red-400/50' : x.done ? 'bg-emerald-500/[0.07] ring-emerald-400/25' : 'bg-white/[0.02] ring-white/10'}`}>
                        {isOpen ? (
                          <div className="space-y-3 p-3">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${meta.tone}`}>{meta.tag(counter(x.kind, i))}</span>
                              <span className="flex-1 text-xs font-semibold text-zinc-400">Serie {meta.label.toLowerCase()}{x.kind === 'warmup' ? ' · más liviana, para preparar' : x.kind === 'drop' ? ' · baja el peso y sigue' : ''}</span>
                              <button type="button" aria-label="Quitar serie" onClick={() => removeSet(i)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Stepper label="Peso" unit="kg" step={2.5} value={x.weight} onChange={(v) => setSet(i, { weight: v })} />
                              <Stepper label="Repeticiones" unit="reps" step={1} value={x.reps} onChange={(v) => setSet(i, { reps: v === null ? null : Math.round(v) })} />
                            </div>
                            {x.kind !== 'warmup' && (
                              <div>
                                <p className="mb-1 text-[11px] text-zinc-500">¿Cuántas repeticiones te quedaban? (opcional)</p>
                                <div className="flex gap-1.5">
                                  {RIR.map((o) => (
                                    <button key={o.v} type="button" onClick={() => setSet(i, { rir: x.rir === o.v ? null : o.v })} className={`flex-1 rounded-xl py-2 text-sm font-semibold ring-1 ${x.rir === o.v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{o.label}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <button type="button" onClick={() => complete(i)} className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold ${x.done ? 'bg-white/10 text-zinc-200' : 'bg-emerald-500 text-[#09090b] hover:bg-emerald-400'}`}>
                              {x.done ? 'Marcar como no hecha' : <><Check className="h-5 w-5" /> Serie hecha</>}
                            </button>
                            {editing === i && x.done && <button type="button" onClick={() => setEditing(null)} className="w-full text-xs font-semibold text-zinc-400">Listo, guardar corrección</button>}
                          </div>
                        ) : (
                          <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.done ? 'bg-emerald-500 text-[#fff]' : meta.tone}`}>{x.done ? <Check className="h-4 w-4" /> : meta.tag(counter(x.kind, i))}</span>
                            <span className="flex-1 text-sm tabular-nums text-zinc-200">{kg(x.weight)} kg × {x.reps ?? '—'}{x.rir !== null && x.rir !== undefined ? <span className="text-zinc-500"> · {x.rir === 0 ? 'al fallo' : `${x.rir === 4 ? '4+' : x.rir} en reserva`}</span> : null}</span>
                            <span className="text-[11px] text-zinc-500">{x.done ? 'Corregir' : meta.label}</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => addSet('warmup')} className="rounded-xl bg-white/[0.04] py-2.5 text-xs font-semibold text-sky-200 ring-1 ring-white/10 hover:bg-white/[0.08]">＋ Aproximación</button>
                  <button type="button" onClick={() => addSet('work')} className="rounded-xl bg-white/[0.04] py-2.5 text-xs font-semibold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.08]">＋ Serie</button>
                  <button type="button" onClick={() => addSet('drop')} className="rounded-xl bg-white/[0.04] py-2.5 text-xs font-semibold text-violet-200 ring-1 ring-white/10 hover:bg-white/[0.08]">＋ Descarga</button>
                </div>

                {failures >= 3 && !tipHidden && (
                  <div className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-xs text-zinc-300 ring-1 ring-white/10">
                    <p className="font-semibold text-white">💡 Un dato</p>
                    <p className="mt-1">No hace falta llegar al fallo en cada serie: dejar 1 a 3 repeticiones en reserva suele bastar y cuida tu técnica y tu recuperación.</p>
                    <button type="button" onClick={() => setTipHidden(true)} className="mt-2 font-semibold text-zinc-400 hover:text-zinc-200">Entendido</button>
                  </div>
                )}

                <div className="mt-6 flex gap-2">
                  <button type="button" disabled={idx === 0} onClick={() => go(idx - 1)} className="flex h-12 items-center gap-1 rounded-2xl bg-white/[0.06] px-4 text-sm font-semibold text-zinc-200 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Anterior</button>
                  {idx < list.length - 1 ? (
                    <button type="button" onClick={() => go(idx + 1)} className={`flex h-12 flex-1 items-center justify-center gap-1 rounded-2xl text-sm font-bold ${exDone(e) ? 'bg-red-500 text-[#fff] hover:bg-red-400' : 'bg-white/[0.06] text-zinc-200'}`}>Siguiente: {list[idx + 1].name} <ChevronRight className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={() => setFinish(true)} className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-bold text-[#09090b] hover:bg-emerald-400">🏁 Terminar entreno</button>
                  )}
                </div>
              </section>
            ) : (
              <p className="text-sm text-zinc-400">Esta rutina no tiene ejercicios en la versión {s.version}.</p>
            )}
          </main>

          {/* Música y video: el reproductor de siempre (sigue sonando aunque lo escondas) */}
          <aside className={`fixed inset-x-0 bottom-0 z-[97] h-[70vh] border-t border-white/10 bg-[#0b0c0f] p-4 transition-transform md:static md:z-auto md:h-auto md:w-[42%] md:max-w-xl md:translate-y-0 md:border-l md:border-t-0 ${music ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="mb-2 flex items-center md:hidden">
              <p className="flex-1 text-sm font-semibold text-white">🎵 Música y video</p>
              <button type="button" onClick={() => setMusic(false)} className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-400">Ocultar</button>
            </div>
            <div className="h-[calc(100%-2rem)] md:h-full"><MediaPanel doing="mientras entrenas" store="mp-entreno-video" /></div>
          </aside>
        </div>

        {finish && (
          <Finish
            r={r}
            s={s}
            list={list}
            minutes={Math.max(1, Math.round(elapsed / 60))}
            api={api}
            onCancel={() => setFinish(false)}
            onDiscard={async () => {
              if (!(await confirm({ title: '¿Descartar este entreno?', message: 'Se borra lo anotado hoy y no se guarda en tu historial.', confirmLabel: 'Descartar', tone: 'danger' }))) return;
              try {
                localStorage.removeItem(KEY(r.id));
              } catch {}
              onClose();
            }}
            onDone={() => {
              try {
                localStorage.removeItem(KEY(r.id));
              } catch {}
              onClose();
            }}
          />
        )}
      </div>
    </BodyPortal>
  );
};

/* ── Terminar: resumen, «¿cómo te fue?» y guardar ─────────────────────────────────── */

const Finish: React.FC<{ r: Routine; s: Session; list: RoutineExercise[]; minutes: number; api: WorkoutApi; onCancel: () => void; onDiscard: () => void; onDone: () => void }> = ({ r, s, list, minutes, api, onCancel, onDiscard, onDone }) => {
  const [feel, setFeel] = useState<Feel | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const stats = useMemo(() => {
    const all = list.flatMap((e) => s.sets[e.id] ?? []);
    const done = all.filter((x) => x.done && x.kind !== 'warmup');
    const volume = done.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
    const keys = list.filter((e) => e.key);
    const keyDone = keys.filter((e) => (s.sets[e.id] ?? []).some((x) => x.done && x.kind !== 'warmup')).length;
    return { sets: done.length, volume, keys: keys.length, keyDone, any: all.some((x) => x.done) };
  }, [list, s.sets]);
  const save = async () => {
    setBusy(true);
    const exercises: LoggedExercise[] = list
      .map((e) => ({ name: e.name, muscles: e.muscles, key: e.key, sets: (s.sets[e.id] ?? []).map((x) => ({ weight: x.weight, reps: x.reps, done: x.done, kind: x.kind, rir: x.rir })) }))
      .filter((e) => e.sets.some((x) => x.done));
    const res = await api.addLog({ routine_id: r.id, day: s.day, title: r.title, core: r.core, version: s.version, exercises, quality_done: stats.keyDone, quality_total: stats.keys, minutes, feel, notes: note.trim() });
    setBusy(false);
    if (res.pending) setOffline(true);
    else onDone();
  };
  if (offline)
    return (
      <div className="fixed inset-0 z-[98] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md space-y-3 rounded-3xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <p className="text-lg font-semibold text-white">📴 Sin conexión</p>
          <p className="text-sm text-zinc-300">Tu entreno quedó guardado en este equipo y se sube solo la próxima vez que abras Workout Pro con internet.</p>
          <button type="button" onClick={onDone} className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-[#09090b]">Entendido</button>
        </div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-[98] flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-[#14161b] p-5 ring-1 ring-white/10">
        <p className="text-lg font-semibold text-white">🏁 Tu entreno</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/[0.04] py-2"><p className="font-display text-xl font-semibold text-white">{minutes}</p><p className="text-[11px] text-zinc-500">minutos</p></div>
          <div className="rounded-xl bg-white/[0.04] py-2"><p className="font-display text-xl font-semibold text-white">{stats.sets}</p><p className="text-[11px] text-zinc-500">series</p></div>
          <div className="rounded-xl bg-white/[0.04] py-2"><p className="font-display text-xl font-semibold text-white">{Math.round(stats.volume).toLocaleString('es-CL')}</p><p className="text-[11px] text-zinc-500">kg movidos</p></div>
        </div>
        <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-200">⭐ Calidad {stats.keyDone} de {stats.keys}<span className="block text-xs text-zinc-400">{stats.keyDone === stats.keys && stats.keys ? 'Hiciste todo lo clave. 💯' : stats.keyDone ? 'Lo que hiciste cuenta.' : 'Moverte ya cuenta.'}</span></p>
        <div>
          <p className="mb-1.5 text-xs text-zinc-400">¿Cómo te sentiste?</p>
          <div className="grid grid-cols-3 gap-2">
            {([['facil', '😌', 'Fácil'], ['bien', '💪', 'Bien'], ['duro', '🥵', 'Duro']] as const).map(([id, em, label]) => (
              <button key={id} type="button" onClick={() => setFeel(feel === id ? null : id)} className={`rounded-xl py-2.5 text-sm font-semibold ring-1 ${feel === id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-200 ring-white/15'}`}>{em} {label}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">Queda en tu historial. La próxima vez verás tus cargas de hoy como referencia; tú decides si subir.</p>
        </div>
        <textarea value={note} onChange={(x) => setNote(x.target.value)} rows={2} placeholder="¿Algo que anotar? (molestias, técnica, máquina ocupada…)" className="w-full resize-none rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10" />
        <div className="flex gap-2">
          <button type="button" disabled={busy || !stats.any} onClick={save} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-[#09090b] hover:bg-emerald-400 disabled:opacity-50">{busy ? 'Guardando…' : stats.any ? 'Guardar entreno' : 'Marca al menos una serie'}</button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.1]">Seguir</button>
        </div>
        <button type="button" onClick={onDiscard} className="w-full text-center text-[11px] font-semibold text-zinc-500 hover:text-rose-300">Descartar este entreno</button>
      </div>
    </div>
  );
};
