'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MapPin, Repeat, Video } from 'lucide-react';
import {
  addDays, atMinutes, colorOf, DAY, fmtTime, labelOf, layoutDay, minutesOf, sameDay, startOfDay, startOfWeek, WEEKDAYS,
  type CalEvent, type Occurrence,
} from './model';

export const HOUR_PX = 48;
const SNAP = 15;
const snap = (m: number) => Math.max(0, Math.min(24 * 60, Math.round(m / SNAP) * SNAP));

type GridProps = {
  occ: Occurrence[];
  warned: Set<string>;
  onOpen: (o: Occurrence) => void;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  /** Move / resize an occurrence. */
  onChange: (o: Occurrence, start: Date, end: Date) => void;
  canEdit: (ev: CalEvent) => boolean;
};

function Chip({ o, warned, compact }: { o: Occurrence; warned: boolean; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {warned && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" />}
      {!compact && !o.ev.all_day && <span className="shrink-0 tabular-nums text-white/55">{fmtTime(o.start)}</span>}
      <span className="truncate font-medium">{o.ev.title || 'Sin título'}</span>
      {o.ev.rrule && <Repeat className="h-2.5 w-2.5 shrink-0 text-white/40" />}
    </span>
  );
}

/* ── Semana / día ───────────────────────────────────────────────────── */

type Drag =
  | { type: 'create'; day: number; a: number; b: number }
  | { type: 'move'; o: Occurrence; grabMin: number; day: number; min: number; moved: boolean }
  | { type: 'resize'; o: Occurrence; min: number };

export function TimeGrid({ days, startMin, dayNote, ...p }: GridProps & {
  days: Date[];
  /** Dónde parte la grilla, en minutos desde medianoche. */
  startMin?: number;
  /** Semana tipo: reemplaza el número del día, que ahí no significa nada. */
  dayNote?: (d: Date) => string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Land around the start of the working day (or two hours before now, today).
  const firstDay = days[0].getTime();
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const today = days.some((d) => sameDay(d, new Date()));
    el.scrollTop = Math.max(0, ((startMin ?? (today ? minutesOf(new Date()) - 120 : 7 * 60)) / 60) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length]);

  const allDay = p.occ.filter((o) => o.ev.all_day || o.end.getTime() - o.start.getTime() >= DAY);
  const timed = p.occ.filter((o) => !allDay.includes(o));
  const byDay = useMemo(
    () => days.map((d) => layoutDay(timed.filter((o) => sameDay(o.start, d)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.occ, firstDay, days.length],
  );

  const at = (e: { clientX: number; clientY: number }) => {
    const r = cols.current!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - r.left) / r.width) * days.length)));
    return { day, min: ((e.clientY - r.top) / HOUR_PX) * 60 };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { day, min } = at(e);
      if (d.type === 'create') setDrag({ ...d, b: snap(min) });
      else if (d.type === 'move') {
        const m = snap(min - d.grabMin);
        setDrag({ ...d, day, min: m, moved: d.moved || m !== snap(minutesOf(d.o.start)) || !sameDay(days[day], d.o.start) });
      } else setDrag({ ...d, min: Math.max(snap(min), minutesOf(d.o.start) + SNAP) });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.type === 'create') {
        const lo = Math.min(d.a, d.b);
        const hi = Math.max(d.a, d.b);
        const start = atMinutes(days[d.day], lo);
        p.onCreate(start, atMinutes(days[d.day], hi - lo < SNAP ? lo + 60 : hi), false);
      } else if (d.type === 'move') {
        if (!d.moved) return p.onOpen(d.o);
        const start = atMinutes(days[d.day], d.min);
        p.onChange(d.o, start, new Date(start.getTime() + (d.o.end.getTime() - d.o.start.getTime())));
      } else p.onChange(d.o, d.o.start, atMinutes(startOfDay(d.o.start), d.min));
    };
    // The finger started scrolling instead of dragging: drop it, create nothing.
    const cancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const ghostFor = (dayIdx: number) => {
    if (!drag) return null;
    if (drag.type === 'create' && drag.day === dayIdx) {
      const lo = Math.min(drag.a, drag.b);
      const hi = Math.max(drag.a, drag.b, lo + SNAP);
      return { top: lo, h: hi - lo, label: `${fmtTime(atMinutes(days[dayIdx], lo))} – ${fmtTime(atMinutes(days[dayIdx], hi))}`, color: '#22d3ee' };
    }
    if (drag.type === 'move' && drag.moved && drag.day === dayIdx) {
      const len = (drag.o.end.getTime() - drag.o.start.getTime()) / 60_000;
      return { top: drag.min, h: Math.max(len, SNAP), label: `${fmtTime(atMinutes(days[dayIdx], drag.min))} · ${drag.o.ev.title || 'Sin título'}`, color: colorOf(drag.o.ev) };
    }
    return null;
  };

  const gridCols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera (días + todo el día) fija arriba, dentro del mismo scroll: siempre alineada */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-scroll overscroll-contain">
        <div className="sticky top-0 z-30 bg-[#0b0d12] [:root[data-theme=light]_&]:bg-[#fff]!">
        {/* Cabecera: días + todo el día */}
        <div className="flex border-b border-white/10">
          <div className="w-14 shrink-0" />
          <div className="grid flex-1" style={gridCols}>
            {days.map((d) => {
              const today = sameDay(d, now);
              return (
                <div key={d.getTime()} className="border-l border-white/5 px-2 py-2 text-center">
                  <div className={`text-[11px] uppercase tracking-wide ${dayNote && today ? 'font-semibold text-sky-300' : 'text-white/40'}`}>{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                  {dayNote ? <div className="mt-0.5 text-xs tabular-nums text-white/65">{dayNote(d)}</div> : <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg tabular-nums ${today ? 'bg-rose-500 font-semibold text-white' : 'text-white/85'}`}>{d.getDate()}</div>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex border-b border-white/10">
          <div className="flex w-14 shrink-0 items-center justify-end pr-2 text-[10px] text-white/30">todo el día</div>
          <div className="grid flex-1" style={gridCols}>
            {days.map((d) => {
              const list = allDay.filter((o) => o.start < addDays(d, 1) && o.end > d || sameDay(o.start, d));
              return (
                <div
                  key={d.getTime()}
                  className="min-h-[30px] space-y-0.5 border-l border-white/5 p-0.5"
                  onDoubleClick={() => p.onCreate(d, d, true)}
                >
                  {list.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => p.onOpen(o)}
                      className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-white/90"
                      style={{ background: `${colorOf(o.ev)}33`, boxShadow: `inset 3px 0 0 ${colorOf(o.ev)}` }}
                    >
                      <Chip o={o} warned={p.warned.has(o.key)} compact />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        </div>
        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-white/35" style={{ top: (i + 1) * HOUR_PX }}>
                {String(i + 1).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          <div ref={cols} className="relative grid flex-1 select-none" style={gridCols}>
            {days.map((d, i) => {
              const ghost = ghostFor(i);
              const today = sameDay(d, now);
              return (
                <div
                  key={d.getTime()}
                  className={`relative border-l border-white/5 ${today ? 'bg-white/[0.015]' : ''}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, rgba(128,128,128,0.16) ${HOUR_PX - 1}px, rgba(128,128,128,0.16) ${HOUR_PX}px)` }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || e.target !== e.currentTarget) return;
                    const m = snap(at(e).min);
                    setDrag({ type: 'create', day: i, a: m, b: m + SNAP * 4 });
                  }}
                >
                  {byDay[i].map((o) => {
                    const hidden = drag?.type === 'move' && drag.moved && drag.o.key === o.key;
                    const top = (minutesOf(o.start) / 60) * HOUR_PX;
                    const endMin = sameDay(o.end, o.start) ? minutesOf(o.end) : 24 * 60;
                    const resizing = drag?.type === 'resize' && drag.o.key === o.key ? drag.min : null;
                    const h = Math.max(18, (((resizing ?? endMin) - minutesOf(o.start)) / 60) * HOUR_PX - 2);
                    const c = colorOf(o.ev);
                    const editable = p.canEdit(o.ev);
                    const tight = h < 34;
                    return (
                      <div
                        key={o.key}
                        className={`group absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white/90 shadow-sm ring-1 ring-black/20 transition-opacity ${hidden ? 'opacity-30' : ''} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        style={{
                          top: top + 1,
                          height: h,
                          left: `calc(${(o.col / o.cols) * 100}% + 2px)`,
                          width: `calc(${(1 / o.cols) * 100}% - 4px)`,
                          background: `${c}3d`, backdropFilter: 'blur(6px)',
                          boxShadow: `inset 3px 0 0 ${c}`,
                          opacity: o.ev.status === 'tentativo' ? 0.65 : undefined,
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          if (!editable) return;
                          setDrag({ type: 'move', o, grabMin: at(e).min - minutesOf(o.start), day: i, min: minutesOf(o.start), moved: false });
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!editable) p.onOpen(o);
                        }}
                      >
                        <div className={tight ? 'flex gap-1' : ''}>
                          <div className="flex items-center gap-1 font-semibold">
                            {p.warned.has(o.key) && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" />}
                            <span className="truncate">{o.ev.title || 'Sin título'}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-1 text-white/55">
                            <span className="shrink-0 tabular-nums">{fmtTime(o.start)}{!tight && ` – ${fmtTime(o.end)}`}</span>
                            {o.ev.mode === 'online' && <Video className="h-2.5 w-2.5 shrink-0" />}
                            {o.ev.mode === 'presencial' && o.ev.location && !tight && (
                              <span className="flex min-w-0 items-center gap-0.5"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{o.ev.location}</span></span>
                            )}
                            {o.ev.rrule && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                          </div>
                        </div>
                        {editable && (
                          <div
                            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                            style={{ background: `linear-gradient(transparent, ${c}66)` }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setDrag({ type: 'resize', o, min: endMin });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                  {ghost && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/30"
                      style={{ top: (ghost.top / 60) * HOUR_PX, height: Math.max(18, (ghost.h / 60) * HOUR_PX), background: `${ghost.color}55` }}
                    >
                      {ghost.label}
                    </div>
                  )}
                  {today && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (minutesOf(now) / 60) * HOUR_PX }}>
                      <div className="relative h-px bg-rose-500"><span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mes ────────────────────────────────────────────────────────────── */

export function MonthGrid({ month, onDay, ...p }: GridProps & { month: Date; onDay: (d: Date) => void }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [over, setOver] = useState<number | null>(null);
  const dragged = useRef<Occurrence | null>(null);
  const today = new Date();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-white/10">
        {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2 text-center text-[11px] uppercase tracking-wide text-white/40">{w}</div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((d) => {
          const list = p.occ.filter((o) => sameDay(o.start, d) || (o.start < d && o.end > d));
          const out = d.getMonth() !== month.getMonth();
          const t = d.getTime();
          return (
            <div
              key={t}
              className={`flex min-h-[92px] min-w-0 flex-col border-b border-l border-white/5 p-1 ${out ? 'bg-black/10' : ''} ${over === t ? 'bg-sky-400/10' : ''}`}
              onClick={(e) => e.target === e.currentTarget && p.onCreate(atMinutes(d, 9 * 60), atMinutes(d, 10 * 60), false)}
              onDragOver={(e) => { e.preventDefault(); setOver(t); }}
              onDragLeave={() => setOver((v) => (v === t ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const o = dragged.current;
                if (!o) return;
                const shift = Math.round((startOfDay(d).getTime() - startOfDay(o.start).getTime()) / DAY);
                if (shift) p.onChange(o, addDays(o.start, shift), addDays(o.end, shift));
              }}
            >
              <button
                onClick={() => onDay(d)}
                className={`mb-0.5 flex h-6 w-6 items-center justify-center self-start rounded-full text-xs tabular-nums hover:bg-white/10 ${sameDay(d, today) ? 'bg-rose-500 font-semibold text-white' : out ? 'text-white/30' : 'text-white/75'}`}
              >
                {d.getDate()}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((o) => {
                  const c = colorOf(o.ev);
                  return (
                    <button
                      key={o.key}
                      draggable={p.canEdit(o.ev)}
                      onDragStart={() => { dragged.current = o; }}
                      onClick={() => p.onOpen(o)}
                      className="block w-full truncate rounded px-1.5 py-[1px] text-left text-[11px] text-white/85 hover:brightness-125"
                      style={o.ev.all_day ? { background: `${c}40` } : { boxShadow: `inset 3px 0 0 ${c}`, background: `${c}14` }}
                    >
                      <Chip o={o} warned={p.warned.has(o.key)} />
                    </button>
                  );
                })}
                {list.length > 3 && (
                  <button onClick={() => onDay(d)} className="px-1.5 text-[11px] text-white/45 hover:text-white/80">+{list.length - 3} más</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Agenda ─────────────────────────────────────────────────────────── */

export function AgendaList({ occ, warned, onOpen, from, apps }: { occ: Occurrence[]; warned: Map<string, string[]>; onOpen: (o: Occurrence) => void; from: Date; apps?: Map<string, string> }) {
  const groups = useMemo(() => {
    const m = new Map<number, Occurrence[]>();
    for (const o of occ) {
      if (o.end < from) continue;
      const k = startOfDay(o.start < from ? from : o.start).getTime();
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [occ, from]);

  if (!groups.length) return <p className="p-10 text-center text-sm text-white/40">Nada agendado en estas semanas con estos filtros.</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-6">
      {groups.map(([k, list]) => {
        const d = new Date(k);
        return (
          <div key={k} className="flex gap-4 border-b border-white/5 py-3">
            <div className="w-16 shrink-0 text-center">
              <div className={`text-2xl font-light tabular-nums ${sameDay(d, new Date()) ? 'text-rose-400' : 'text-white/85'}`}>{d.getDate()}</div>
              <div className="text-[11px] uppercase text-white/40">{d.toLocaleDateString('es-CL', { weekday: 'short', month: 'short' })}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {list.map((o) => (
                <button key={o.key} onClick={() => onOpen(o)} className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(o.ev) }} />
                  <span className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-white/50">{o.ev.all_day ? 'Todo el día' : `${fmtTime(o.start)} – ${fmtTime(o.end)}`}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white/90">{o.ev.title || 'Sin título'}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-white/45">
                      <span>{labelOf(o.ev)}</span>
                      {apps && <span>{apps.get(o.ev.app) ?? o.ev.app}</span>}
                      {o.ev.mode === 'online' && <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Online</span>}
                      {o.ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.ev.location}</span>}
                    </span>
                    {(warned.get(o.key) ?? []).map((w) => (
                      <span key={w} className="mt-0.5 flex items-center gap-1 text-xs text-amber-300/90"><AlertTriangle className="h-3 w-3 shrink-0" /> {w}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
