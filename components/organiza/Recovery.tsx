'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useDb } from '@/components/organiza/db';
import { useChecks } from '@/components/organiza/useHorario';
import { nightsOf, sleepHours } from '@/components/organiza/SleepLog';
import { connectHealth, healthState, readHealth, type HealthState } from '@/components/organiza/appleHealth';
import { muscleLabel, type Routine, type Version, type WorkoutLog } from '@/components/organiza/workoutData';
import {
  ACTIVITY_KINDS, advise, FLAGS, OPTION_LABEL,
  type Activity, type Advice, type Checkin, type Flag, type Level, type Night, type Option, type Pain,
} from '@/components/organiza/recoveryData';

/**
 * 🔋 Actividad y recuperación (MODIFICACIÓN 05, 2026-11-18). Sueño = registro «Dormir» de Organiza (no se duplica).
 * «¿Cómo llegas?» se guarda en organiza_readiness; la actividad extra en organiza_activities (manual o Apple Salud).
 * La recomendación sale de reglas fijas (recoveryData.advise), funciona sin conexión y siempre explica el porqué.
 */

const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const field = 'w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60';
const TONE: Record<Level, string> = {
  normal: 'bg-emerald-500/10 text-emerald-100 ring-emerald-400/30',
  ajustar: 'bg-amber-500/10 text-amber-100 ring-amber-400/30',
  suave: 'bg-sky-500/10 text-sky-100 ring-sky-400/30',
  cuidado: 'bg-orange-500/10 text-orange-100 ring-orange-400/40',
  alerta: 'bg-rose-500/15 text-rose-100 ring-rose-400/50',
};

type ActivityRow = Activity & { id: string; source?: string; notes?: string; external_id?: string | null };
type Readiness = Checkin & { id?: string; day: string; level: Level; decision: string; created_at?: string };

/* ── Datos (con cola sin conexión) ────────────────────────────────────────────────── */

const PENDING = 'wp-pending-recovery';
type Pending = { table: string; row: Record<string, unknown> };
const readQ = (): Pending[] => { try { return JSON.parse(localStorage.getItem(PENDING) ?? '[]'); } catch { return []; } };
const writeQ = (q: Pending[]) => { try { if (q.length) localStorage.setItem(PENDING, JSON.stringify(q)); else localStorage.removeItem(PENDING); } catch {} };

export function useRecovery() {
  const db = useDb();
  const checks = useChecks();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    // Primero sube lo que quedó guardado sin conexión.
    const q = readQ();
    const still: Pending[] = [];
    for (const p of q) if (!(await db.insert(p.table, p.row).catch(() => []))[0]) still.push(p);
    writeQ(still);
    setPending(still.length);
    const since = iso(new Date(Date.now() - 14 * 86_400_000));
    const [a, r] = await Promise.all([db.select<ActivityRow>('organiza_activities').catch(() => []), db.select<Readiness>('organiza_readiness').catch(() => [])]);
    setActivities([...a.filter((x) => x.day >= since), ...still.filter((p) => p.table === 'organiza_activities').map((p, i) => ({ ...(p.row as ActivityRow), id: `pendiente-${i}` }))].sort((x, y) => (x.day < y.day ? 1 : -1)));
    setReadiness(r.filter((x) => x.day >= since).sort((x, y) => ((x.created_at ?? '') < (y.created_at ?? '') ? 1 : -1)));
    setReady(true);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  const insert = useCallback(async (table: string, row: Record<string, unknown>) => {
    const [made] = await db.insert<Record<string, unknown>>(table, row).catch(() => [] as Record<string, unknown>[]);
    if (made) return made;
    writeQ([...readQ(), { table, row }]);
    setPending((n) => n + 1);
    return { ...row, id: `pendiente-${Date.now()}` };
  }, [db]);

  const addActivity = useCallback(async (a: Omit<ActivityRow, 'id'>) => {
    const made = (await insert('organiza_activities', { ...a, source: 'manual' })) as ActivityRow;
    setActivities((l) => [made, ...l].sort((x, y) => (x.day < y.day ? 1 : -1)));
  }, [insert]);
  const removeActivity = useCallback(async (id: string) => {
    setActivities((l) => l.filter((x) => x.id !== id));
    if (!id.startsWith('pendiente')) await db.remove('organiza_activities', { id });
  }, [db]);
  const saveHealth = useCallback(async (rows: Record<string, unknown>[]) => {
    let n = 0;
    for (const r of rows) if (await db.upsert('organiza_activities', r, 'owner_id,external_id').catch(() => false)) n++;
    await load();
    return n;
  }, [db, load]);
  const saveReadiness = useCallback(async (r: Readiness) => {
    const made = (await insert('organiza_readiness', r as unknown as Record<string, unknown>)) as unknown as Readiness;
    setReadiness((l) => [made, ...l]);
  }, [insert]);

  // Sueño del registro «Dormir» (el día de la noche = el día en que despiertas).
  const nights: Night[] = useMemo(() => nightsOf(checks.checks).map((c) => ({ day: c.day, hours: sleepHours(c.value.bed, c.value.wake), quality: c.value.quality ?? null })), [checks.checks]);
  const usualSleep = useMemo(() => {
    const h = nights.slice(-14).map((x) => x.hours).filter((x): x is number => x !== null);
    return h.length >= 4 ? h.reduce((a, b) => a + b, 0) / h.length : undefined;
  }, [nights]);
  const today = iso();
  const todayCheck = readiness.find((r) => r.day === today) ?? null;
  return { ready: ready && checks.ready, activities, readiness, todayCheck, nights, usualSleep, pending, addActivity, removeActivity, saveHealth, saveReadiness, reload: load };
}
export type RecoveryApi = ReturnType<typeof useRecovery>;

