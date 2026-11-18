'use client';

import React, { useState } from 'react';
import { Phone, X } from 'lucide-react';
import {
  EMPTY, evaluate, FEELS, FLAGS, needsZone, WHAT, ZONES, zoneLabel,
  type Action, type Report, type Verdict,
} from '@/components/organiza/safetyData';

/**
 * 🛟 «Algo no anda bien» dentro del Workout Focus (MODIFICACIÓN 11, Emanuel 2026-11-18). Preguntas rápidas → reglas
 * fijas de `safetyData.ts` (sin IA, sin conexión) → qué hacer. Ante señales de alarma no hay botón para seguir.
 * Cuidar la zona en los próximos días es una propuesta: se aplica solo si tocas «Sí, cuidarla».
 */

export const ACTION_LABEL: Record<Action, string> = {
  terminar: 'Terminar el entreno (se guarda lo hecho)',
  llamar: 'Llamar al SAMU 131',
  saltar_zona: 'Saltar todo lo que carga esa zona',
  saltar: 'Saltar este ejercicio',
  bajar_carga: 'Bajar la carga (−15 %) en lo que falta',
  menos_series: 'Quitar una serie de este ejercicio',
  variante: 'Cambiar a otro ejercicio del mismo músculo',
  descanso_largo: 'Descansar 1 minuto más',
  version_recuperacion: 'Pasar a la versión 🌿 Recuperación',
  seguir: 'Seguir con cuidado',
};

const pill = (on: boolean) => `rounded-xl px-3 py-2 text-left text-sm font-semibold ring-1 transition ${on ? 'bg-amber-400 text-[#111] ring-amber-300' : 'text-zinc-200 ring-white/15 hover:bg-white/[0.06]'}`;
const yn = (on: boolean) => `flex-1 rounded-xl py-2 text-sm font-semibold ring-1 ${on ? 'bg-white text-[#111] ring-white' : 'text-zinc-300 ring-white/15'}`;

