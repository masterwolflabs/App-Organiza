'use client';

import React, { useMemo, useState } from 'react';
import { Check, Moon, X } from 'lucide-react';
import { iso, refOf, RANKS, rankOf, XP, xpOf, type Item } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

const longDay = (d: Date) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

/** El cierre del día: una mirada honesta a todo lo que tocaba hoy. También sirve para ayer. */
export const Checklist: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const h = useHorario();
  const c = useChecks();
  const [back, setBack] = useState(0);
  const [note, setNote] = useState('');
  const date = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - back);
  }, [back]);
  const day = iso(date);
  const checkOf = (i: Item) => c.checks.find((x) => x.ref === refOf(i.title) && x.day === day);
  // Lo cancelado o reprogramado sin hacer no se cobra como incumplido.
  const list = h.itemsOn(date).filter((i) => checkOf(i)?.value?.state !== 'cancelada');
  const stateOf = (i: Item) => (checkOf(i)?.value?.state === 'reprogramada' && !checkOf(i)?.done ? undefined : checkOf(i)?.done);
  const answered = list.filter((i) => stateOf(i) !== undefined).length;
  const done = list.filter((i) => stateOf(i) === true).length;
  const closed = c.days.find((d) => d.day === day);
  const perfect = list.length > 0 && done === list.length;
  const xp = xpOf(c.checks, c.days);

  if (!h.ready) return <p className="text-sm text-zinc-500">Leyendo tu día…</p>;
  return (
    <section data-tour="checklist" className={embedded ? '' : 'mx-auto max-w-2xl'}>
      {!embedded && (
        <header className="mb-6">
          <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Cierre del día</h1>
          <p className="mt-2 text-zinc-400">Repasa qué hiciste y qué no. Lo tendrás claro para mañana.</p>
        </header>
      )}
      <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold first-letter:uppercase text-white">{back ? longDay(date) : 'Checklist de hoy'}</h2>
          <button type="button" onClick={() => setBack((b) => (b ? 0 : 1))} className="text-xs font-semibold text-zinc-400 hover:text-white">{back ? 'Volver a hoy' : 'Se me pasó ayer'}</button>
        </div>
        {!h.published ? (
          <p className="mt-3 text-sm text-zinc-400">Publica un horario y aquí aparecerá lo de cada día. <a href="#horario" className="font-semibold text-sky-300">Ir a Horario</a></p>
        ) : !list.length ? (
          <p className="mt-3 text-sm text-zinc-400">Tu horario no tiene tareas este día.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-white/5">
              {list.map((i) => {
                const s = stateOf(i);
                return (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-12 shrink-0 text-sm tabular-nums text-zinc-500">{i.time}</span>
                    <span className={`min-w-0 flex-1 truncate ${s === true ? 'text-zinc-400 line-through' : 'text-white'}`}>{i.icon} {i.title}</span>
                    <button type="button" aria-label={`Sí hice ${i.title}`} aria-pressed={s === true} onClick={() => s === true ? c.unmark(i.title, day) : c.mark(i.title, day, true)} className={`rounded-lg p-1.5 ring-1 ${s === true ? 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/40' : 'text-zinc-400 ring-white/10 hover:text-white'}`}><Check className="h-4 w-4" /></button>
                    <button type="button" aria-label={`No hice ${i.title}`} aria-pressed={s === false} onClick={() => s === false ? c.unmark(i.title, day) : c.mark(i.title, day, false)} className={`rounded-lg p-1.5 ring-1 ${s === false ? 'bg-rose-500/25 text-rose-200 ring-rose-400/40' : 'text-zinc-400 ring-white/10 hover:text-white'}`}><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${(done / list.length) * 100}%` }} /></div>
            <p className="mt-2 text-sm text-zinc-400">{done} de {list.length} cumplidas{answered < list.length ? ` · faltan ${list.length - answered} por responder` : ''}</p>
            {closed ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 ring-1 ring-emerald-400/20"><Moon className="h-4 w-4" /> Día cerrado. {perfect ? `Día perfecto: +${XP.close + XP.perfect} XP.` : `+${XP.close} XP.`} Mañana seguimos.</p>
            ) : (
              <>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="¿Qué harás distinto mañana?" className="mt-4 w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10" />
                <button type="button" disabled={answered < list.length} onClick={() => c.closeDay(day, done, list.length, note)} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40"><Moon className="h-4 w-4" /> Cerrar el día</button>
              </>
            )}
          </>
        )}
        {!embedded && <p className="mt-4 text-xs text-zinc-500">Tu rango: {RANKS[rankOf(xp)].name} · {xp} XP</p>}
      </div>
    </section>
  );
};

export const ChecklistView: React.FC = () => <Checklist />;