/* ── «¿Cómo llegas hoy?» ──────────────────────────────────────────────────────────── */

const ENERGY = [
  { v: 1, e: '🪫', l: 'Muy baja' },
  { v: 2, e: '😮‍💨', l: 'Baja' },
  { v: 3, e: '🙂', l: 'Normal' },
  { v: 4, e: '💪', l: 'Buena' },
  { v: 5, e: '⚡', l: 'Excelente' },
];
const SORE = [
  { v: 0, l: 'Nada' },
  { v: 1, l: 'Poco' },
  { v: 2, l: 'Medio' },
  { v: 3, l: 'Mucho' },
];

export const CheckinModal: React.FC<{ api: RecoveryApi; logs: WorkoutLog[]; routine: Routine | null; muscles: string[]; onDecide: (o: Option, advice: Advice) => void; onSkip?: () => void; onClose: () => void }> = ({ api, logs, routine, muscles, onDecide, onSkip, onClose }) => {
  const [c, setC] = useState<Checkin>({ energy: null, soreness: null, pain: 'no', pain_zone: '', flags: [] });
  const [result, setResult] = useState<Advice | null>(null);
  const evaluate = () => setResult(advise({ today: iso(), muscles, checkin: c, nights: api.nights, activities: api.activities, logs, usualSleep: api.usualSleep }));
  const decide = async (o: Option) => {
    if (!result) return;
    await api.saveReadiness({ ...c, day: iso(), level: result.level, decision: o });
    onDecide(o, result);
  };
  const toggleFlag = (f: Flag) => setC((x) => ({ ...x, flags: x.flags.includes(f) ? x.flags.filter((y) => y !== f) : [...x.flags, f] }));
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[95] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Cómo llegas hoy" onClick={(e) => e.stopPropagation()} className="theme-fixed flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-lg sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="flex-1 font-display text-lg font-semibold text-white">🔋 ¿Cómo llegas hoy?</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {!result ? (
              <>
                {routine && <p className="text-xs text-zinc-400">Hoy toca: <b className="text-zinc-200">{routine.title}</b>{muscles.length ? ` (${muscles.slice(0, 4).map(muscleLabel).join(', ')})` : ''}</p>}
                <div>
                  <p className="mb-2 text-sm font-semibold text-white">Tu energía</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ENERGY.map((x) => <button key={x.v} type="button" onClick={() => setC({ ...c, energy: x.v })} className={`rounded-2xl py-2.5 text-center ring-1 ${c.energy === x.v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-200 ring-white/15 hover:bg-white/[0.06]'}`}><span className="block text-2xl">{x.e}</span><span className="text-[10px] font-semibold">{x.l}</span></button>)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Agujetas (cansancio muscular)</p>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">{SORE.map((x) => <button key={x.v} type="button" onClick={() => setC({ ...c, soreness: x.v })} className={`rounded-xl py-2 text-sm font-semibold ring-1 ${c.soreness === x.v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{x.l}</button>)}</div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">¿Algún dolor?</p>
                  <p className="text-[11px] text-zinc-500">Distinto de las agujetas: es un dolor puntual en una zona.</p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {([['no', 'No'], ['molestia', 'Molestia leve'], ['agudo', 'Dolor agudo']] as [Pain, string][]).map(([v, l]) => <button key={v} type="button" onClick={() => setC({ ...c, pain: v })} className={`rounded-xl py-2 text-sm font-semibold ring-1 ${c.pain === v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{l}</button>)}
                  </div>
                  {c.pain !== 'no' && <input value={c.pain_zone} onChange={(e) => setC({ ...c, pain_zone: e.target.value })} placeholder="¿Dónde? Ej.: rodilla derecha" className={`${field} mt-2`} />}
                </div>
                <div className="rounded-2xl bg-rose-500/[0.06] p-3 ring-1 ring-rose-400/25">
                  <p className="text-sm font-semibold text-white">¿Sientes algo de esto?</p>
                  <div className="mt-2 space-y-1.5">
                    {FLAGS.map((f) => <label key={f.id} className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={c.flags.includes(f.id)} onChange={() => toggleFlag(f.id)} className="h-4 w-4 accent-rose-500" />{f.label}</label>)}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={`rounded-2xl px-4 py-3 text-base font-semibold ring-1 ${TONE[result.level]}`}>{result.summary}</div>
                <ul className="space-y-2">
                  {result.reasons.map((r, i) => <li key={i} className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/10">{r.text}</li>)}
                  {!result.reasons.length && <li className="text-sm text-zinc-400">Nada que ajustar con lo que sabemos hoy.</li>}
                </ul>
                <p className="text-[11px] text-zinc-500">Es una sugerencia con lo que registraste, no un diagnóstico.{result.level !== 'alerta' ? ' Tú decides.' : ''}</p>
                <div className="grid gap-2">
                  {result.options.map((o, i) => <button key={o} type="button" onClick={() => decide(o)} className={`rounded-xl py-3 text-sm font-bold ${i === 0 ? 'bg-red-500 text-[#fff] hover:bg-red-400' : 'bg-white/[0.06] text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.1]'}`}>{OPTION_LABEL[o]}</button>)}
                </div>
              </>
            )}
          </div>
          {!result && (
            <div className="space-y-2 border-t border-white/10 px-4 py-3">
              <button type="button" disabled={c.energy === null} onClick={evaluate} className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-40">Ver mi recomendación</button>
              {onSkip && <button type="button" onClick={onSkip} className="w-full text-xs font-semibold text-zinc-500 hover:text-zinc-300">Entrenar sin registrar</button>}
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Actividad extra ──────────────────────────────────────────────────────────────── */

const ActivityForm: React.FC<{ onSave: (a: Omit<ActivityRow, 'id'>) => void; onClose: () => void }> = ({ onSave, onClose }) => {
  const [kind, setKind] = useState('bici');
  const [day, setDay] = useState(iso());
  const [minutes, setMinutes] = useState('');
  const [intensity, setIntensity] = useState(2);
  const [km, setKm] = useState('');
  const m = Number(minutes);
  return (
    <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap gap-1.5">{ACTIVITY_KINDS.map((k) => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${kind === k.id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{k.emoji} {k.label}</button>)}</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-zinc-400">Día<input type="date" value={day} max={iso()} onChange={(e) => e.target.value && setDay(e.target.value)} className={`${field} mt-1 px-2`} /></label>
        <label className="text-[11px] text-zinc-400">Minutos<input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="90" className={`${field} mt-1`} /></label>
        <label className="text-[11px] text-zinc-400">Km (opcional)<input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="—" className={`${field} mt-1`} /></label>
      </div>
      <div className="flex gap-1.5">{([[1, 'Suave'], [2, 'Moderada'], [3, 'Intensa']] as [number, string][]).map(([v, l]) => <button key={v} type="button" onClick={() => setIntensity(v)} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 ${intensity === v ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{l}</button>)}</div>
      <div className="flex gap-2">
        <button type="button" disabled={!(m > 0)} onClick={() => onSave({ day, kind, minutes: Math.round(m), intensity, distance_km: km.trim() ? Number(km.replace(',', '.')) || null : null, steps: null })} className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold text-[#fff] disabled:opacity-40">Guardar actividad</button>
        <button type="button" onClick={onClose} className="rounded-xl px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]">Cancelar</button>
      </div>
    </div>
  );
};

/* ── Bloque en Workout Pro ────────────────────────────────────────────────────────── */

export const RecoveryBlock: React.FC<{ api: RecoveryApi; logs: WorkoutLog[]; routine: Routine | null; version: Version; onCheckin: () => void }> = ({ api, logs, routine, onCheckin }) => {
  const [adding, setAdding] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    healthState().then(setHealth);
  }, []);
  const today = iso();
  const night = api.nights.find((n) => n.day === today);
  const muscles = routine ? [...new Set(routine.exercises.flatMap((e) => e.muscles))] : [];
  const tc = api.todayCheck;
  const adv = tc ? advise({ today, muscles, checkin: tc, nights: api.nights, activities: api.activities, logs, usualSleep: api.usualSleep }) : null;
  const recent = api.activities.filter((a) => a.day >= iso(new Date(Date.now() - 6 * 86_400_000)));
  const syncHealth = async () => {
    setSyncing(true);
    setMsg('');
    const p = await connectHealth();
    if (!p.ok) {
      setMsg(p.text);
      setSyncing(false);
      return;
    }
    const r = await readHealth(7);
    const n = r.rows.length ? await api.saveHealth(r.rows as unknown as Record<string, unknown>[]) : 0;
    setMsg(`${r.text}${r.rows.length ? ` Guardados: ${n}.` : ''}${p.denied.length ? ` ${p.text}` : ''}`);
    setSyncing(false);
  };
  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-semibold text-white">🔋 Cómo llegas hoy</h2>
        <button type="button" onClick={onCheckin} className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400">{tc ? 'Registrar de nuevo' : '¿Cómo llegas?'}</button>
      </div>
      {api.pending > 0 && <p className="mb-2 text-[11px] text-amber-300">📴 {api.pending} {api.pending === 1 ? 'registro guardado' : 'registros guardados'} en este equipo: se suben solos cuando vuelva la conexión.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
          <p className="text-[11px] text-zinc-400">😴 Anoche</p>
          <p className="text-sm font-semibold text-white">{night?.hours != null ? `${String(night.hours).replace('.', ',')} h${night.quality ? ` · ${'⭐'.repeat(night.quality)}` : ''}` : 'Sin registro'}</p>
          <p className="text-[10px] text-zinc-500">{night ? 'De tu registro «Dormir» del Horario' : 'Anótalo en «Dormir» del Horario'}{api.usualSleep ? ` · sueles dormir ${String(+api.usualSleep.toFixed(1)).replace('.', ',')} h` : ''}</p>
        </div>
        <div className={`rounded-2xl px-3 py-2.5 ring-1 ${adv ? TONE[adv.level] : 'bg-white/[0.04] ring-white/10'}`}>
          <p className="text-[11px] opacity-80">🧭 Hoy{routine ? ` · ${routine.title}` : ''}</p>
          <p className="text-sm font-semibold">{adv ? adv.summary : routine ? 'Registra cómo llegas para tu recomendación.' : 'Hoy es de descanso en tu plan.'}</p>
          {tc && <p className="text-[10px] opacity-80">Elegiste: {OPTION_LABEL[tc.decision as Option] ?? '—'}</p>}
        </div>
      </div>
      {adv && adv.reasons.length > 0 && <ul className="mt-2 space-y-1 text-xs text-zinc-300">{adv.reasons.map((r, i) => <li key={i}>• {r.text}</li>)}</ul>}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold text-white">🚴 Actividad fuera del entreno <span className="text-[11px] font-normal text-zinc-500">(7 días)</span></p>
          <button type="button" onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/[0.14]"><Plus className="h-3.5 w-3.5" /> Agregar</button>
        </div>
        {adding && <ActivityForm onSave={async (a) => { await api.addActivity(a); setAdding(false); }} onClose={() => setAdding(false)} />}
        {recent.length ? (
          <ul className="mt-1.5 space-y-1">
            {recent.map((a) => {
              const k = ACTIVITY_KINDS.find((x) => x.id === a.kind);
              return (
                <li key={a.id} className="group flex items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-1.5 text-xs ring-1 ring-white/5">
                  <span>{a.kind === 'pasos' ? '👣' : k?.emoji ?? '✨'}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{a.kind === 'pasos' ? `${(a.steps ?? 0).toLocaleString('es-CL')} pasos${a.distance_km ? ` · ${String(a.distance_km).replace('.', ',')} km` : ''}` : `${k?.label ?? a.kind} · ${a.minutes} min${a.distance_km ? ` · ${String(a.distance_km).replace('.', ',')} km` : ''}${a.intensity ? ` · ${['', 'suave', 'moderada', 'intensa'][a.intensity]}` : ''}`}</span>
                  <span className="text-zinc-500">{new Date(`${a.day}T12:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}{a.source === 'apple_health' ? ' · 🍎' : ''}</span>
                  {a.source !== 'apple_health' && <button type="button" aria-label="Borrar actividad" onClick={() => api.removeActivity(a.id)} className="text-zinc-600 opacity-0 hover:text-rose-300 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                </li>
              );
            })}
          </ul>
        ) : (
          !adding && <p className="mt-1 text-xs text-zinc-500">Sin actividad extra anotada. Si saliste en bici o a caminar harto, anótalo: ayuda a cuidar tus piernas.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-400 ring-1 ring-white/5">
          <span className="text-base">🍎</span>
          <span className="min-w-0 flex-1">{health ? health.text : 'Revisando Apple Salud…'}</span>
          {health?.kind === 'ready' && <button type="button" disabled={syncing} onClick={syncHealth} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white hover:bg-white/[0.14] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Leyendo…' : 'Traer de Apple Salud'}</button>}
        </div>
        {msg && <p className="mt-1.5 text-[11px] text-zinc-300">{msg}</p>}
      </div>
    </section>
  );
};
