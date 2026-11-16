'use client';

import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, CheckSquare, Eye, EyeOff, KeyRound, ListFilter, Maximize2, Minimize2, Plus, Search, SlidersHorizontal, Square, X } from 'lucide-react';
import { McAvatar } from '@/components/calendar/McAvatar';
import { useAsk } from '@/components/ui/confirm';
import { FloatingPanel, NameMenu, SectionCtx, SectionSettings, useStuck } from '@/components/tables/section';
import { KIND_OPS, OP_LABEL, passes, type ColKind, type Filter, type FilterOp } from '@/components/tables/table';
import { LANES, STATUS_INFO, TAG_INFO, laneOf, lanesOf, moveToLane, priorityOf, showDate, type DailyLane, type DailyTask } from '@/utils/daily';

/**
 * Tablero de la Daily (Emanuel, 2026-10-28) — under the table, like Notion's "Tablero": one column per
 * "who does it" (Juntos · Emanuel / Moisés · Claude Work · Faltan Permisos) + En Revisión + ✅ Completo.
 * Drag a card to another column to change who does it (or to Completo to close it); click it to open its page.
 * Archived tasks aren't shown.
 *
 * Its own toolbar (Emanuel, 2026-11-16) — independent from the table above: Filtro · Ordenar · Buscar ·
 * Agrandar · Configuración (columns shown + the section's size / move / look). It stays fixed on top while
 * scrolling. Per browser: localStorage `organiza-tablero:<id>`.
 * Selección (Emanuel, 2026-11-16): checkbox on each card, right-click → Seleccionar / toda la columna /
 * todas; while something is selected a click toggles the card instead of opening it. The BulkBar does the rest.
 */
type Prefs = { filters: Filter[]; sort: 'prioridad' | 'entrega' | 'nombre' | 'reciente'; hidden: DailyLane[] };
const EMPTY: Prefs = { filters: [], sort: 'prioridad', hidden: [] };
/**
 * The board filters exactly like the table above (Emanuel, 2026-11-16: "no destruyas lo que ya está bien"):
 * same panel (+ Agregar filtro · propiedad · condición · valor / «es cualquiera de»), same operators and the
 * same `passes` from components/tables/table.tsx. A property with several values (Ejecutor, Cliente) passes
 * when ANY of them does (or, for "no es" / "no contiene", when NONE breaks it).
 */
type Prop = { key: string; label: string; kind: ColKind; values: (t: DailyTask) => string[] };
const PROPS: Prop[] = [
  { key: 'nombre', label: 'Nombre', kind: 'text', values: (t) => [t.title] },
  { key: 'estado', label: 'Estado', kind: 'select', values: (t) => [STATUS_INFO[t.status].label] },
  { key: 'etiqueta', label: 'Etiqueta', kind: 'select', values: (t) => [TAG_INFO[t.tag].label] },
  { key: 'app', label: 'Aplicación', kind: 'select', values: (t) => [t.app] },
  { key: 'ejecutor', label: 'Ejecutor', kind: 'select', values: (t) => t.executors },
  { key: 'cliente', label: 'Cliente', kind: 'select', values: (t) => t.clients ?? [] },
  { key: 'empieza', label: 'Empieza', kind: 'date', values: (t) => [showDate(t.start)] },
  { key: 'entrega', label: 'Entrega', kind: 'date', values: (t) => [showDate(t.due)] },
  { key: 'descripcion', label: 'Descripción', kind: 'text', values: (t) => [t.description] },
];
const propOf = (k: string) => PROPS.find((p) => p.key === k) ?? PROPS[0];
function passesTask(t: DailyTask, f: Filter): boolean {
  const vals = propOf(f.col).values(t).filter((v) => v.trim());
  if (f.op === 'vacio') return vals.length === 0;
  if (f.op === 'no_vacio') return vals.length > 0;
  if (!vals.length) return passes('', f);
  return f.op === 'no_es' || f.op === 'no_contiene' ? vals.every((v) => passes(v, f)) : vals.some((v) => passes(v, f));
}
const SORTS: [Prefs['sort'], string][] = [
  ['prioridad', 'Prioridad (como la tabla)'],
  ['entrega', 'Entrega más cercana'],
  ['nombre', 'Nombre (A → Z)'],
  ['reciente', 'Más nuevas primero'],
];
const iconBtn = 'relative rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white';
const selCls = 'rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none';

