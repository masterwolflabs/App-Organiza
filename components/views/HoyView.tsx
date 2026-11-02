'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Repeat } from 'lucide-react';
import { APP } from '@/app.config';
import { goalDone, goalFrequency, useOrganiza } from '@/components/calendar/organiza';
import { addDays, colorOf, expand, fmtTime, minutesOf, sameDay, startOfDay, startOfWeek, type Occurrence } from '@/components/calendar/model';
import { useCalendar } from '@/components/calendar/useCalendar';
import { DailyView } from '@/components/daily/DailyView';
import { DayPanel } from '@/components/organiza/DayPanel';
import { Checklist } from '@/components/views/ChecklistView';

/** La cinta muestra el día despierto; lo que cae fuera se ve igual en la lista. */
const BAND_FROM = 6 * 60;
const BAND_TO = 24 * 60;
const BAND_HOURS = [6, 9, 12, 15, 18, 21];
const pct = (min: number) => ((Math.min(BAND_TO, Math.max(BAND_FROM, min)) - BAND_FROM) / (BAND_TO - BAND_FROM)) * 100;

const longDay = (d: Date) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const goCalendar = () => { window.location.hash = 'calendario'; };

/** La portada: el día de hoy como una cinta, y lo que viene en la semana. */
export const HoyView: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = startOfDay(now);
  // Del lunes o el día 1 (lo que venga antes) hasta fin de mes: es lo que miden las metas.
  const from = startOfWeek(new Date(today.getFullYear(), today.getMonth(), 1));
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 8);
  const to = nextMonth > addDays(today, 15) ? nextMonth : addDays(today, 15);
  const { events, status } = useCalendar(from, to);
  const { goals } = useOrganiza();
  const occ = useMemo(
    () => expand(events.filter((e) => e.app === APP.slug), from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, from.getTime(), to.getTime()],
  );
  const pending = goals.filter((g) => goalDone(g, occ, today) < g.times);

  const todays = occ.filter((o) => sameDay(o.start, today));
  const allDay = todays.filter((o) => o.ev.all_day);
  const timed = todays.filter((o) => !o.ev.all_day);
  const next = timed.find((o) => o.end > now);
  const coming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).map((d) => ({ day: d, items: occ.filter((o) => sameDay(o.start, d)) }));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold first-letter:uppercase text-white sm:text-5xl">{longDay(now)}</h1>
          <p className="mt-2 text-base text-zinc-400">
            {status === 'loading' ? 'Leyendo tu día…' : next ? <>Lo próximo es <span className="text-white">{next.ev.title || 'Sin título'}</span>, a las {fmtTime(next.start)}.</> : timed.length ? 'Ya no te queda nada agendado hoy.' : 'Hoy no tienes nada agendado.'}
          </p>
        </div>
        <button onClick={goCalendar} className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-400">
          <CalendarPlus className="h-4 w-4" /> Agendar
        </button>
      </header>

      <div className="mt-8"><DayPanel /></div>

      <section className="mt-8" data-tour="daily">
        <h2 className="mb-3 text-lg font-semibold text-white">Pendientes</h2>
        <div className="max-h-[440px] overflow-auto rounded-2xl">
          <DailyView compact />
        </div>
      </section>

      {status === 'error' ? (
        <p className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">No se pudo leer el calendario. Revisa tu conexión y recarga la página.</p>
      ) : (
        <>
          <DayBand items={timed} now={now} />

          {allDay.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {allDay.map((o) => (
                <span key={o.key} className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-200 ring-1 ring-white/10">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorOf(o.ev) }} /> {o.ev.title || 'Sin título'}, todo el día
                </span>
              ))}
            </div>
          )}

          <div className="mt-12 grid gap-10 lg:grid-cols-[3fr_2fr]">
            <section>
              <h2 className="text-lg font-semibold text-white">Hoy</h2>
              {timed.length ? (
                <ul className="mt-3">{timed.map((o) => <Row key={o.key} o={o} past={o.end <= now} />)}</ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">Un día abierto. Agenda algo o déjalo libre a propósito.</p>
              )}
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Lo que viene</h2>
              <ul className="mt-3">
                {coming.map(({ day, items }) => (
                  <li key={day.getTime()} className="flex items-baseline gap-3 border-b border-white/5 py-2 text-sm">
                    <span className="w-16 shrink-0 capitalize text-zinc-500">{day.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}</span>
                    <span className={`min-w-0 truncate ${items.length ? 'text-zinc-200' : 'text-zinc-600'}`}>
                      {items.length ? items.map((o) => o.ev.title || 'Sin título').join(', ') : 'Libre'}
                    </span>
                  </li>
                ))}
              </ul>
              {pending.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-white">Por acomodar</h2>
                  <ul className="mt-2">
                    {pending.slice(0, 3).map((g) => (
                      <li key={g.id}>
                        <a href="#acomodar" className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 text-sm text-zinc-200 transition hover:text-sky-300">
                          <span className="min-w-0 truncate">{g.title}</span>
                          <span className="shrink-0 text-zinc-500">{goalFrequency(g)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className="mt-12"><Checklist embedded /></div>
        </>
      )}
    </div>
  );
};

/** El día a escala real: se ve de una mirada cuánto está ocupado y cuánto libre. */
const DayBand: React.FC<{ items: Occurrence[]; now: Date }> = ({ items, now }) => {
  const nowMin = minutesOf(now);
  return (
    <div className="mt-8" aria-hidden>
      <div className="relative h-16 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10 sm:h-20">
        {nowMin > BAND_FROM && <div className="absolute inset-y-0 left-0 bg-white/[0.03]" style={{ width: `${pct(nowMin)}%` }} />}
        {items.map((o) => {
          const left = pct(minutesOf(o.start));
          const right = sameDay(o.start, o.end) ? pct(minutesOf(o.end)) : 100;
          return (
            <div
              key={o.key}
              className="absolute inset-y-1.5 overflow-hidden rounded-md px-2 py-1 text-xs font-medium text-black/80"
              style={{ left: `${left}%`, width: `max(4px, ${right - left}%)`, background: colorOf(o.ev) }}
            >
              <span className="block truncate">{o.ev.title || 'Sin título'}</span>
            </div>
          );
        })}
        {nowMin >= BAND_FROM && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct(nowMin)}%` }} />}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-zinc-500">
        {BAND_HOURS.map((h) => <span key={h} className="absolute" style={{ left: `${pct(h * 60)}%` }}>{h}:00</span>)}
      </div>
    </div>
  );
};

const Row: React.FC<{ o: Occurrence; past: boolean }> = ({ o, past }) => (
  <li className={`flex items-center gap-3 border-b border-white/5 py-2.5 ${past ? 'opacity-40' : ''}`}>
    <span className="w-24 shrink-0 text-sm tabular-nums text-zinc-400">{fmtTime(o.start)}–{fmtTime(o.end)}</span>
    <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: colorOf(o.ev) }} />
    <span className="min-w-0 flex-1 truncate text-[15px] text-white">{o.ev.title || 'Sin título'}</span>
    {o.ev.rrule && <span data-help="Se repite"><Repeat className="h-3.5 w-3.5 text-zinc-500" /></span>}
  </li>
);
