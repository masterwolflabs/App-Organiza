'use client';

import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { APP } from '@/app.config';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { EventEditor, type Draft } from '@/components/calendar/EventEditor';
import { addDays, addMonths, colorOf, expand, MONTHS, sameDay, startOfDay, startOfWeek, WEEKDAYS, type Occurrence } from '@/components/calendar/model';
import { freeSlot, goalDone, goalFrequency, periodName, periodRange, suggestDay, useOrganiza, type Area, type Goal, type GoalPeriod } from '@/components/calendar/organiza';
import { useCalendar } from '@/components/calendar/useCalendar';

const EXAMPLES: Partial<Goal>[] = [
  { title: 'Un día entero con mi novia', times: 1, period: 'mes', all_day: true },
  { title: 'Ir al cerro', times: 1, period: 'semana', minutes: 180 },
  { title: 'Almuerzo en familia', times: 2, period: 'mes', minutes: 120 },
];

/** Lo variable: metas sin fecha, su avance y el mes para acomodarlas. */
export const AcomodarView: React.FC = () => {
  const { areas, goals, status, saveGoal, removeGoal } = useOrganiza();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Date | null>(null);
  const [form, setForm] = useState<Partial<Goal> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const today = startOfDay(new Date());
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(gridStart, 42);
  const [thisWeek, nextWeek] = periodRange('semana', today);
  const from = thisWeek < gridStart ? thisWeek : gridStart;
  const to = nextWeek > gridEnd ? nextWeek : gridEnd;
  const cal = useCalendar(from, to);
  const occ = useMemo(
    () => expand(cal.events.filter((e) => e.app === APP.slug), from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cal.events, from.getTime(), to.getTime()],
  );
  const goal = goals.find((g) => g.id === selected) ?? null;
  const refOf = (g: Goal) => (g.period === 'mes' ? month : today);

  const pick = (id: string | null) => { setSelected(id); setSuggested(null); };
  const changeMonth = (n: number) => { setMonth((m) => addMonths(m, n)); setSuggested(null); };
  const place = (g: Goal, day: Date) => {
    const start = g.all_day ? day : freeSlot(day, g.minutes, occ);
    const end = g.all_day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59) : new Date(start.getTime() + g.minutes * 60_000);
    setDraft({ start, end, all_day: g.all_day, app: APP.slug, title: g.title, kind: 'personal', area_id: g.area_id, goal_id: g.id, source: 'organiza', description: g.notes });
  };
  const suggest = (g: Goal) => {
    setSelected(g.id);
    setSuggested(suggestDay(g, occ, refOf(g), today));
  };

  if (status === 'missing') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-6 text-center">
        <h1 className="text-lg font-semibold text-white">Falta activar esta sección</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">Hay que correr el archivo <b>supabase/24-organiza.sql</b> en Supabase, una sola vez. Después recarga esta página.</p>
      </div>
    );
  }

  const start = (g: Goal, e: React.DragEvent) => { e.dataTransfer.setData('text/goal', g.id); pick(g.id); };
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-white">Por acomodar</h1>
          {goals.length > 0 && (
            <button onClick={() => setForm({})} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-black hover:bg-sky-400">
              <Plus className="h-4 w-4" /> Nueva meta
            </button>
          )}
        </div>

        {status === 'ready' && goals.length === 0 ? (
          <div className="mt-6">
            <p className="text-base leading-relaxed text-zinc-400">Lo que quieres hacer con cierta frecuencia, aunque todavía no tenga fecha. Parte con una de estas o escribe la tuya.</p>
            <div className="mt-4 flex flex-col gap-2">
              {EXAMPLES.map((x) => (
                <button key={x.title} onClick={() => setForm(x)} className="rounded-xl border border-white/10 px-4 py-3 text-left text-[15px] text-white transition hover:border-sky-400/50">
                  {x.title} <span className="block text-sm text-zinc-500">{goalFrequency(x as Goal)}</span>
                </button>
              ))}
              <button onClick={() => setForm({})} className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-[15px] text-sky-300 hover:bg-sky-400/10"><Plus className="h-4 w-4" /> Escribir otra</button>
            </div>
          </div>
        ) : (
          <ul className="mt-5">
            {goals.map((g) => {
              const done = goalDone(g, occ, refOf(g));
              const area = areas.find((a) => a.id === g.area_id);
              const on = selected === g.id;
              return (
                <li
                  key={g.id}
                  draggable
                  onDragStart={(e) => start(g, e)}
                  className={`group cursor-grab border-b border-white/5 px-3 py-3 transition active:cursor-grabbing ${on ? 'rounded-xl bg-sky-400/10' : ''}`}
                >
                  <button onClick={() => pick(on ? null : g.id)} aria-pressed={on} className="block w-full text-left">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-white">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: area?.color ?? '#94a3b8' }} />
                      <span className="min-w-0 truncate">{g.title}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 pl-[18px] text-sm text-zinc-400">
                      {goalFrequency(g)}
                      <Pips done={done} times={g.times} color={area?.color} />
                      <span className={done >= g.times ? 'text-emerald-400' : ''}>{done >= g.times ? `Listo ${periodName(g.period, refOf(g))}` : `${done} de ${g.times} ${periodName(g.period, refOf(g))}`}</span>
                    </span>
                  </button>
                  {on && (
                    <div className="mt-2 flex flex-wrap items-center gap-1 pl-[18px]">
                      <button onClick={() => suggest(g)} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-sm text-white hover:bg-white/10"><Sparkles className="h-3.5 w-3.5 text-sky-300" /> Sugerir día</button>
                      <button onClick={() => setForm(g)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Editar meta"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => window.confirm(`¿Quitar «${g.title}»? Lo que ya agendaste se queda en el calendario.`) && removeGoal(g.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300" aria-label="Quitar meta"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 className="mr-auto text-lg font-semibold capitalize text-white">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
          <button onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => changeMonth(1)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 min-h-5 text-sm text-zinc-400">
          {suggested && goal ? <>Te sugiero el <span className="text-white">{suggested.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric' })}</span>. Tócalo para agendar.</>
            : goal ? <>Elige un día para <span className="text-white">{goal.title}</span>.</>
              : goals.length ? 'Toca una meta y luego un día, o arrástrala hasta el día.' : 'Los días vacíos están libres.'}
        </p>
        <div className="mt-3 grid grid-cols-7 text-center text-xs text-zinc-500">{WEEKDAYS.map((w) => <span key={w} className="pb-1.5 capitalize">{w}</span>)}</div>
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border-l border-t border-white/10">
          {days.map((d) => (
            <Day
              key={d.getTime()}
              day={d}
              items={occ.filter((o) => sameDay(o.start, d))}
              out={d.getMonth() !== month.getMonth()}
              past={d < today}
              today={sameDay(d, today)}
              suggested={!!suggested && sameDay(d, suggested)}
              armed={!!goal}
              over={over === d.getTime()}
              onClick={() => goal && d >= today && place(goal, d)}
              onOver={(on) => setOver(on ? d.getTime() : null)}
              onDrop={(id) => { setOver(null); const g = goals.find((x) => x.id === id); if (g && d >= today) place(g, d); }}
            />
          ))}
        </div>
      </section>

      {form && <GoalForm initial={form} areas={areas} onClose={() => setForm(null)} onSave={saveGoal} />}
      {draft && cal.userId && (
        <EventEditor
          key={draft.start.getTime()}
          draft={draft}
          lockApp={APP.slug}
          areas={areas}
          dir={cal.dir}
          userId={cal.userId}
          isMw={cal.isMw}
          readOnly={false}
          around={(s, e) => expand(cal.events, addDays(startOfDay(s), -1), addDays(startOfDay(e), 2))}
          onSave={async (patch) => !!(await cal.save(patch))}
          onDelete={() => undefined}
          onClose={() => { setDraft(null); setSuggested(null); }}
        />
      )}
    </div>
  );
};

const Pips: React.FC<{ done: number; times: number; color?: string }> = ({ done, times, color }) =>
  times > 8 ? null : (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: times }, (_, i) => <span key={i} className="h-1.5 w-3 rounded-full bg-white/15" style={i < done ? { background: color ?? '#94a3b8' } : undefined} />)}
    </span>
  );

/** Cada barra es algo agendado: los días sin barras se leen como huecos. */
const Day: React.FC<{
  day: Date; items: Occurrence[]; out: boolean; past: boolean; today: boolean; suggested: boolean; armed: boolean; over: boolean;
  onClick: () => void; onOver: (on: boolean) => void; onDrop: (id: string) => void;
}> = ({ day, items, out, past, today, suggested, armed, over, onClick, onOver, onDrop }) => (
  <button
    onClick={onClick}
    disabled={past || !armed}
    onDragOver={(e) => { if (past) return; e.preventDefault(); onOver(true); }}
    onDragLeave={() => onOver(false)}
    onDrop={(e) => { e.preventDefault(); onDrop(e.dataTransfer.getData('text/goal')); }}
    aria-label={day.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
    className={`flex min-h-[58px] flex-col gap-0.5 border-b border-r border-white/10 p-1.5 text-left transition sm:min-h-[84px] ${past ? 'opacity-35' : ''} ${out ? 'bg-black/10' : ''} ${armed && !past ? 'hover:bg-sky-400/10' : ''} ${over ? 'bg-sky-400/20' : ''} ${suggested ? 'bg-sky-400/15 ring-2 ring-inset ring-sky-400' : ''}`}
  >
    <span className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${today ? 'bg-rose-500 font-semibold text-white' : out ? 'text-zinc-600' : 'text-zinc-300'}`}>{day.getDate()}</span>
    {items.slice(0, 4).map((o) => <span key={o.key} className="h-1 w-full rounded-full" style={{ background: colorOf(o.ev) }} />)}
  </button>
);

const DURATIONS: [number, string][] = [[30, '30 min'], [60, '1 hora'], [120, '2 horas'], [180, '3 horas'], [240, '4 horas']];

const GoalForm: React.FC<{ initial: Partial<Goal>; areas: Area[]; onClose: () => void; onSave: (g: Partial<Goal>) => Promise<boolean> }> = ({ initial, areas, onClose, onSave }) => {
  const [title, setTitle] = useState(initial.title ?? '');
  const [area, setArea] = useState<string | null>(initial.area_id ?? null);
  const [times, setTimes] = useState(initial.times ?? 1);
  const [period, setPeriod] = useState<GoalPeriod>(initial.period ?? 'mes');
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [minutes, setMinutes] = useState(initial.minutes ?? 60);
  const [error, setError] = useState(false);
  const field = 'rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white focus:border-sky-400/50 focus:outline-none [color-scheme:dark]';

  const submit = async () => {
    if (!title.trim()) return;
    const ok = await onSave({ id: initial.id, title: title.trim(), area_id: area, times: Math.min(31, Math.max(1, times)), period, all_day: allDay, minutes });
    if (ok) onClose();
    else setError(true);
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onClose} />
      <div role="dialog" aria-label="Meta" className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#101218] p-5 shadow-2xl">
        <div className="flex items-center">
          <CalendarRange className="h-5 w-5 text-sky-400" />
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="¿Qué quieres hacer?" className="mt-3 w-full bg-transparent text-xl font-semibold text-white placeholder:text-white/25 focus:outline-none" />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button key={a.id} onClick={() => setArea(area === a.id ? null : a.id)} aria-pressed={area === a.id} className={`rounded-full px-2.5 py-1 text-xs transition ${area === a.id ? 'text-white ring-1' : 'bg-white/[0.04] text-white/55 hover:bg-white/10'}`} style={area === a.id ? { background: `${a.color}30`, ['--tw-ring-color' as string]: `${a.color}90` } : undefined}>
              {a.emoji} {a.name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
          <input type="number" min={1} max={31} value={times} onChange={(e) => setTimes(Number(e.target.value) || 1)} aria-label="Cuántas veces" className={`${field} w-16`} />
          {times === 1 ? 'vez' : 'veces'} por
          <select value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)} aria-label="Periodo" className={field}><option value="semana">semana</option><option value="mes">mes</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Todo el día</label>
          {!allDay && <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Duración" className={field}>{DURATIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>}
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.</p>}
        <div className="mt-5 flex justify-end">
          <button onClick={submit} disabled={!title.trim()} className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-sky-400 disabled:opacity-40">{initial.id ? 'Guardar meta' : 'Crear meta'}</button>
        </div>
      </div>
    </BodyPortal>
  );
};
