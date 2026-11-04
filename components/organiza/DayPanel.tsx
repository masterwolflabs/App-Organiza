'use client';

import { ItemIcon } from '@/components/organiza/IconPicker';
import React, { useEffect, useState } from 'react';
import { Clock, Shuffle, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { dayStats, freeGaps, reorganize, scheduleFor, STATES, stateOf, toTime, type ActivityState, type Proposal } from '@/components/organiza/dayPlan';
import { iso, refOf, scheduleLabel, toMinutes, type Item } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

const STATE_TONE: Record<ActivityState, string> = { pendiente: 'text-zinc-300', completada: 'text-emerald-300', reprogramada: 'text-amber-300', cancelada: 'text-zinc-500 line-through' };
const nowMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
const inWords = (m: number) => (m < 60 ? `${m} minutos` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

/** Mi día: qué horario rige hoy, qué sigue y cómo va. Todo lo que se cambia aquí vale solo por hoy. */
export const DayPanel: React.FC = () => {
  const h = useHorario();
  const c = useChecks();
  const [now, setNow] = useState(() => new Date());
  const [fixing, setFixing] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const day = iso(now);
  const plan = h.planOf(now);
  const schedule = scheduleFor(now, h.schedules, plan);
  const list = h.itemsOn(now);
  const checkOf = (i: Item) => c.checks.find((x) => x.ref === refOf(i.title) && x.day === day);
  const stats = dayStats(list, checkOf);
  const nowMin = nowMinutes(now);
  const next = list.find((i) => toMinutes(i.time) > nowMin && stateOf(checkOf(i)) === 'pendiente');
  const gapAt = new Map(freeGaps(list).map((g) => [g.to, g]));
  const moveTo = (i: Item, time: string) => h.setPlan(day, i.id.startsWith('x:') ? { extras: (plan?.extras ?? []).map((x) => (x.id === i.id ? { ...x, time } : x)) } : { moves: { ...plan?.moves, [i.id]: { ...plan?.moves?.[i.id], time } } });
  const setState = (i: Item, s: ActivityState) => {
    const value = { ...checkOf(i)?.value };
    delete value.state;
    if (s === 'pendiente') return c.unmark(i.title, day);
    if (s === 'completada') return c.mark(i.title, day, true, { ...value, ...(checkOf(i)?.value?.state === 'reprogramada' ? { state: 'reprogramada' as const } : {}) });
    return c.mark(i.title, day, false, { ...value, state: s });
  };

  if (!h.ready) return null;
  if (!h.schedules.length) return <p className="text-sm text-zinc-400">Todavía no tienes un horario. <a href="#horario" className="font-semibold text-sky-300">Ir a Horario</a></p>;
  return (
    <div data-tour="mi-dia" className="rounded-xl pl-3" style={schedule?.color ? { boxShadow: `inset 3px 0 0 ${schedule.color}` } : undefined}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select aria-label="Horario de hoy" value={schedule?.id ?? ''} onChange={(e) => h.setPlan(day, { schedule_id: e.target.value || null })} className="max-w-[60vw] truncate rounded-lg bg-white/[0.05] px-2 py-1.5 text-sm text-zinc-200 outline-none ring-1 ring-white/10">
          <option value="" className="bg-zinc-900">Sin horario hoy</option>
          {h.schedules.map((s) => <option key={s.id} value={s.id} className="bg-zinc-900">{s.mode || 'Base'} · {scheduleLabel(s)}</option>)}
        </select>
        <button type="button" disabled={!list.length} onClick={() => setFixing(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40"><Shuffle className="h-4 w-4" /> Reorganizar mi día</button>
      </div>
      {next && <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-100 ring-1 ring-sky-400/20"><Clock className="h-4 w-4 shrink-0" /> Próxima actividad: <b className="font-semibold">{next.title}</b>. Comienza en {inWords(toMinutes(next.time) - nowMin)}.</p>}
      {!list.length ? (
        <p className="mt-3 text-sm text-zinc-400">{schedule ? 'Este horario no tiene actividades hoy.' : 'Hoy no tienes un horario asignado.'}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-0.5">
            {list.map((i) => {
              const s = stateOf(checkOf(i));
              const gap = gapAt.get(i.time);
              return (
                <React.Fragment key={i.id}>
                  {gap && <li className="px-1 py-0.5 text-xs text-zinc-500">{gap.minutes} min libres</li>}
                  <li className="flex flex-wrap items-center gap-x-2 rounded-lg px-1 py-1.5 hover:bg-white/[0.03] sm:flex-nowrap">
                    <input type="time" value={i.time} aria-label={`Hora de ${i.title} solo por hoy`} onChange={(e) => e.target.value && moveTo(i, e.target.value)} className="w-[6.5rem] shrink-0 rounded bg-transparent text-sm tabular-nums text-zinc-400 outline-none focus:bg-white/[0.06]" />
                    <span className={`order-first w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1 sm:truncate ${STATE_TONE[s]}`}><ItemIcon value={i.icon} /> {i.title}</span>
                    <select aria-label={`Estado de ${i.title}`} value={s} onChange={(e) => setState(i, e.target.value as ActivityState)} className="ml-auto shrink-0 rounded bg-transparent text-xs text-zinc-400 outline-none">
                      {STATES.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{x.label}</option>)}
                    </select>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${stats.pct}%` }} /></div>
          <p className="mt-2 text-sm text-zinc-400">{stats.done} de {stats.total} · {stats.pct}% de hoy</p>
        </>
      )}
      {fixing && <Reorganize list={list} nowMin={nowMin} onClose={() => setFixing(false)} onAccept={async (title, time, minutes, p) => {
        const moves = { ...plan?.moves };
        for (const m of p.moved) moves[m.item.id] = { ...moves[m.item.id], time: m.to };
        for (const i of p.off) moves[i.id] = { ...moves[i.id], off: true };
        await h.setPlan(day, { moves, extras: [...(plan?.extras ?? []), { id: `x:${crypto.randomUUID()}`, title, time, minutes }] });
        for (const m of p.moved) await c.mark(m.item.title, day, false, { state: 'reprogramada' });
        setFixing(false);
      }} />}
    </div>
  );
};

/** Propone, y solo cambia hoy si lo aceptas. */
const Reorganize: React.FC<{ list: Item[]; nowMin: number; onClose: () => void; onAccept: (title: string, time: string, minutes: number, p: Proposal) => Promise<void> }> = ({ list, nowMin, onClose, onAccept }) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(() => toTime(Math.min(1380, Math.ceil(nowMin / 15) * 15)));
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const p = reorganize(list, { time, minutes }, nowMin);
  const nothing = !p.moved.length && !p.off.length && !p.blocked.length;
  const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10';
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Reorganizar mi día" onClick={(e) => e.stopPropagation()} className="theme-fixed max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#14161b] p-5 text-white ring-1 ring-white/10 sm:rounded-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Reorganizar mi día</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm text-zinc-400">¿Qué apareció? Tu plantilla no cambia: esto vale solo por hoy.</p>
          <div className="mt-3 grid grid-cols-[1fr_6rem_5rem] gap-2">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sesión de fotos" aria-label="Imprevisto" className={field} />
            <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} aria-label="Hora" className={field} />
            <input type="number" min={5} step={5} value={minutes} onChange={(e) => Number(e.target.value) > 0 && setMinutes(Number(e.target.value))} aria-label="Minutos" className={field} />
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            {nothing && <p className="text-zinc-400">No choca con nada: cabe tal como está.</p>}
            {p.moved.map((m) => <p key={m.item.id} className="text-zinc-200">↪ <b className="font-semibold">{m.item.title}</b> pasa de {m.item.time} a <b className="font-semibold">{m.to}</b></p>)}
            {p.off.map((i) => <p key={i.id} className="text-amber-200">⏭ <b className="font-semibold">{i.title}</b> no cabe hoy: se aplaza</p>)}
            {p.blocked.map((i) => <p key={i.id} className="text-rose-200">🔒 <b className="font-semibold">{i.title}</b> es obligatorio y queda cruzado: decide tú</p>)}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-white">Rechazar</button>
            <button type="button" disabled={!title.trim() || busy} onClick={async () => { setBusy(true); await onAccept(title.trim(), time, minutes, p); }} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40">Aceptar</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
