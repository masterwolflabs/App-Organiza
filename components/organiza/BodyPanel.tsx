'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, X } from 'lucide-react';
import { LIBRARY, MUSCLES, muscleLabel, isoDay, type MuscleId, type WorkoutApi } from '@/components/organiza/workoutData';
import { fmt, fmtDay, useBodyLogs, type View } from '@/components/organiza/bodyData';
import { Photo } from '@/components/organiza/BodyProfile';
import { muscleStates, shapeAt, timeline, SHAPE_LABEL, type MuscleState, type ShapeKey } from '@/components/organiza/muscleState';
import type { View3D } from '@/components/organiza/BodyMap3D';

const BodyMap3D = dynamic(() => import('@/components/organiza/BodyMap3D').then((m) => m.BodyMap3D), { ssr: false, loading: () => <div className="h-[420px]" /> });

/**
 * 🧍 Tu cuerpo (MODIFICACIÓN 09, Emanuel 2026-11-18): el mono con TUS proporciones (desde el perfil físico) y cada
 * músculo pintado por estímulo, frecuencia o recuperación, en la fecha que elijas. Todo es ESTIMADO a partir de tus
 * entrenos: no es crecimiento ni medición médica. Tu foto de esa fecha se puede ver al lado (tapada hasta «Ver»).
 * Cálculos en `muscleState.ts`; deformación y colores en `body3d.ts`.
 */

type Mode = 'estimulo' | 'frecuencia' | 'recuperacion';
const MODES: { id: Mode; label: string; help: string }[] = [
  { id: 'estimulo', label: '🔥 Estímulo', help: 'Cuánto trabajaste cada músculo en los 7 días hasta la fecha (series × intensidad).' },
  { id: 'frecuencia', label: '🔁 Frecuencia', help: 'Cuántos días por semana lo entrenas (promedio de 4 semanas).' },
  { id: 'recuperacion', label: '🔋 Recuperación', help: 'Si el músculo aún se está recuperando de su última sesión fuerte.' },
];
const VIEWS3D: { id: View3D; label: string; photo: View }[] = [
  { id: 'frente', label: 'Frente', photo: 'frontal' },
  { id: 'lado', label: 'Lado', photo: 'lateral' },
  { id: 'espalda', label: 'Espalda', photo: 'posterior' },
];

// Una sola tinta por modo, de claro a oscuro (estímulo naranja, frecuencia azul); recuperación: ámbar / verde.
const STIM = ['', '#fdba74', '#f97316', '#c2410c'];
const FREQ = (w: number) => (w <= 0 ? '' : w < 1 ? '#7dd3fc' : w < 2 ? '#0ea5e9' : '#0369a1');
const REC = { recuperando: '#f59e0b', listo: '#22c55e', sin_dato: '' } as const;
const IDS = MUSCLES.map((m) => m.id);
const n1 = (x: number) => String(+x.toFixed(1)).replace('.', ',');

function colorOf(mode: Mode, s: MuscleState) {
  if (mode === 'estimulo') return STIM[s.level] || null;
  if (mode === 'frecuencia') return FREQ(s.perWeek) || null;
  return REC[s.recovery] || null;
}
function describe(mode: Mode, s: MuscleState) {
  const name = muscleLabel(s.id);
  if (mode === 'estimulo') return `${name} · ${n1(s.sets)} series directas en 7 días`;
  if (mode === 'frecuencia') return `${name} · ${n1(s.perWeek)} días por semana`;
  if (s.recovery === 'recuperando') return `${name} · recuperando (faltan ~${s.hoursLeft} h)`;
  return `${name} · ${s.recovery === 'listo' ? 'listo para entrenar' : 'sin sesiones fuertes en 4 semanas'}`;
}
const Dot: React.FC<{ c: string; label: string }> = ({ c, label }) => (
  <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: c }} /> {label}</span>
);

