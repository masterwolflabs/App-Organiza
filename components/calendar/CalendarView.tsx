'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, PanelLeft, Plus, Search, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { McAvatar } from '@/components/calendar/McAvatar';
import { AreaManager } from './AreaManager';
import { EventEditor, type Draft } from './EventEditor';
import { AgendaList, MonthGrid, TimeGrid } from './grids';
import {
  addDays, addMonths, DAY, expand, KINDS, logistics, MONTHS, presetToRrule, sameDay, startOfDay, startOfWeek, WEEKDAYS,
  type CalEvent, type EventMode, type Occurrence,
} from './model';
import { clashes, freeHours, useOrganiza } from './organiza';
import { useCalendar, type CalendarSource } from './useCalendar';

type View = 'day' | 'week' | 'month' | 'agenda';
const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'day', label: 'Día', key: 'd' },
  { id: 'week', label: 'Semana', key: 'w' },
  { id: 'month', label: 'Mes', key: 'm' },
  { id: 'agenda', label: 'Agenda', key: 'a' },
];

export type Filters = { apps: string[]; kinds: string[]; areas: string[]; nature: '' | 'fijo' | 'variable'; mode: '' | EventMode; who: string[]; scope: '' | 'mine' | 'mw' | 'invited'; q: string };
const EMPTY: Filters = { apps: [], kinds: [], areas: [], nature: '', mode: '', who: [], scope: '', q: '' };
type SavedView = { name: string; f: Filters; builtIn?: boolean };
const BUILT_IN: SavedView[] = [
  { name: 'Todo', f: EMPTY, builtIn: true },
  { name: 'Lo fijo', f: { ...EMPTY, nature: 'fijo' }, builtIn: true },
  { name: 'Lo variable', f: { ...EMPTY, nature: 'variable' }, builtIn: true },
];
const VIEWS_KEY = 'mc-cal-views';
const PREF_KEY = 'mc-cal-pref';

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento: no pasa nada */ }
};

/**
 * El calendario maestro (Emanuel, 2026-10-29). `lockApp` = dentro de una app:
 * muestra y crea solo lo de esa app (Finanzas → fechas de plata, Project →
 * proyectos y reuniones). Sin `lockApp` (la nube) se ve todo, con filtro.
 */
function sinceLongAgo(ev: CalEvent): CalEvent {
  if (!ev.rrule) return ev;
  const shift = 104 * 7 * DAY;
  return { ...ev, exdates: null, starts_at: new Date(new Date(ev.starts_at).getTime() - shift).toISOString(), ends_at: new Date(new Date(ev.ends_at).getTime() - shift).toISOString() };
}

