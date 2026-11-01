'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChartGantt, LayoutDashboard, LayoutGrid, Newspaper, Plus, Table2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Popover } from '@/components/databases/DatabaseTable';
import { Calendar, DEFAULT_CARD, Gallery, RowPeek, type Item, type ViewType } from '@/components/tables/tableViews';
import { Dashboard, Feed, Timeline, defaultWidgets, type DashCol, type TimelineZoom, type Widget } from '@/components/tables/moreViews';
import type { DbProperty } from '@/utils/databases';

/**
 * Vistas for the Bases de datos of Notas (Emanuel, 2026-10-26): the same six as every Empresa
 * table — Tabla · Galería · Calendario · Cronograma · Panel de control · Feed — with the same
 * components (company/tableViews + company/moreViews). Saved per database in `table_views`
 * (key `db:<id>`, the database's owner_scope; no migration) + a localStorage copy.
 */

export type DbView = { id: string; name: string; type: ViewType; calCol?: string | null; tl?: { start?: string | null; end?: string | null; zoom?: TimelineZoom }; dash?: Widget[] };
type Doc = { views: DbView[]; active: string };

export const VIEW_TYPES: [ViewType, string, React.ComponentType<{ className?: string }>][] = [
  ['table', 'Tabla', Table2],
  ['gallery', 'Galería', LayoutGrid],
  ['calendar', 'Calendario', CalendarDays],
  ['timeline', 'Cronograma', ChartGantt],
  ['dashboard', 'Panel de control', LayoutDashboard],
  ['feed', 'Feed', Newspaper],
];
const vid = () => Math.random().toString(36).slice(2, 10);
const FIRST: Doc = { views: [{ id: 'main', name: 'Tabla', type: 'table' }], active: 'main' };

export function useDbViews(databaseId: string, scope: string | undefined) {
  const key = `db:${databaseId}`;
  const ls = `mf-views:${scope ?? 'local'}:${key}`;
  const [doc, setDoc] = useState<Doc>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem(ls) : null;
      return v ? (JSON.parse(v) as Doc) : FIRST;
    } catch {
      return FIRST;
    }
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!scope) return;
    let alive = true;
    supabase
      .from('table_views')
      .select('data')
      .eq('owner_scope', scope)
      .eq('table_key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.data && Array.isArray((data.data as Doc).views)) setDoc(data.data as Doc);
      });
    return () => {
      alive = false;
    };
  }, [scope, key]);
  const save = (next: Doc) => {
    setDoc(next);
    try {
      localStorage.setItem(ls, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (!scope) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      supabase.from('table_views').upsert({ owner_scope: scope, table_key: key, data: next, updated_at: new Date().toISOString() }, { onConflict: 'owner_scope,table_key' }).then(() => {});
    }, 600);
  };
  const active = doc.views.find((v) => v.id === doc.active) ?? doc.views[0];
  return {
    views: doc.views,
    active,
    select: (id: string) => save({ ...doc, active: id }),
    add: (type: ViewType) => {
      const name = VIEW_TYPES.find(([t]) => t === type)![1];
      const v: DbView = { id: vid(), name, type };
      save({ views: [...doc.views, v], active: v.id });
    },
    rename: (id: string, name: string) => save({ ...doc, views: doc.views.map((v) => (v.id === id ? { ...v, name } : v)) }),
    remove: (id: string) => {
      const views = doc.views.filter((v) => v.id !== id);
      if (views.length) save({ views, active: doc.active === id ? views[0].id : doc.active });
    },
    patch: (p: Partial<DbView>) => save({ ...doc, views: doc.views.map((v) => (v.id === active.id ? { ...v, ...p } : v)) }),
  };
}
export type DbViewsApi = ReturnType<typeof useDbViews>;