export const SafetyCheck: React.FC<{
  exercise: string | null;
  variants: string[];
  onAction: (a: Action, v: Verdict, r: Report, variant?: string) => void;
  onCaution: (v: Verdict, r: Report) => Promise<void>;
  cautionWhat: (v: Verdict) => string | null;
  onClose: (level: Verdict['level'] | null) => void;
}> = ({ exercise, variants, onAction, onCaution, cautionWhat, onClose }) => {
  const [r, setR] = useState<Report>(EMPTY);
  const [v, setV] = useState<Verdict | null>(null);
  const [pickVariant, setPickVariant] = useState(false);
  const [caution, setCaution] = useState<'ask' | 'saving' | 'done' | 'no'>('ask');
  const set = (p: Partial<Report>) => setR((x) => ({ ...x, ...p }));
  const ready = !!r.what && (!needsZone(r.what) || !!r.zone);
  const alarmOn = r.flags.some((f) => FLAGS.find((x) => x.id === f)?.alarm);

  return (
    <div className="fixed inset-0 z-[99] flex items-end justify-center bg-black/75 p-3 sm:items-center" onClick={() => onClose(v?.level ?? null)}>
      <div role="dialog" aria-label="Algo no anda bien" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#14161b] p-5 ring-1 ring-amber-400/30">
        <div className="mb-3 flex items-center gap-2">
          <p className="flex-1 text-lg font-semibold text-white">{v ? v.title : '🛟 ¿Qué está pasando?'}</p>
          <button type="button" aria-label="Cerrar" onClick={() => onClose(v?.level ?? null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        {!v ? (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">Pausé tu entreno. Responde lo que puedas: la app no diagnostica, solo te ayuda a decidir con reglas seguras.</p>
            <div className="grid grid-cols-2 gap-2">
              {WHAT.map((w) => <button key={w.id} type="button" onClick={() => set({ what: w.id })} className={pill(r.what === w.id)}>{w.emoji} {w.label}</button>)}
            </div>

            {needsZone(r.what) && (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Dónde?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ZONES.map((z) => <button key={z.id} type="button" onClick={() => set({ zone: z.id })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${r.zone === z.id ? 'bg-amber-400 text-[#111] ring-amber-300' : 'text-zinc-300 ring-white/15'}`}>{z.label}</button>)}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Cómo es?</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {FEELS.map((f) => (
                      <button key={f.id} type="button" onClick={() => set({ feel: r.feel === f.id ? null : f.id })} className={pill(r.feel === f.id)}>
                        {f.label}<span className={`block text-[10px] font-normal ${r.feel === f.id ? 'text-[#333]' : 'text-zinc-500'}`}>{f.help}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Qué tan fuerte? {r.intensity !== null && <span className="text-amber-300">{r.intensity}/10</span>}</p>
                  <div className="flex gap-1">
                    {Array.from({ length: 11 }, (_, i) => <button key={i} type="button" onClick={() => set({ intensity: i })} className={`h-8 flex-1 rounded-md text-[11px] font-bold ${r.intensity === i ? 'bg-amber-400 text-[#111]' : 'bg-white/[0.05] text-zinc-400'}`}>{i}</button>)}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Empeora al moverlo?</p>
                    <div className="flex gap-1.5"><button type="button" onClick={() => set({ worse: true })} className={yn(r.worse === true)}>Sí</button><button type="button" onClick={() => set({ worse: false })} className={yn(r.worse === false)}>No</button></div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Se pasa al parar?</p>
                    <div className="flex gap-1.5"><button type="button" onClick={() => set({ passes: true })} className={yn(r.passes === true)}>Sí</button><button type="button" onClick={() => set({ passes: false })} className={yn(r.passes === false)}>No</button></div>
                  </div>
                </div>
              </>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-zinc-300">¿Sientes alguna de estas? <span className="font-normal text-zinc-500">(marca todas las que correspondan)</span></p>
              <div className="space-y-1">
                {FLAGS.map((f) => {
                  const on = r.flags.includes(f.id);
                  return (
                    <label key={f.id} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${on ? (f.alarm ? 'bg-rose-500/20 text-rose-100 ring-rose-400/50' : 'bg-amber-500/15 text-amber-100 ring-amber-400/40') : 'text-zinc-300 ring-white/10'}`}>
                      <input type="checkbox" checked={on} onChange={() => set({ flags: on ? r.flags.filter((x) => x !== f.id) : [...r.flags, f.id] })} className="accent-rose-500" />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <button type="button" disabled={!ready && !alarmOn} onClick={() => setV(evaluate(r))} className="w-full rounded-xl bg-amber-400 py-3 text-sm font-bold text-[#111] hover:bg-amber-300 disabled:opacity-40">
              {ready || alarmOn ? 'Ver qué hacer' : r.what ? 'Elige dónde' : 'Elige qué pasa'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className={`space-y-1.5 rounded-2xl px-4 py-3 text-sm ring-1 ${v.level === 'alarma' ? 'bg-rose-500/15 text-rose-50 ring-rose-400/50' : v.level === 'zona' ? 'bg-amber-500/10 text-amber-50 ring-amber-400/40' : 'bg-white/[0.04] text-zinc-200 ring-white/10'}`}>
              {v.why.map((w) => <li key={w}>{w}</li>)}
            </ul>

            {pickVariant ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-zinc-300">Elige la variante (que no te provoque la molestia):</p>
                {variants.length ? variants.map((n) => <button key={n} type="button" onClick={() => onAction('variante', v, r, n)} className="block w-full rounded-xl bg-white/[0.05] px-3 py-2 text-left text-sm font-semibold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.1]">{n}</button>) : <p className="text-xs text-zinc-500">No hay otras variantes de este músculo en la biblioteca.</p>}
                <button type="button" onClick={() => setPickVariant(false)} className="text-xs text-zinc-400 underline">Volver</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {v.actions.map((a, i) =>
                  a === 'llamar' ? (
                    <a key={a} href="tel:131" className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 py-3 text-sm font-bold text-[#fff] hover:bg-rose-400"><Phone className="h-4 w-4" /> {ACTION_LABEL[a]}</a>
                  ) : (
                    <button
                      key={a}
                      type="button"
                      onClick={() => (a === 'variante' ? setPickVariant(true) : onAction(a, v, r))}
                      className={`w-full rounded-xl py-2.5 text-sm font-semibold ring-1 ${i === 0 || (v.level === 'alarma' && a === 'terminar') ? 'bg-white text-[#111] ring-white' : 'bg-white/[0.04] text-zinc-100 ring-white/10 hover:bg-white/[0.08]'}`}
                    >
                      {a === 'saltar_zona' && v.zone ? `Saltar todo lo que carga ${v.zone === 'musculo' ? 'ese músculo' : `tu ${zoneLabel(v.zone)}`}` : ACTION_LABEL[a]}
                    </button>
                  ),
                )}
              </div>
            )}

            {v.proposeCaution && cautionWhat(v) && (
              <div className="rounded-2xl bg-sky-500/10 px-4 py-3 text-sm text-sky-50 ring-1 ring-sky-400/30">
                {caution === 'done' ? (
                  <p>✅ Listo: los próximos 7 días los ejercicios que cargan {cautionWhat(v)} aparecen marcados. Lo quitas cuando quieras desde Workout Pro.</p>
                ) : caution === 'no' ? (
                  <p className="text-sky-200/80">No cambié nada de tus próximos entrenos.</p>
                ) : (
                  <>
                    <p>¿Quieres que en tus <b>próximos entrenos (7 días)</b> marque los ejercicios que cargan {cautionWhat(v)}, para hacerlos livianos o saltarlos?</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={caution === 'saving'} onClick={async () => { setCaution('saving'); await onCaution(v, r); setCaution('done'); }} className="flex-1 rounded-xl bg-sky-500 py-2 text-sm font-bold text-[#fff] disabled:opacity-50">Sí, cuidarla</button>
                      <button type="button" onClick={() => setCaution('no')} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-200">No</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {v.level !== 'alarma' && <button type="button" onClick={() => setV(null)} className="w-full text-center text-xs text-zinc-500 underline">Cambiar mis respuestas</button>}
            <p className="text-[10px] text-zinc-600">{exercise ? `Pasó en: ${exercise}. ` : ''}Queda anotado en las notas de este entreno. Esto no es un diagnóstico médico.</p>
          </div>
        )}
      </div>
    </div>
  );
};