export const BodyPanel: React.FC<{ api: WorkoutApi }> = ({ api }) => {
  const body = useBodyLogs();
  const today = isoDay();
  const [mode, setMode] = useState<Mode>('estimulo');
  const [view, setView] = useState<View3D>('frente');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const stops = useMemo(() => timeline(today, [...new Set(body.logs.map((l) => l.day))]), [today, body.logs]);
  const [idx, setIdx] = useState<number | null>(null);
  const at = stops[idx ?? stops.length - 1] ?? stops[stops.length - 1];
  const day = at?.day ?? today;
  const isToday = day === today;

  const states = useMemo(() => muscleStates(api.logs, day, IDS, isToday ? Date.now() : undefined), [api.logs, day, isToday]);
  const byId = useMemo(() => Object.fromEntries(states.map((s) => [s.id, s])), [states]);
  const colors = useMemo(() => Object.fromEntries(states.map((s) => [s.id, colorOf(mode, s)])), [states, mode]);
  const shape = useMemo(() => shapeAt(body.logs as never, day), [body.logs, day]);
  const photoLog = useMemo(() => {
    const want = VIEWS3D.find((v) => v.id === view)!.photo;
    return body.logs.filter((l) => l.day <= day && l.photos?.[want]).sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null;
  }, [body.logs, day, view]);
  const photoView = VIEWS3D.find((v) => v.id === view)!.photo;
  const sel = muscle ? byId[muscle] : null;
  const anyShape = shape.measured.some((m) => m.key !== 'height');

  const legend =
    mode === 'estimulo' ? (<><Dot c={STIM[3]} label="Alto (más de 10 series)" /><Dot c={STIM[2]} label="Medio (5–10)" /><Dot c={STIM[1]} label="Bajo (1–4)" /><Dot c="#d8c9c3" label="Nada" /></>)
    : mode === 'frecuencia' ? (<><Dot c="#0369a1" label="2+ días/sem" /><Dot c="#0ea5e9" label="1–2" /><Dot c="#7dd3fc" label="Menos de 1" /><Dot c="#d8c9c3" label="Nada" /></>)
    : (<><Dot c={REC.recuperando} label="Recuperando" /><Dot c={REC.listo} label="Listo" /><Dot c="#d8c9c3" label="Sin sesiones fuertes" /></>);

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${on ? 'bg-white text-[#111] ring-white' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`;

  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <h2 className="font-display text-xl font-semibold text-white">🧍 Tu cuerpo</h2>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Qué mostrar">
        {MODES.map((m) => <button key={m.id} type="button" data-help={m.help} onClick={() => setMode(m.id)} className={chip(mode === m.id)}>{m.label}</button>)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Vista">
        {VIEWS3D.map((v) => <button key={v.id} type="button" onClick={() => setView(v.id)} className={chip(view === v.id)}>{v.label}</button>)}
      </div>

      <div className={`mt-2 grid gap-2 ${showPhoto && photoLog ? 'grid-cols-2' : ''}`}>
        <BodyMap3D
          counts={api.counts}
          colors={colors}
          ratios={shape.ratios}
          view={view}
          picked={muscle}
          onPick={setMuscle}
          height={showPhoto && photoLog ? 320 : 420}
          hoverText={(m) => (byId[m] ? describe(mode, byId[m]) : muscleLabel(m))}
          legend={legend}
        />
        {showPhoto && photoLog && (
          <div className="flex flex-col gap-1">
            <Photo path={photoLog.photos[photoView]} show label={`${VIEWS3D.find((v) => v.id === view)!.label} · ${fmtDay(photoLog.day)}`} className="h-[320px] w-full" />
            <p className="text-center text-[10px] text-zinc-500">Tu foto más cercana a esta fecha (privada).</p>
          </div>
        )}
      </div>

      {/* Línea de fechas: semanas y fechas del perfil físico */}
      {stops.length > 1 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-semibold text-zinc-200">{at.label}{!isToday && <span className="font-normal text-zinc-500"> · {fmtDay(day)}</span>}</span>
            {!isToday && <button type="button" onClick={() => setIdx(null)} className="text-zinc-400 underline">Volver a hoy</button>}
          </div>
          <input type="range" min={0} max={stops.length - 1} step={1} value={idx ?? stops.length - 1} onChange={(e) => setIdx(+e.target.value)} aria-label="Fecha" className="mt-1 w-full accent-orange-500" />
          <p className="text-[10px] text-zinc-500">Mueve la línea para ver cómo estabas en cada semana. 📏 = día con medidas.</p>
        </div>
      )}

      {/* Medido vs estimado */}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {shape.measured.filter((m) => m.key !== 'height').map((m) => (
          <span key={m.key} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-200 ring-1 ring-emerald-400/30">📏 Medido: {SHAPE_LABEL[m.key as ShapeKey].toLowerCase()} {fmt(m.value, 'cm')} ({fmtDay(m.day)})</span>
        ))}
        {shape.estimated.length > 0 && (
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-zinc-400 ring-1 ring-white/10">≈ Estimado: {shape.estimated.map((k) => SHAPE_LABEL[k].toLowerCase()).join(', ')} (forma estándar del modelo)</span>
        )}
        {!shape.measured.some((m) => m.key === 'height') && anyShape && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-200 ring-1 ring-amber-400/30">Falta tu estatura para usar tus medidas en el mono</span>}
        {photoLog && (
          <button type="button" onClick={() => setShowPhoto((x) => !x)} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.1]">
            {showPhoto ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {showPhoto ? 'Ocultar foto' : 'Ver mi foto al lado'}
          </button>
        )}
      </div>
      {!shape.measured.length && <p className="mt-1 text-[11px] text-zinc-500">Registra tu estatura y medidas en 📏 Perfil físico y el mono toma tus proporciones.</p>}

      {sel && muscle && (
        <div className="mt-3 rounded-xl bg-black/25 p-3 text-xs text-zinc-300">
          <p className="mb-1 flex items-center justify-between font-semibold text-white">{muscleLabel(muscle)} <button type="button" aria-label="Cerrar" onClick={() => setMuscle(null)}><X className="h-3.5 w-3.5" /></button></p>
          <p>🔥 {n1(sel.sets)} series directas en 7 días · puntaje {n1(sel.score)}</p>
          <p>🔁 {n1(sel.perWeek)} días por semana (últimas 4 semanas)</p>
          <p>🔋 {sel.recovery === 'recuperando' ? `Recuperando: faltan ~${sel.hoursLeft} h` : sel.recovery === 'listo' ? 'Listo para entrenar' : 'Sin sesiones fuertes en 4 semanas'}</p>
          <p className="mt-1 text-zinc-400">Clave: {LIBRARY[muscle].filter((e) => e.key).map((e) => e.name).join(' · ')}</p>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[10px] leading-snug text-zinc-500 ring-1 ring-white/5">
        ⚠️ Los colores muestran tu <b>entrenamiento estimado</b> (series, intensidad, frecuencia y descanso), <b>no</b> crecimiento muscular ni una medición médica. Las proporciones salen solo de las medidas que registraste; lo demás es la forma estándar del modelo.
      </p>
    </section>
  );
};