export function CalendarView({ lockApp, source, horario }: { lockApp?: string; /** In-memory data (previews / tests). */ source?: CalendarSource; /** Organiza: la semana tipo, solo lo que se repite cada día o semana. */ horario?: boolean }) {
  const prefKey = horario ? `${PREF_KEY}-horario` : PREF_KEY;
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [rail, setRail] = useState(!horario);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editAreas, setEditAreas] = useState(false);
  // Evento repetido en el Calendario: qué hacer con esa repetición.
  const [ask, setAsk] = useState<{ o: Occurrence; move?: { start: Date; end: Date } } | null>(null);
  const [askError, setAskError] = useState(false);
  const [detaching, setDetaching] = useState<Occurrence | null>(null);
  const { areas, saveArea, removeArea } = useOrganiza();

  useEffect(() => {
    const p = read<{ view?: View; rail?: boolean; filters?: Filters }>(prefKey, {});
    if (horario) setView(window.innerWidth < 640 ? 'day' : 'week');
    else if (p.view) setView(p.view);
    else if (window.innerWidth < 640) setView('day');
    if (typeof p.rail === 'boolean') setRail(p.rail);
    if (p.filters) setFilters({ ...EMPTY, ...p.filters, q: '' });
    if (window.innerWidth < 1024) setRail(false);
    setSaved(read<SavedView[]>(VIEWS_KEY, []));
    setLoaded(true);
  }, [horario, prefKey]);
  useEffect(() => { if (loaded) write(prefKey, { view, rail, filters }); }, [loaded, prefKey, view, rail, filters]);

  const [from, to] = useMemo((): [Date, Date] => {
    if (view === 'day') return [cursor, addDays(cursor, 1)];
    if (view === 'week') return [startOfWeek(cursor), addDays(startOfWeek(cursor), 7)];
    if (view === 'month') {
      const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      return [s, addDays(s, 42)];
    }
    return [cursor, addDays(cursor, 60)];
  }, [view, cursor]);

  // A day of margin each side so the logistics warnings see the neighbours.
  const live = useCalendar(addDays(from, -1), addDays(to, 1), !source);
  const cal = source ?? live;
  const { dir, userId } = cal;

  const people = useMemo(() => {
    const m = new Map<string, { name: string; avatar_url: string | null }>();
    for (const x of [...dir.users, ...dir.people, ...dir.clients]) m.set(x.id, x);
    return m;
  }, [dir]);
  const appNames = useMemo(() => new Map(dir.apps.map((a) => [a.slug, `${a.icon ?? ''} ${a.name}`.trim()])), [dir.apps]);

  const pass = (ev: CalEvent) => {
    const f = filters;
    if (lockApp && ev.app !== lockApp) return false;
    if (horario && !/FREQ=(DAILY|WEEKLY)/.test(ev.rrule ?? '')) return false;
    if (f.apps.length && !f.apps.includes(ev.app)) return false;
    if (f.kinds.length && !f.kinds.includes(ev.kind)) return false;
    if (f.areas.length && !(ev.area_id && f.areas.includes(ev.area_id))) return false;
    if (f.nature === 'fijo' && ev.goal_id) return false;
    if (f.nature === 'variable' && !ev.goal_id) return false;
    if (f.mode && ev.mode !== f.mode) return false;
    if (f.scope === 'mine' && ev.owner_scope !== userId) return false;
    if (f.scope === 'mw' && ev.owner_scope !== 'mw') return false;
    if (f.scope === 'invited' && ev.owner_id === userId) return false;
    if (f.who.length && !f.who.some((id) => ev.attendee_users.includes(id) || ev.attendee_people.includes(id) || ev.attendee_clients.includes(id) || ev.owner_id === id)) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![ev.title, ev.description, ev.location].some((s) => s?.toLowerCase().includes(q))) return false;
    }
    return true;
  };

  const allOcc = useMemo(() => {
    const a = addDays(from, -1);
    const b = addDays(to, 1);
    if (!horario) return expand(cal.events, a, b);
    // La semana tipo muestra la rutina completa aunque haya partido hace poco
    // o parta la próxima semana: se expande como si viniera de hace 2 años.
    const real = new Map(cal.events.map((e) => [e.id, e]));
    return expand(cal.events.map(sinceLongAgo), a, b).map((o) => ({ ...o, ev: real.get(o.ev.id) ?? o.ev }));
  }, [cal.events, from, to, horario]);
  const occ = useMemo(() => allOcc.filter((o) => pass(o.ev) && o.start < to && o.end > from),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOcc, filters, from, to, lockApp, horario, userId]);

  // Warnings are about MY day, whatever the filter shows (a hidden meeting still collides).
  const warnings = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const o of occ) {
      if (o.ev.all_day) continue;
      const day = allOcc.filter((x) => x.key !== o.key && Math.abs(x.start.getTime() - o.start.getTime()) < DAY);
      const w = logistics({ id: o.ev.id, start: o.start, end: o.end, mode: o.ev.mode, location: o.ev.location, all_day: false }, day.filter((x) => x.ev.id !== o.ev.id));
      if (w.length) m.set(o.key, w.map((x) => x.text));
    }
    return m;
  }, [occ, allOcc]);
  const warned = useMemo(() => new Set(warnings.keys()), [warnings]);
  const routineClashes = useMemo(() => (horario ? clashes(occ) : []), [horario, occ]);

  const canEdit = (ev: CalEvent) => ev.owner_id === userId || (ev.owner_scope === 'mw' && cal.isMw);
  const around = (s: Date, e: Date) => expand(cal.events, addDays(startOfDay(s), -1), addDays(startOfDay(e), 2));

  const openSeries = (o: Occurrence) => { setDetaching(null); setDraft({ ...o.ev, start: new Date(o.ev.starts_at), end: new Date(o.ev.ends_at) }); };
  const open = (o: Occurrence) => (o.ev.rrule && !horario && canEdit(o.ev) ? setAsk({ o }) : openSeries(o));
  const openOne = (o: Occurrence) => {
    setDetaching(o);
    setDraft({ ...o.ev, id: undefined, rrule: null, exdates: null, series_id: o.ev.id, start: o.start, end: o.end });
  };
  const run = async (action: () => Promise<boolean>) => {
    if (await action()) { setAsk(null); setAskError(false); }
    else setAskError(true);
  };
  const create = (start: Date, end: Date, allDay = false) =>
    setDraft({
      start, end, all_day: allDay,
      app: lockApp ?? (filters.apps.length === 1 ? filters.apps[0] : 'nube'),
      kind: filters.kinds.length === 1 ? (filters.kinds[0] as CalEvent['kind']) : undefined,
      area_id: filters.areas.length === 1 ? filters.areas[0] : undefined,
      mode: filters.mode || null,
      rrule: horario ? presetToRrule('weekly', start) : undefined,
    });
  const change = (o: Occurrence, start: Date, end: Date) => {
    if (o.ev.rrule && !horario) return setAsk({ o, move: { start, end } });
    moveSeries(o, start, end);
  };
  const moveSeries = (o: Occurrence, start: Date, end: Date) => {
    // A recurring occurrence drags its whole series by the same amount.
    const ds = start.getTime() - o.start.getTime();
    const de = end.getTime() - o.end.getTime();
    cal.save({
      id: o.ev.id,
      starts_at: new Date(new Date(o.ev.starts_at).getTime() + ds).toISOString(),
      ends_at: new Date(new Date(o.ev.ends_at).getTime() + de).toISOString(),
    });
  };

  const step = (dir: 1 | -1) =>
    setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : view === 'month' ? addMonths(c, dir) : addDays(c, 30 * dir)));

  // Atajos (como Notion Calendar): T hoy, D/W/M/A vistas, J/K o ←/→ avanzar, C crear, / buscar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      const v = VIEWS.find((x) => x.key === k);
      if (v) { if (!horario) setView(v.id); }
      else if (k === 't') setCursor(startOfDay(new Date()));
      else if (k === 'j' || k === 'arrowright') step(1);
      else if (k === 'k' || k === 'arrowleft') step(-1);
      else if (k === 'c') { const s = new Date(); s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0); create(s, new Date(s.getTime() + 3_600_000)); }
      else if (k === '/') { e.preventDefault(); setSearching(true); }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const title = (() => {
    if (view === 'month') return <><b className="font-semibold">{MONTHS[cursor.getMonth()]}</b> {cursor.getFullYear()}</>;
    if (view === 'day') return <><b className="font-semibold">{cursor.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric' })}</b> {MONTHS[cursor.getMonth()]}</>;
    const a = view === 'week' ? startOfWeek(cursor) : cursor;
    const b = addDays(a, view === 'week' ? 6 : 59);
    return a.getMonth() === b.getMonth()
      ? <><b className="font-semibold">{MONTHS[a.getMonth()]}</b> {a.getFullYear()}</>
      : <><b className="font-semibold">{MONTHS[a.getMonth()].slice(0, 3)} – {MONTHS[b.getMonth()].slice(0, 3)}</b> {b.getFullYear()}</>;
  })();

  const toggle = (key: 'apps' | 'kinds' | 'areas' | 'who', id: string) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const sameFilters = (a: Filters, b: Filters) => JSON.stringify({ ...a, q: '' }) === JSON.stringify({ ...b, q: '' });
  const activeCount = filters.apps.length + filters.kinds.length + filters.areas.length + (filters.nature ? 1 : 0) + filters.who.length + (filters.mode ? 1 : 0) + (filters.scope ? 1 : 0);

  // People that show up in the events on screen: the "Con quién" filter.
  const involved = useMemo(() => {
    const ids = new Set<string>();
    for (const o of allOcc) for (const id of [...o.ev.attendee_users, ...o.ev.attendee_people, ...o.ev.attendee_clients]) ids.add(id);
    for (const id of filters.who) ids.add(id);
    return [...ids].map((id) => ({ id, ...(people.get(id) ?? { name: '…', avatar_url: null }) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allOcc, people, filters.who]);

  if (cal.status === 'signed-out') return <p className="p-10 text-center text-white/50">Inicia sesión para ver tu calendario.</p>;

  const pill = (on: boolean) => `rounded-md px-2 py-1 text-left text-[13px] transition ${on ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/85'}`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      {rail && (
        <aside className="flex w-[248px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/10 px-3 py-4 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[80] max-lg:bg-[#0d0f14] max-lg:shadow-2xl">
          <button onClick={() => { const s = new Date(); s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0); create(s, new Date(s.getTime() + 3_600_000)); }} className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-black hover:bg-sky-400">
            <Plus className="h-4 w-4" /> Nuevo evento
          </button>

          {lockApp && <a href="#acomodar" className="-mt-2 flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10">Por acomodar</a>}

          <MiniMonth cursor={cursor} onPick={(d) => setCursor(d)} marks={allOcc} />

          <section>
            <h3 className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-white/35">Vistas</h3>
            <div className="flex flex-col">
              {[...BUILT_IN, ...saved].map((v) => (
                <div key={v.name} className="group flex items-center">
                  <button onClick={() => setFilters({ ...v.f, q: filters.q })} className={`${pill(sameFilters(filters, v.f))} flex-1`}>{v.name}</button>
                  {!v.builtIn && (
                    <button onClick={() => { const next = saved.filter((s) => s.name !== v.name); setSaved(next); write(VIEWS_KEY, next); }} className="hidden px-1 text-white/30 hover:text-rose-300 group-hover:block" aria-label="Quitar vista"><X className="h-3 w-3" /></button>
                  )}
                </div>
              ))}
              {activeCount > 0 && ![...BUILT_IN, ...saved].some((v) => sameFilters(filters, v.f)) && (
                <button
                  onClick={() => {
                    const name = window.prompt('Nombre de la vista', '');
                    if (!name?.trim()) return;
                    const next = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), f: { ...filters, q: '' } }];
                    setSaved(next);
                    write(VIEWS_KEY, next);
                  }}
                  className="px-2 py-1 text-left text-[13px] text-sky-300 hover:text-sky-200"
                >
                  + Guardar estos filtros
                </button>
              )}
            </div>
          </section>

          {!lockApp && (
            <section>
              <h3 className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-white/35">Apps</h3>
              <div className="flex flex-col">
                {dir.apps.map((a) => (
                  <button key={a.slug} onClick={() => toggle('apps', a.slug)} className={pill(filters.apps.includes(a.slug))}>{a.icon} {a.name}</button>
                ))}
              </div>
            </section>
          )}

          {areas.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center justify-between px-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/35">Áreas</h3>
                <button onClick={() => setEditAreas(true)} className="text-xs text-white/45 hover:text-white">Editar</button>
              </div>
              <div className="flex flex-col">
                {areas.map((a) => (
                  <button key={a.id} onClick={() => toggle('areas', a.id)} aria-pressed={filters.areas.includes(a.id)} className={`${pill(filters.areas.includes(a.id))} flex items-center gap-2`}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} /> {a.emoji} {a.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!areas.length && <section>
            <h3 className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-white/35">Tipo</h3>
            <div className="flex flex-col">
              {KINDS.map((k) => (
                <button key={k.id} onClick={() => toggle('kinds', k.id)} className={`${pill(filters.kinds.includes(k.id))} flex items-center gap-2`}>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} /> {k.label}
                </button>
              ))}
            </div>
          </section>}

          <section>
            <h3 className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-white/35">Dónde y de quién</h3>
            <div className="flex flex-wrap gap-1 px-1">
              {([['presencial', '📍 Presencial'], ['online', '🎥 Online']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setFilters((f) => ({ ...f, mode: f.mode === m ? '' : m }))} className={`rounded-full px-2.5 py-0.5 text-xs ${filters.mode === m ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/40' : 'bg-white/5 text-white/55 hover:bg-white/10'}`}>{l}</button>
              ))}
              {([['mine', '🔒 Míos'], ['mw', '🐺 Master Wolf'], ['invited', '✉️ Me invitaron']] as const).map(([s, l]) => (
                <button key={s} onClick={() => setFilters((f) => ({ ...f, scope: f.scope === s ? '' : s }))} className={`rounded-full px-2.5 py-0.5 text-xs ${filters.scope === s ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/40' : 'bg-white/5 text-white/55 hover:bg-white/10'}`}>{l}</button>
              ))}
            </div>
          </section>

          {involved.length > 0 && (
            <section>
              <h3 className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-white/35">Con quién</h3>
              <div className="flex flex-col">
                {involved.map((p) => (
                  <button key={p.id} onClick={() => toggle('who', p.id)} className={`${pill(filters.who.includes(p.id))} flex items-center gap-2`}>
                    <McAvatar name={p.name} url={p.avatar_url} size={20} /> <b className="truncate font-semibold">{p.name}</b>
                  </button>
                ))}
              </div>
            </section>
          )}

          {activeCount > 0 && (
            <button onClick={() => setFilters({ ...EMPTY, q: filters.q })} className="px-2 text-left text-xs text-white/40 hover:text-white/70">Limpiar filtros ({activeCount})</button>
          )}
          <p className="mt-auto px-2 text-[11px] leading-relaxed text-white/25">
            Atajos: <b>T</b> hoy · <b>D W M A</b> vistas · <b>J K</b> avanzar · <b>C</b> crear · <b>/</b> buscar. Arrastra en la grilla para crear; arrastra un evento para moverlo.
          </p>
        </aside>
      )}
      {rail && <div className="fixed inset-0 z-[79] bg-black/40 lg:hidden" onClick={() => setRail(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
          <button onClick={() => setRail((r) => !r)} className="relative rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" data-help="Filtros y vistas">
            <PanelLeft className="h-4 w-4" />
            {activeCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-black">{activeCount}</span>}
          </button>
          {horario ? (
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white/90 sm:text-xl">Tu semana tipo</h2>
              <p className="text-xs text-white/45">Lo que se repite. Arrastra en la grilla para agregar una rutina.</p>
            </div>
          ) : (
            <h2 className="min-w-0 text-lg capitalize text-white/90 sm:text-xl">{title}</h2>
          )}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5 max-sm:w-full max-sm:justify-between">
            {searching ? (
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2">
                <Search className="h-3.5 w-3.5 text-white/40" />
                <input
                  autoFocus
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Escape' && (setFilters((f) => ({ ...f, q: '' })), setSearching(false))}
                  onBlur={() => !filters.q && setSearching(false)}
                  placeholder="Buscar…"
                  className="w-32 bg-transparent py-1 text-sm text-white placeholder:text-white/30 focus:outline-none sm:w-44"
                />
              </div>
            ) : (
              <button onClick={() => setSearching(true)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" data-help="Buscar (/)"><Search className="h-4 w-4" /></button>
            )}
            {(!horario || view === 'day') && (
              <>
                <button onClick={() => setCursor(startOfDay(new Date()))} className="rounded-lg border border-white/10 px-2.5 py-1 text-sm text-white/80 hover:bg-white/10">Hoy</button>
                <button onClick={() => step(-1)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => step(1)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></button>
              </>
            )}
            {!horario && (
              <div className="ml-1 flex rounded-lg bg-white/5 p-0.5">
                {VIEWS.map((v) => (
                  <button key={v.id} onClick={() => setView(v.id)} className={`rounded-md px-1.5 py-1 text-xs font-medium sm:px-2.5 sm:text-sm ${view === v.id ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {horario && routineClashes.length > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/[0.07] px-4 py-2 text-sm text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>{routineClashes.slice(0, 3).join(' ')}</span>
          </div>
        )}
        {cal.status === 'error' ? (
          <p className="m-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">No se pudo leer el calendario. Recarga la página.</p>
        ) : view === 'month' ? (
          <>
          <FreeDays month={cursor} occ={occ} />
          <MonthGrid month={cursor} occ={occ} warned={warned} onOpen={open} onCreate={create} onChange={change} canEdit={canEdit} onDay={(d) => { setCursor(d); setView('day'); }} />
          </>
        ) : view === 'agenda' ? (
          <AgendaList occ={occ} warned={warnings} onOpen={open} from={cursor} apps={lockApp ? undefined : appNames} />
        ) : (
          <TimeGrid days={view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} occ={occ} warned={warned} onOpen={open} onCreate={create} onChange={change} canEdit={canEdit} startMin={horario ? 6 * 60 : undefined} dayNote={horario ? (d) => `${freeHours(d, occ)} h libres` : undefined} />
        )}
      </div>

      {draft && userId && (
        <EventEditor
          key={draft.id ?? `new-${draft.start.getTime()}`}
          draft={draft}
          lockApp={lockApp}
          areas={areas}
          dir={dir}
          userId={userId}
          isMw={cal.isMw}
          readOnly={!!draft.id && !canEdit(draft as CalEvent)}
          around={around}
          onSave={async (patch) => {
            if (detaching && !(await cal.skipOne(detaching))) return false;
            return !!(await cal.save(patch));
          }}
          onDelete={async (id) => {
            if (!window.confirm('¿Eliminar este evento? Si se repite, se borra toda la serie.')) return;
            await cal.remove(id);
            setDraft(null);
          }}
          onClose={() => setDraft(null)}
        />
      )}
      {ask && (
        <RepeatChoice
          title={ask.o.ev.title || 'Sin título'}
          moving={!!ask.move}
          failed={askError}
          onCancel={() => { setAsk(null); setAskError(false); }}
          onOne={() => {
            const { o, move } = ask;
            if (move) return run(() => cal.moveOne(o, move.start, move.end));
            setAsk(null);
            openOne(o);
          }}
          onSeries={() => {
            const { o, move } = ask;
            setAsk(null);
            if (move) moveSeries(o, move.start, move.end);
            else openSeries(o);
          }}
          onSkip={() => run(() => cal.skipOne(ask.o))}
        />
      )}
      {editAreas && <AreaManager areas={areas} onSave={saveArea} onRemove={removeArea} onClose={() => setEditAreas(false)} />}
    </div>
  );
}

function RepeatChoice({ title, moving, failed, onCancel, onOne, onSeries, onSkip }: {
  title: string; moving: boolean; failed: boolean;
  onCancel: () => void; onOne: () => void; onSeries: () => void; onSkip: () => void;
}) {
  const verb = moving ? 'Mover' : 'Editar';
  const option = 'w-full rounded-lg px-3 py-2 text-left text-sm transition';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onCancel} />
      <div role="dialog" aria-label="Evento repetido" className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#101218] p-4 shadow-2xl">
        <h2 className="truncate text-base font-semibold text-white">{title}</h2>
        <p className="mb-3 mt-0.5 text-sm text-white/50">Este evento se repite.</p>
        <button onClick={onOne} className={`${option} bg-sky-500 font-semibold text-black hover:bg-sky-400`}>{verb} solo este día</button>
        <button onClick={onSeries} className={`${option} mt-1 text-white/85 hover:bg-white/10`}>{verb} toda la serie</button>
        {!moving && <button onClick={onSkip} className={`${option} text-rose-300 hover:bg-rose-500/10`}>Quitar solo este día</button>}
        {failed && <p className="mt-2 text-sm text-rose-300">No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.</p>}
        <button onClick={onCancel} className={`${option} mt-1 text-white/50 hover:bg-white/10`}>Cancelar</button>
      </div>
    </BodyPortal>
  );
}

function MiniMonth({ cursor, onPick, marks }: { cursor: Date; onPick: (d: Date) => void; marks: Occurrence[] }) {
  const [month, setMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);
  const start = startOfWeek(month);
  const today = new Date();
  const busy = new Set(marks.map((o) => startOfDay(o.start).getTime()));
  return (
    <div className="px-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold capitalize text-white/80">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <span className="flex">
          <button onClick={() => setMonth((m) => addMonths(m, -1))} className="rounded p-0.5 text-white/40 hover:text-white"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded p-0.5 text-white/40 hover:text-white"><ChevronRight className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-white/30">
        {WEEKDAYS.map((w) => <span key={w}>{w[0].toUpperCase()}</span>)}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const isToday = sameDay(d, today);
          const sel = sameDay(d, cursor);
          return (
            <button
              key={d.getTime()}
              onClick={() => onPick(startOfDay(d))}
              className={`relative mx-auto my-px flex h-6 w-6 items-center justify-center rounded-full tabular-nums ${isToday ? 'bg-rose-500 font-semibold text-white' : sel ? 'bg-white/15 text-white' : d.getMonth() === month.getMonth() ? 'text-white/70 hover:bg-white/10' : 'text-white/25 hover:bg-white/5'}`}
            >
              {d.getDate()}
              {busy.has(startOfDay(d).getTime()) && !isToday && <span className="absolute bottom-0.5 h-0.5 w-0.5 rounded-full bg-sky-300" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Planificación mensual: los días que siguen sin nada agendado. */
const FreeDays: React.FC<{ month: Date; occ: Occurrence[] }> = ({ month, occ }) => {
  const today = startOfDay(new Date());
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
  const free = days.filter((d) => d >= today && !occ.some((o) => o.start < addDays(d, 1) && o.end > d)).map((d) => d.getDate());
  if (!free.length) return null;
  return <p className="px-4 py-2 text-xs text-white/50">Días libres este mes: <b className="font-semibold text-white/80">{free.join(', ')}</b></p>;
};