function usePrefs(id: string): [Prefs, (p: Prefs) => void] {
  const key = `organiza-tablero:${id}`;
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        setPrefs({ ...EMPTY, ...p, filters: Array.isArray(p.filters) ? p.filters : [] });
      }
    } catch {}
  }, [key]);
  return [
    prefs,
    (p) => {
      setPrefs(p);
      try {
        localStorage.setItem(key, JSON.stringify(p));
      } catch {}
    },
  ];
}

export const DailyBoard: React.FC<{
  id: string;
  tasks: DailyTask[];
  now: number;
  photoOf: (name: string) => string | null;
  onPatch: (id: string, p: Partial<DailyTask>) => void;
  onAdd: (p: Partial<DailyTask>) => void;
  renderOpen: (t: DailyTask, children: React.ReactNode) => React.ReactNode;
  selected: string[];
  onToggle: (id: string) => void;
  onSelect: (ids: string[]) => void;
}> = ({ id, tasks, now, photoOf, onPatch, onAdd, renderOpen, selected, onToggle, onSelect }) => {
  const ask = useAsk();
  const section = useContext(SectionCtx);
  const [over, setOver] = useState<DailyLane | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [prefs, save] = usePrefs(id);
  const [panel, setPanel] = useState<{ kind: 'filter' | 'sort' | 'settings'; anchor: DOMRect } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [stuckRef, stuck] = useStuck<HTMLDivElement>(fullscreen);
  const [menu, setMenu] = useState<{ x: number; y: number; t: DailyTask; lane: DailyLane } | null>(null);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !panel && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, panel]);

  const askPermission = (current?: string | null) =>
    ask({
      title: '¿Qué permiso le falta a Claude?',
      message: 'Lo que tienes que aprobar o darle para que termine. Queda escrito en la tarjeta.',
      input: { label: 'Permiso', placeholder: 'Ej. correr la migración en Supabase, la llave de la pasarela…' },
      confirmLabel: 'Guardar',
    }).then((v) => (v === null ? null : v.trim() || current || 'Tu aprobación'));

  const drop = async (lane: DailyLane, id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || lanesOf(t).includes(lane)) return;
    if (lane === 'permiso') {
      const permission = await askPermission(t.permission);
      if (permission === null) return;
      onPatch(t.id, { executors: ['Claude'], permission, ...(t.status === 'listo' ? { status: 'en_curso' as const } : {}) });
    } else onPatch(t.id, moveToLane(t, lane));
  };
  const addIn = async (lane: DailyLane) => {
    if (lane === 'permiso') {
      const permission = await askPermission();
      if (permission === null) return;
      return onAdd({ executors: ['Claude'], permission });
    }
    onAdd(moveToLane({ executors: [] }, lane));
  };

  // Filter · search · sort (only the board's own; the table keeps its own).
  const q = query.trim().toLowerCase();
  const live = tasks.filter((t) => !t.archived);
  const optionsOf = (k: string) => Array.from(new Set(live.flatMap((t) => propOf(k).values(t)).filter((v) => v.trim()))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const filters = prefs.filters;
  let open = live.filter((t) => filters.every((f) => passesTask(t, f)) && (!q || [t.title, t.description, t.app, ...t.executors, ...(t.clients ?? [])].join(' ').toLowerCase().includes(q)));
  if (prefs.sort === 'entrega') open = [...open].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  if (prefs.sort === 'nombre') open = [...open].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  if (prefs.sort === 'reciente') open = [...open].sort((a, b) => b.order - a.order);
  const lanes = LANES.filter((l) => !prefs.hidden.includes(l.id));
  const shown = open.filter((t) => lanes.some((l) => lanesOf(t).includes(l.id)));
  const nFilters = filters.length;
  const selecting = selected.length > 0;
  const laneIds = (lane: DailyLane) => shown.filter((t) => lanesOf(t).includes(lane)).map((t) => t.id);
  const toggleMany = (ids: string[]) => {
    const all = ids.length > 0 && ids.every((x) => selected.includes(x));
    onSelect(all ? selected.filter((x) => !ids.includes(x)) : Array.from(new Set([...selected, ...ids])));
  };
  const openPanel = (kind: 'filter' | 'sort' | 'settings') => (e: React.MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget.getBoundingClientRect();
    setPanel((p) => (p?.kind === kind ? null : { kind, anchor }));
  };

  const toolbar = (
    <div className={`sticky top-0 z-20 -mx-2 mb-2 flex flex-wrap items-center justify-end gap-1 rounded-xl px-2 py-1 transition-colors ${stuck ? 'bg-[#101218]/85 backdrop-blur' : ''}`}>
      <p className="mr-auto text-xs text-zinc-500">
        {nFilters || q ? `${shown.length} de ${live.length} · ` : ''}Arrastra una tarjeta para cambiar quién la hace · clic para abrir · clic derecho para seleccionar.
      </p>
      {searchOpen && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setSearchOpen(false))}
            placeholder="Buscar en el tablero…"
            className="w-48 rounded-lg border border-white/10 bg-zinc-900 py-1 pl-7 pr-6 text-xs text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" aria-label="Borrar búsqueda">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <button type="button" className={`${iconBtn} ${nFilters ? 'text-sky-300' : ''}`} onClick={openPanel('filter')} data-help-title="Filtro" data-help="Muestra solo las tarjetas que cumplen una condición. Es solo del tablero: la tabla de arriba tiene el suyo." aria-label="Filtro">
        <ListFilter className="h-4 w-4" />
        {nFilters > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[9px] font-bold text-white">{nFilters}</span>}
      </button>
      <button type="button" className={`${iconBtn} ${prefs.sort !== 'prioridad' ? 'text-sky-300' : ''}`} onClick={openPanel('sort')} data-help-title="Ordenar" data-help="En qué orden van las tarjetas dentro de cada columna." aria-label="Ordenar">
        <ArrowDownUp className="h-4 w-4" />
      </button>
      <button type="button" className={`${iconBtn} ${searchOpen || query ? 'text-sky-300' : ''}`} onClick={() => (searchOpen ? (setSearchOpen(false), setQuery('')) : setSearchOpen(true))} data-help-title="Buscar" data-help="Busca una palabra en las tarjetas del tablero." aria-label="Buscar">
        <Search className="h-4 w-4" />
      </button>
      <button type="button" className={iconBtn} onClick={() => setFullscreen((f) => !f)} data-help-title={fullscreen ? 'Salir de pantalla completa' : 'Agrandar'} data-help={fullscreen ? 'Vuelve el tablero a su lugar en la página.' : 'Abre el tablero en pantalla completa.'} aria-label="Agrandar">
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button type="button" className={`${iconBtn} ${panel?.kind === 'settings' ? 'text-sky-300' : ''}`} onClick={openPanel('settings')} data-help-title="Configuración" data-help="Qué columnas se muestran y el tamaño y aspecto de la sección." aria-label="Configuración">
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </div>
  );

  const panelNode = panel && (
    <FloatingPanel anchor={panel.anchor} width={panel.kind === 'settings' ? 320 : 300} onClose={() => setPanel(null)}>
      {panel.kind === 'filter' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-white">Filtro</p>
          {filters.length === 0 && <p className="text-zinc-500">Sin filtros. Agrega uno para ver solo las tarjetas que cumplan.</p>}
          {filters.map((f, i) => {
            const setFilters = (next: Filter[]) => save({ ...prefs, filters: next });
            const upd = (patch: Partial<Filter>) => setFilters(filters.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const info = propOf(f.col);
            const ops = KIND_OPS[info.kind];
            const op = ops.includes(f.op) ? f.op : ops[0];
            const needsValue = op !== 'vacio' && op !== 'no_vacio';
            const options = info.kind === 'select' ? optionsOf(info.key) : [];
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] p-2">
                <select className={selCls} value={info.key} onChange={(e) => upd({ col: e.target.value, op: KIND_OPS[propOf(e.target.value).kind][0], value: '' })}>
                  {PROPS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select className={selCls} value={op} onChange={(e) => upd({ op: e.target.value as FilterOp })}>
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
                {needsValue && op === 'en' && (
                  <div className="flex w-full flex-wrap gap-1">
                    {options.map((o) => {
                      const chosen = f.value.split('|').filter(Boolean);
                      const on = chosen.includes(o);
                      return (
                        <button key={o} type="button" onClick={() => upd({ value: (on ? chosen.filter((x) => x !== o) : [...chosen, o]).join('|') })} className={`rounded-md border px-1.5 py-0.5 ${on ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
                {needsValue && op !== 'en' &&
                  (info.kind === 'select' && (op === 'es' || op === 'no_es') ? (
                    <select className={`${selCls} max-w-[160px]`} value={f.value} onChange={(e) => upd({ value: e.target.value })}>
                      <option value="">Elige…</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : info.kind === 'date' ? (
                    <input type="date" className={selCls} value={f.value} onChange={(e) => upd({ value: e.target.value })} />
                  ) : (
                    <input className={`${selCls} w-28`} value={f.value} onChange={(e) => upd({ value: e.target.value })} placeholder="Valor" />
                  ))}
                <button type="button" onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-zinc-500 hover:text-rose-300" aria-label="Quitar filtro">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => save({ ...prefs, filters: [...filters, { col: 'estado', op: 'es', value: '' }] })} className="inline-flex items-center gap-1 rounded-lg px-1 py-1 font-semibold text-sky-300 hover:text-sky-200">
            <Plus className="h-3.5 w-3.5" /> Agregar filtro
          </button>
          {filters.length > 1 && (
            <button type="button" className="ml-3 text-[11px] font-semibold text-zinc-500 hover:text-white" onClick={() => save({ ...prefs, filters: [] })}>
              Quitar todos
            </button>
          )}
        </div>
      )}
      {panel.kind === 'sort' && (
        <div className="space-y-1">
          <p className="mb-1.5 text-sm font-bold text-white">Ordenar tarjetas</p>
          {SORTS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => save({ ...prefs, sort: v })} className={`block w-full rounded-lg px-2 py-1.5 text-left font-semibold ${prefs.sort === v ? 'bg-sky-500/15 text-sky-300' : 'hover:bg-white/[0.06]'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {panel.kind === 'settings' && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-white">Configuración</p>
          {section && <SectionSettings api={section} only={['fold']} />}
          <div>
            <p className="mb-1.5 font-semibold text-white">Columnas</p>
            {LANES.map((l) => {
              const hidden = prefs.hidden.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={!hidden && lanes.length < 2}
                  onClick={() => save({ ...prefs, hidden: hidden ? prefs.hidden.filter((x) => x !== l.id) : [...prefs.hidden, l.id] })}
                  className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 hover:bg-white/[0.06] disabled:opacity-40"
                >
                  <span className={hidden ? 'text-zinc-500' : 'text-zinc-200'}>{l.title}</span>
                  {hidden ? <EyeOff className="h-3.5 w-3.5 text-zinc-500" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
          {section && (
            <div className="border-t border-white/[0.08] pt-3">
              <p className="mb-2 font-semibold text-white">Sección · {section.title}</p>
              <SectionSettings api={section} only={['move', 'look']} />
            </div>
          )}
        </div>
      )}
    </FloatingPanel>
  );

  const board = (
    <section>
      <div ref={stuckRef} className="h-px" aria-hidden />
      {toolbar}
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {lanes.map((lane) => {
          const cards = open.filter((t) => lanesOf(t).includes(lane.id));
          const ids = cards.map((t) => t.id);
          const allSel = ids.length > 0 && ids.every((x) => selected.includes(x));
          return (
            <div
              key={lane.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(lane.id);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDragging(null);
                const id = e.dataTransfer.getData('text/daily-task');
                if (id) drop(lane.id, id);
              }}
              className={`group/lane flex w-[290px] shrink-0 flex-col gap-2 rounded-2xl p-2.5 ring-1 transition xl:w-auto xl:min-w-0 xl:flex-1 ${lane.col} ${over === lane.id ? 'ring-2 ring-sky-400/60' : ''}`}
            >
              <div className="flex items-center gap-2 px-1 pt-0.5" data-help={lane.hint}>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${lane.head}`}>
                  <span className={`h-2 w-2 rounded-full ${lane.dot}`} />
                  {lane.title}
                </span>
                <span className="text-sm font-semibold text-zinc-500">{cards.length}</span>
                {ids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleMany(ids)}
                    className={`ml-auto rounded-md p-0.5 text-zinc-400 hover:text-white ${selecting ? '' : 'opacity-0 focus:opacity-100 group-hover/lane:opacity-100'}`}
                    aria-label={allSel ? 'Quitar la columna de la selección' : 'Seleccionar toda la columna'}
                    data-help={allSel ? 'Quitar la columna de la selección' : 'Seleccionar todas las tarjetas de esta columna'}
                  >
                    {allSel ? <CheckSquare className="h-4 w-4 text-sky-300" /> : <Square className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {cards.map((t) => {
                const p = priorityOf(t, now);
                const tone = { ok: 'text-emerald-300', soon: 'text-amber-300', late: 'text-rose-300', done: 'text-zinc-400', none: 'text-zinc-500' }[p.tone];
                const on = selected.includes(t.id);
                const content = (
                  <div className="space-y-2 px-3 py-2.5 text-left">
                    <p className="line-clamp-3 pr-5 text-sm font-semibold leading-snug text-white">{t.title}</p>
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TAG_INFO[t.tag].cls}`}>{TAG_INFO[t.tag].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_INFO[t.status].cls}`}>{STATUS_INFO[t.status].label}</span>
                    </div>
                    {t.permission?.trim() && lane.id === 'permiso' && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
                        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><b>Falta:</b> {t.permission}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={`font-semibold ${tone}`}>{p.text}</span>
                      <span className="text-zinc-500">{t.app}</span>
                    </div>
                    {t.executors.length > 0 && (
                      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                        {t.executors.map((n) => (
                          <span key={n} className="inline-flex items-center gap-1">
                            <McAvatar name={n} url={photoOf(n)} size={16} />
                            <b className="text-xs font-semibold text-zinc-200">{n.split(' ')[0]}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/daily-task', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(t.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, t, lane: lane.id });
                    }}
                    className={`group/card relative cursor-grab rounded-xl border bg-[#15171c] shadow-sm transition active:cursor-grabbing ${on ? 'border-sky-400 ring-2 ring-sky-400/40' : 'border-white/10 hover:border-white/25'} ${dragging === t.id ? 'opacity-40' : lane.id === 'listo' && !on ? 'opacity-70 hover:opacity-100' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(t.id)}
                      aria-label="Seleccionar tarea"
                      data-help="Marca varias para moverlas, cambiarlas o borrarlas juntas"
                      className={`absolute right-2.5 top-2.5 z-[1] h-3.5 w-3.5 cursor-pointer accent-sky-500 ${selecting ? '' : 'opacity-0 focus:opacity-100 group-hover/card:opacity-100'}`}
                    />
                    {/* While selecting, a click adds / removes the card instead of opening its page. */}
                    {selecting ? (
                      <button type="button" onClick={() => onToggle(t.id)} className="block w-full cursor-[inherit]">
                        {content}
                      </button>
                    ) : (
                      renderOpen(t, content)
                    )}
                  </div>
                );
              })}
              {lane.id !== 'listo' && lane.id !== 'revision' && (
                <button
                  type="button"
                  onClick={() => addIn(lane.id)}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <Plus className="h-4 w-4" /> Nueva tarea
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && (() => {
        const lane = menu.lane;
        const col = laneIds(lane);
        const title = LANES.find((l) => l.id === lane)?.title ?? '';
        return (
          <NameMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              { label: selected.includes(menu.t.id) ? 'Quitar de la selección' : 'Seleccionar', icon: <CheckSquare className="h-3.5 w-3.5" />, onClick: () => onToggle(menu.t.id) },
              { label: `Seleccionar toda la columna ${title}`, icon: <CheckSquare className="h-3.5 w-3.5" />, onClick: () => onSelect(Array.from(new Set([...selected, ...col]))) },
              { label: 'Seleccionar todas', icon: <CheckSquare className="h-3.5 w-3.5" />, onClick: () => onSelect(shown.map((t) => t.id)) },
              ...(selecting ? [{ label: 'Quitar la selección', icon: <X className="h-3.5 w-3.5" />, onClick: () => onSelect([]) }] : []),
            ]}
          />
        );
      })()}
      {panelNode}
    </section>
  );

  if (fullscreen && typeof document !== 'undefined')
    return (
      <>
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
          El tablero está abierto en pantalla completa.{' '}
          <button type="button" className="font-semibold text-sky-300" onClick={() => setFullscreen(false)}>
            Volver aquí
          </button>
        </div>
        {createPortal(
          <div className="mf-noscroll fixed inset-0 z-[70] overflow-auto bg-[#0b0d12] p-4 sm:p-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white">{section?.title ?? 'Tablero'}</h3>
              <button type="button" onClick={() => setFullscreen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {board}
          </div>,
          document.body,
        )}
      </>
    );
  return board;
};
