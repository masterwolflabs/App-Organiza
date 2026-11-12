'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { iso, refOf, type Check, type Item } from '@/components/organiza/model';
import type { useChecks } from '@/components/organiza/useHorario';

/**
 * 😴 Registro del sueño (Daily «dormir-detectado», Emanuel 2026-11-10/12). Siempre se guarda en la tarea
 * «Dormir» (la que arma el Sueño del horario), aunque se anote desde «Levantarse» o desde el focus de la
 * mañana: así hay UNA historia. Por noche (el día en que despiertas): a qué hora te acostaste y despertaste
 * (calcula las horas), ⭐ calidad 1-5, horas bien dormidas, 🌙 despertares y 💭 lo que soñaste.
 * Resumen: barras de las últimas 14 noches, promedio vs la meta y diario de sueños.
 */
export const SLEEP_REF = refOf('Dormir');
type Checks = ReturnType<typeof useChecks>;

export const sleepHours = (bed?: string, wake?: string) => {
  if (!bed || !wake) return null;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.round((((m(wake) - m(bed) + 1440) % 1440) / 60) * 10) / 10;
};
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
const field = 'mt-1 w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-sky-500';

/** Las noches registradas (la tarea Dormir + lo que quedó antes en otras tareas con módulo de sueño). */
export const nightsOf = (checks: Check[], extraRef?: string) =>
  checks
    .filter((c) => (c.ref === SLEEP_REF || (extraRef && c.ref === extraRef)) && (c.value.bed || c.value.wake || c.value.quality || c.value.dream))
    .reduce<Check[]>((acc, c) => {
      const i = acc.findIndex((x) => x.day === c.day);
      if (i < 0) acc.push(c);
      else if (c.ref === SLEEP_REF) acc[i] = { ...acc[i], ...c, value: { ...acc[i].value, ...c.value } };
      return acc;
    }, [])
    .sort((a, b) => a.day.localeCompare(b.day));