/** The tabs + "+ Nueva vista" (same six as Empresa). Double-click a tab to rename; × to remove. */
export const DbViewsBar: React.FC<{ api: DbViewsApi }> = ({ api }) => {
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {api.views.map((v) => {
        const on = v.id === api.active.id;
        const Icon = VIEW_TYPES.find(([t]) => t === v.type)?.[2];
        return renaming === v.id ? (
          <input
            key={v.id}
            autoFocus
            defaultValue={v.name}
            onBlur={(e) => (api.rename(v.id, e.target.value.trim() || v.name), setRenaming(null))}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
            className="w-32 rounded-full border border-sky-500 bg-zinc-900 px-3 py-1 text-xs text-white focus:outline-none"
          />
        ) : (
          <span key={v.id} className={`group/v inline-flex items-center rounded-full border text-xs font-semibold ${on ? 'border-sky-400 bg-sky-500 text-white' : 'border-white/15 text-zinc-300 hover:border-white/30'}`}>
            <button type="button" onClick={() => api.select(v.id)} onDoubleClick={() => setRenaming(v.id)} title="Doble clic para cambiar el nombre" className="inline-flex items-center gap-1 py-1 pl-3 pr-2">
              {Icon && <Icon className="h-3 w-3" />}
              {v.name}
            </button>
            {api.views.length > 1 && (
              <button type="button" onClick={() => window.confirm(`¿Quitar la vista “${v.name}”? Los datos no se borran.`) && api.remove(v.id)} aria-label={`Quitar ${v.name}`} className={`mr-1 rounded-full p-0.5 ${on ? 'text-white/80 hover:bg-white/20' : 'text-zinc-500 opacity-0 hover:bg-white/10 group-hover/v:opacity-100'}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      <button type="button" onClick={(e) => setAdding(e.currentTarget)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1 text-xs font-semibold text-zinc-400 hover:border-white/40 hover:text-white">
        <Plus className="h-3.5 w-3.5" /> Nueva vista
      </button>
      {adding && (
        <Popover anchor={adding} onClose={() => setAdding(null)} width={320}>
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Agregar una nueva vista</p>
          <div className="grid grid-cols-3 gap-1.5">
            {VIEW_TYPES.map(([t, l, Icon]) => (
              <button key={t} type="button" onClick={() => (api.add(t), setAdding(null))} className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06]">
                <Icon className="h-5 w-5 text-zinc-300" />
                {l}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
};

/** Every non-table view of a database, over the rows already searched / sorted. */
export const DbViewBody: React.FC<{ api: DbViewsApi; props: DbProperty[]; items: Item[]; empty: string }> = ({ api, props, items, empty }) => {
  const [peek, setPeek] = useState<string | null>(null);
  const v = api.active;
  const dates = props.filter((p) => p.type === 'date').map((p) => p.id);
  const sel = 'rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none';
  const peekItem = peek ? items.find((i) => i.key === peek) : null;
  const dashCols: DashCol[] = props.map((p) => ({
    key: p.id,
    label: p.name,
    kind: p.type === 'number' || p.type === 'formula' ? 'number' : p.type === 'date' ? 'date' : p.type === 'select' || p.type === 'checkbox' ? 'select' : 'text',
    options: p.type === 'checkbox' ? 2 : p.options?.length ?? 0,
  }));
  const calCol = v.calCol && dates.includes(v.calCol) ? v.calCol : dates[0] ?? null;
  const tl = v.tl ?? {};
  const start = tl.start && dates.includes(tl.start) ? tl.start : dates[0] ?? null;
  const end = tl.end === null ? null : tl.end && dates.includes(tl.end) ? tl.end : (dates.find((d) => d !== start) ?? null);
  const dateSelect = (value: string | null, onChange: (v: string | null) => void, optional?: boolean) => (
    <select className={sel} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {optional && <option value="">Mismo día</option>}
      {props
        .filter((p) => p.type === 'date')
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
  return (
    <div className="mt-3">
      {v.type === 'calendar' && dates.length > 1 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">Calendario por {dateSelect(calCol, (c) => api.patch({ calCol: c }))}</div>
      )}
      {v.type === 'timeline' && dates.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Empieza {dateSelect(start, (c) => api.patch({ tl: { ...tl, start: c } }))} · Termina {dateSelect(end, (c) => api.patch({ tl: { ...tl, end: c } }), true)}
        </div>
      )}
      {v.type === 'gallery' && <Gallery items={items} card={DEFAULT_CARD} onOpen={setPeek} empty={empty} />}
      {v.type === 'calendar' && <Calendar items={items} dateKey={calCol} onOpen={setPeek} />}
      {v.type === 'timeline' && <Timeline items={items} startKey={start} endKey={end} zoom={tl.zoom ?? 'mes'} onZoom={(z) => api.patch({ tl: { ...tl, zoom: z } })} onOpen={setPeek} />}
      {v.type === 'dashboard' && <Dashboard items={items} cols={dashCols} widgets={v.dash ?? defaultWidgets(dashCols)} onChange={(w) => api.patch({ dash: w })} />}
      {v.type === 'feed' && <Feed items={items} onOpen={setPeek} empty={empty} />}
      {peekItem && <RowPeek item={peekItem} z={90} onClose={() => setPeek(null)} />}
    </div>
  );
};