export const SleepLog: React.FC<{ item?: Item; checks: Checks; goal?: number; bedDefault?: string; compact?: boolean }> = ({ item, checks, goal = 8, bedDefault, compact }) => {
  const today = iso(new Date());
  const check = checks.checks.find((c) => c.ref === SLEEP_REF && c.day === today);
  const v = check?.value ?? {};
  // «Me desperté»: si no lo anotaste, la hora en que marcaste Levantarse hoy.
  const up = checks.checks.find((c) => c.ref === refOf('Levantarse') && c.day === today && c.done_at);
  const wakeGuess = up?.done_at ? hhmm(new Date(up.done_at)) : undefined;
  const bed = v.bed ?? bedDefault;
  const wake = v.wake ?? wakeGuess;
  const h = sleepHours(bed, wake);
  const set = (p: Partial<Check['value']>) => checks.mark('Dormir', today, check?.done ?? false, { bed, wake, ...v, ...p });
  const [newWake, setNewWake] = useState('');
  const [showDiary, setShowDiary] = useState(false);

  const nights = nightsOf(checks.checks, item ? refOf(item.title) : undefined).slice(-14);
  const withH = nights.map((c) => ({ c, h: sleepHours(c.value.bed, c.value.wake) })).filter((x) => x.h !== null) as { c: Check; h: number }[];
  const avg = withH.length ? Math.round((withH.reduce((s, x) => s + x.h, 0) / withH.length) * 10) / 10 : null;
  const q = nights.filter((c) => c.value.quality);
  const avgQ = q.length ? Math.round((q.reduce((s, c) => s + (c.value.quality ?? 0), 0) / q.length) * 10) / 10 : null;
  const dreams = nights.filter((c) => c.value.dream?.trim()).reverse();

  return (
    <div className="space-y-3">
      {compact && <p className="text-sm font-semibold text-white">😴 ¿Cómo dormiste?</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-400">
          Me acosté
          <input type="time" value={bed ?? ''} onChange={(e) => set({ bed: e.target.value })} className={field} />
        </label>
        <label className="text-xs text-zinc-400">
          Me desperté
          <input type="time" value={wake ?? ''} onChange={(e) => set({ wake: e.target.value })} className={field} />
        </label>
      </div>
      {h !== null && (
        <p className={`text-sm font-semibold ${h >= goal ? 'text-emerald-300' : h >= goal - 1 ? 'text-amber-300' : 'text-rose-300'}`}>
          ⏱️ {h} h de sueño {h >= goal ? '· ¡cumpliste tu meta!' : `· tu meta: ${goal} h`}
        </p>
      )}

      <div>
        <p className="text-xs text-zinc-400">⭐ ¿Qué tan bien dormiste?</p>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => set({ quality: v.quality === n ? undefined : n })} aria-label={`${n} de 5`} className={`h-9 flex-1 rounded-lg text-lg ring-1 ${v.quality && n <= v.quality ? 'bg-amber-400/20 ring-amber-400/50' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.08]'}`}>
              {v.quality && n <= v.quality ? '⭐' : '☆'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-400">
          Horas que dormí bien
          <input type="number" min={0} max={14} step={0.5} value={v.good ?? ''} onChange={(e) => set({ good: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={h !== null ? String(h) : 'Ej.: 6'} className={field} />
        </label>
        <div className="text-xs text-zinc-400">
          🌙 Me desperté en la noche · {v.wakeups?.length ?? 0}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {(v.wakeups ?? []).map((t, i) => (
              <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-white">
                {t || '?'}
                <button type="button" onClick={() => set({ wakeups: (v.wakeups ?? []).filter((_, j) => j !== i) })} aria-label="Quitar" className="text-zinc-500 hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input type="time" value={newWake} onChange={(e) => setNewWake(e.target.value)} className="w-24 rounded-lg bg-white/[0.05] px-1.5 py-1 text-xs text-white ring-1 ring-white/10" aria-label="Hora en que despertaste" />
            <button type="button" onClick={() => { set({ wakeups: [...(v.wakeups ?? []), newWake] }); setNewWake(''); }} className="rounded-lg bg-white/[0.06] p-1 text-zinc-300 hover:text-white" aria-label="Agregar despertar">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <label className="block text-xs text-zinc-400">
        💭 Lo que soñé
        <textarea defaultValue={v.dream ?? ''} key={`${today}-${check?.id ?? 'n'}`} onBlur={(e) => e.target.value !== (v.dream ?? '') && set({ dream: e.target.value })} rows={compact ? 2 : 3} placeholder="Escribe o dicta (🎙️ del teclado) lo que recuerdes…" className={`${field} resize-y`} />
      </label>

      {!compact && withH.length > 0 && (
        <div>
          <div className="flex h-16 items-end gap-1" aria-label={`Promedio ${avg} horas`}>
            {withH.map(({ c, h: hh }) => (
              <span key={c.day} data-help={`${fmtDay(c.day)}: ${hh} h${c.value.quality ? ` · ${'⭐'.repeat(c.value.quality)}` : ''}`} className={`flex-1 rounded-t ${hh >= goal ? 'bg-emerald-400/70' : 'bg-sky-400/70'}`} style={{ height: `${Math.min(100, (hh / 10) * 100)}%` }} />
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Promedio: <b className="text-zinc-300">{avg} h</b> por noche · meta {goal} h{avgQ ? ` · calidad ${avgQ}/5` : ''}
          </p>
        </div>
      )}

      {!compact && dreams.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDiary((o) => !o)} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white">
            {showDiary ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} 📔 Diario de sueños · {dreams.length}
          </button>
          {showDiary && (
            <ul className="mt-2 space-y-2">
              {dreams.map((c) => (
                <li key={c.day} className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-zinc-200">
                  <p className="text-[11px] font-semibold capitalize text-zinc-500">{fmtDay(c.day)}</p>
                  <p className="whitespace-pre-wrap">{c.value.dream}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
