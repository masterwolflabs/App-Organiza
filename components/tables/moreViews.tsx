'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Hash, PieChart, Plus, X } from 'lucide-react';
import { dateOf, type Item } from '@/components/tables/tableViews';

/**
 * Feed · Cronograma · Panel de control for every Empresa database (Emanuel, 2026-10-26 —
 * "que estén todas": Tabla, Galería, Calendario, Cronograma, Panel de control, Feed).
 * Same contract as Galería / Calendario: they get the rows the (hidden) table shows,
 * already filtered and sorted, as properties with the SAME cell content and its text.
 */

const isEmpty = (t: string) => ['', '—', '-'].includes(t.trim());
const emptyBox = (msg: string) => <p className="rounded-2xl border border-white/[0.08] px-3 py-8 text-center text-sm text-zinc-500">{msg}</p>;

// ── Feed ───────────────────────────────────────────────────────────────────
/** Each row as a post, one under the other (Notion's Feed). Click opens the row. */
export const Feed: React.FC<{ items: Item[]; onOpen: (key: string) => void; empty: string }> = ({ items, onOpen, empty }) => {
  if (!items.length) return emptyBox(empty);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {items.map((it) => {
        const [title, ...rest] = it.props;
        const shown = rest.filter((p) => !isEmpty(p.text));
        return (
          <article
            key={it.key}
            onClick={(e) => !(e.target as HTMLElement).closest('button,a,input,select,textarea,label,[data-editable]') && onOpen(it.key)}
            className="cursor-pointer rounded-2xl border border-white/10 bg-[#141922] p-5 transition-colors hover:border-white/20"
          >
            {title && <div className="text-lg font-bold leading-snug text-white [&_.line-clamp-2]:line-clamp-2">{title.node}</div>}
            {shown.length > 0 && (
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {shown.map((p) => (
                  <div key={p.key} className="grid min-w-0 grid-cols-[110px_1fr] items-center gap-2">
                    <dt className="truncate text-xs text-zinc-500">{p.label}</dt>
                    <dd className="min-w-0 text-sm text-zinc-200">{p.node}</dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
    </div>
  );
};

// ── Cronograma ─────────────────────────────────────────────────────────────
const DAY = 86400000;
const toDay = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const fromDay = (n: number) => new Date(n * DAY);
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export type TimelineZoom = 'semana' | 'mes' | 'trimestre';
const DAY_PX: Record<TimelineZoom, number> = { semana: 44, mes: 16, trimestre: 6 };
const ROW = 40;
const strip = (k: string) => k.replace(/^\.\$/, '');

/**
 * Bars from a start date to an end date (Notion's Timeline). With a "depende de" relation
 * to the same table, an arrow goes from the task it waits for to this one.
 */
export const Timeline: React.FC<{
  items: Item[];
  startKey: string | null;
  endKey: string | null;
  depsOf?: (key: string) => string[];
  zoom: TimelineZoom;
  onZoom: (z: TimelineZoom) => void;
  onOpen: (key: string) => void;
}> = ({ items, startKey, endKey, depsOf, zoom, onZoom, onOpen }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const today = toDay(new Date().toISOString().slice(0, 10));
  const rows = useMemo(
    () =>
      items.map((it) => {
        const s = startKey ? dateOf(it.all.find((p) => p.key === startKey)?.text ?? '') : null;
        const e = endKey ? dateOf(it.all.find((p) => p.key === endKey)?.text ?? '') : null;
        const a = s ? toDay(s) : e ? toDay(e) : null;
        const b = e ? toDay(e) : a;
        return { it, from: a === null ? null : Math.min(a, b!), to: a === null ? null : Math.max(a, b!) };
      }),
    [items, startKey, endKey],
  );
  const placed = rows.filter((r) => r.from !== null);
  const min = Math.min(today - 14, ...placed.map((r) => r.from!)) - 7;
  const max = Math.max(today + 30, ...placed.map((r) => r.to!)) + 14;
  const px = DAY_PX[zoom];
  const width = (max - min + 1) * px;
  const x = (d: number) => (d - min) * px;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, x(today) - scroller.current.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, startKey]);
  if (!startKey) return emptyBox('Esta tabla no tiene una columna de fecha para armar el cronograma.');

  // Header: months (and day numbers when zoomed in).
  const months: { label: string; left: number; w: number }[] = [];
  for (let d = min; d <= max; ) {
    const dt = fromDay(d);
    const next = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / DAY);
    const end = Math.min(next, max + 1);
    months.push({ label: `${MONTHS_SHORT[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`, left: x(d), w: (end - d) * px });
    d = end;
  }
  const index = new Map(rows.map((r, i) => [strip(r.it.key), i]));
  const arrows: { d: string }[] = [];
  if (depsOf)
    rows.forEach((r, i) => {
      if (r.from === null) return;
      for (const dep of depsOf(r.it.key)) {
        const j = index.get(strip(dep));
        if (j === undefined || rows[j].from === null) continue;
        const x1 = x(rows[j].to!) + px;
        const y1 = j * ROW + ROW / 2;
        const x2 = x(r.from);
        const y2 = i * ROW + ROW / 2;
        const mid = Math.max(x1 + 10, Math.min(x2 - 10, x1 + 10));
        arrows.push({ d: `M${x1},${y1} H${mid} V${y2} H${x2 - 2}` });
      }
    });
  const titleOf = (it: Item) => it.props[0]?.text.trim() || it.all[0]?.text.trim() || '—';

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
        <span className="text-xs text-zinc-500">{placed.length < rows.length ? `${rows.length - placed.length} sin fecha (no se dibujan)` : `${rows.length} filas`}</span>
        <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-xs font-semibold" role="group" aria-label="Zoom">
          {(['semana', 'mes', 'trimestre'] as const).map((z) => (
            <button key={z} type="button" onClick={() => onZoom(z)} className={`rounded-md px-2 py-0.5 capitalize ${zoom === z ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
              {z}
            </button>
          ))}
          <button
            type="button"
            onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, x(today) - scroller.current.clientWidth / 3))}
            className="ml-1 rounded-md px-2 py-0.5 text-zinc-300 hover:bg-white/[0.08]"
          >
            Hoy
          </button>
        </div>
      </div>
      <div className="flex">
        {/* Names, fixed on the left */}
        <div className="w-44 shrink-0 border-r border-white/[0.08] sm:w-56">
          <div className="h-12 border-b border-white/[0.08]" />
          {rows.map((r) => (
            <button key={r.it.key} type="button" onClick={() => onOpen(r.it.key)} style={{ height: ROW }} className="block w-full truncate border-b border-white/[0.04] px-3 text-left text-sm text-zinc-200 hover:bg-white/[0.04]" title={titleOf(r.it)}>
              {titleOf(r.it)}
            </button>
          ))}
        </div>
        <div ref={scroller} className="mf-noscroll relative min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="relative h-12 border-b border-white/[0.08]">
              {months.map((m) => (
                <div key={m.left} style={{ left: m.left, width: m.w }} className="absolute top-0 h-6 truncate border-l border-white/[0.08] px-2 pt-1 text-[11px] font-semibold capitalize text-zinc-300">
                  {m.label}
                </div>
              ))}
              {zoom !== 'trimestre' &&
                Array.from({ length: max - min + 1 }, (_, i) => min + i)
                  .filter((d) => zoom === 'semana' || fromDay(d).getUTCDay() === 1)
                  .map((d) => (
                    <div key={d} style={{ left: x(d), width: px * (zoom === 'semana' ? 1 : 7) }} className={`absolute top-6 h-6 pt-1 text-center text-[10px] ${d === today ? 'font-bold text-sky-300' : 'text-zinc-500'}`}>
                      {fromDay(d).getUTCDate()}
                    </div>
                  ))}
            </div>
            <div className="relative" style={{ height: rows.length * ROW }}>
              {/* Weekends (zoomed in) + today line */}
              {zoom === 'semana' &&
                Array.from({ length: max - min + 1 }, (_, i) => min + i)
                  .filter((d) => [0, 6].includes(fromDay(d).getUTCDay()))
                  .map((d) => <div key={d} style={{ left: x(d), width: px }} className="absolute inset-y-0 bg-white/[0.02]" />)}
              <div style={{ left: x(today) + px / 2 }} className="absolute inset-y-0 w-px bg-sky-400/70" />
              {rows.map((r, i) =>
                r.from === null ? null : (
                  <button
                    key={r.it.key}
                    type="button"
                    onClick={() => onOpen(r.it.key)}
                    title={`${titleOf(r.it)} · ${fromDay(r.from).toLocaleDateString('es-CL', { timeZone: 'UTC' })}${r.to !== r.from ? ` → ${fromDay(r.to!).toLocaleDateString('es-CL', { timeZone: 'UTC' })}` : ''}`}
                    style={{ left: x(r.from), width: Math.max(px, (r.to! - r.from + 1) * px), top: i * ROW + 8, height: ROW - 16 }}
                    className="absolute truncate rounded-lg border border-sky-400/40 bg-sky-500/25 px-2 text-left text-xs font-semibold text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.15)] hover:bg-sky-500/40"
                  >
                    {(r.to! - r.from + 1) * px > 60 ? titleOf(r.it) : ''}
                  </button>
                ),
              )}
              {arrows.length > 0 && (
                <svg className="pointer-events-none absolute inset-0" width={width} height={rows.length * ROW}>
                  <defs>
                    <marker id="mf-tl-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="rgb(148 163 184)" />
                    </marker>
                  </defs>
                  {arrows.map((a, i) => (
                    <path key={i} d={a.d} fill="none" stroke="rgb(148 163 184)" strokeWidth="1.5" markerEnd="url(#mf-tl-arrow)" />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Panel de control ───────────────────────────────────────────────────────
export type Widget = { id: string; type: 'number' | 'bar' | 'donut'; fn: 'count' | 'sum' | 'avg'; col?: string | null; by?: string | null };
export type DashCol = { key: string; label: string; kind: 'number' | 'date' | 'select' | 'text'; options?: number };
const PALETTE = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#f472b6', '#22d3ee', '#fb7185', '#a3e635', '#818cf8', '#fbbf24'];

/** "$ 1.200.000" / "1,2M" / "40%" → number (null when it isn't one). */
function numOf(text: string): number | null {
  const t = text.trim();
  const m = /^(-)?\$?\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s?([KM%])?/.exec(t);
  if (!m) return null;
  let n = Number(`${m[2].replace(/\./g, '')}.${m[3] ?? '0'}`);
  if (m[4] === 'K') n *= 1e3;
  if (m[4] === 'M') n *= 1e6;
  return m[1] ? -n : n;
}
const fmtNum = (n: number, money: boolean) => `${money ? '$' : ''}${Math.round(n).toLocaleString('es-CL')}`;

/** Default widgets the first time: how many rows, the first amount column and a donut by the first "select" column. */
export function defaultWidgets(cols: DashCol[]): Widget[] {
  const num = cols.find((c) => c.kind === 'number');
  // Group by a real category (Estado, Fase…): few distinct values, not the title column.
  const sel = [...cols.slice(1)].filter((c) => c.kind === 'select' && (c.options ?? 0) >= 2).sort((a, b) => (a.options ?? 99) - (b.options ?? 99))[0];
  return [
    { id: 'w1', type: 'number', fn: 'count' },
    ...(num ? [{ id: 'w2', type: 'number' as const, fn: 'sum' as const, col: num.key }] : []),
    ...(sel ? [{ id: 'w3', type: 'donut' as const, fn: 'count' as const, by: sel.key }] : []),
    ...(sel && num ? [{ id: 'w4', type: 'bar' as const, fn: 'sum' as const, col: num.key, by: sel.key }] : []),
  ];
}

/**
 * Notion's "Panel de control": widgets in a grid over the same rows — big numbers
 * (cuántas filas, suma o promedio de una columna) and charts (barras, dona) grouped by a column.
 */
export const Dashboard: React.FC<{ items: Item[]; cols: DashCol[]; widgets: Widget[]; onChange: (w: Widget[]) => void; locked?: boolean }> = ({ items, cols, widgets, onChange, locked }) => {
  const [adding, setAdding] = useState(false);
  const label = (k?: string | null) => cols.find((c) => c.key === k)?.label ?? '—';
  const textOf = (it: Item, k: string) => it.all.find((p) => p.key === k)?.text ?? '';
  const isMoney = (k?: string | null) => !!k && items.some((it) => textOf(it, k).includes('$'));
  const agg = (rows: Item[], w: Widget) => {
    if (w.fn === 'count' || !w.col) return rows.length;
    const nums = rows.map((it) => numOf(textOf(it, w.col!))).filter((n): n is number => n !== null);
    const sum = nums.reduce((s, n) => s + n, 0);
    return w.fn === 'avg' ? (nums.length ? sum / nums.length : 0) : sum;
  };
  const titleOf = (w: Widget) =>
    `${w.fn === 'count' ? 'Cantidad' : w.fn === 'sum' ? `Suma de ${label(w.col)}` : `Promedio de ${label(w.col)}`}${w.type !== 'number' ? ` por ${label(w.by)}` : ''}`;
  const groups = (w: Widget) => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const g = (w.by ? textOf(it, w.by) : '').trim() || 'Sin dato';
      m.set(g, [...(m.get(g) ?? []), it]);
    }
    return [...m.entries()].map(([name, rows]) => ({ name, value: agg(rows, w) })).sort((a, b) => b.value - a.value);
  };
  const remove = (id: string) => onChange(widgets.filter((w) => w.id !== id));

  const shell = (w: Widget, body: React.ReactNode, wide: boolean) => (
    <div key={w.id} className={`group/w relative rounded-2xl border border-white/10 bg-[#141922] p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="pr-6 text-xs font-semibold text-zinc-400">{titleOf(w)}</p>
      {!locked && (
        <button type="button" onClick={() => remove(w.id)} aria-label="Quitar widget" className="absolute right-2 top-2 hidden rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white group-hover/w:block">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {body}
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {widgets.map((w) => {
        const money = w.fn !== 'count' && isMoney(w.col);
        if (w.type === 'number') return shell(w, <p className="mt-2 font-mono text-3xl font-bold text-white neon-num">{fmtNum(agg(items, w), money)}</p>, false);
        const gs = groups(w).slice(0, 8);
        const total = gs.reduce((s, g) => s + g.value, 0) || 1;
        if (w.type === 'bar') {
          const top = Math.max(...gs.map((g) => g.value), 1);
          return shell(
            w,
            <div className="mt-3 space-y-2">
              {gs.map((g, i) => (
                <div key={g.name} className="grid grid-cols-[minmax(0,110px)_1fr_auto] items-center gap-2 text-xs">
                  <span className="truncate text-zinc-300" title={g.name}>{g.name}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full" style={{ width: `${(g.value / top) * 100}%`, background: PALETTE[i % PALETTE.length], boxShadow: `0 0 10px ${PALETTE[i % PALETTE.length]}80` }} />
                  </div>
                  <span className="font-mono text-zinc-200">{fmtNum(g.value, money)}</span>
                </div>
              ))}
              {!gs.length && <p className="text-xs text-zinc-500">Sin datos.</p>}
            </div>,
            true,
          );
        }
        // Donut
        let acc = 0;
        const R = 52;
        const C = 2 * Math.PI * R;
        return shell(
          w,
          <div className="mt-3 flex items-center gap-4">
            <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90">
              <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="18" />
              {gs.map((g, i) => {
                const len = (g.value / total) * C;
                const el = <circle key={g.name} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />;
                acc += len;
                return el;
              })}
            </svg>
            <ul className="min-w-0 space-y-1 text-xs">
              {gs.map((g, i) => (
                <li key={g.name} className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="truncate text-zinc-300">{g.name}</span>
                  <span className="ml-auto pl-2 font-mono text-zinc-200">{Math.round((g.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>,
          true,
        );
      })}
      {!locked &&
        (adding ? (
          <WidgetForm cols={cols} onCancel={() => setAdding(false)} onAdd={(w) => (onChange([...widgets, w]), setAdding(false))} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-[110px] items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-sm font-semibold text-zinc-400 hover:border-sky-400/50 hover:text-white">
            <Plus className="h-4 w-4" /> Agregar widget
          </button>
        ))}
    </div>
  );
};

const WidgetForm: React.FC<{ cols: DashCol[]; onAdd: (w: Widget) => void; onCancel: () => void }> = ({ cols, onAdd, onCancel }) => {
  const nums = cols.filter((c) => c.kind === 'number');
  const groupable = cols.filter((c) => c.kind === 'select' || c.kind === 'text');
  const [type, setType] = useState<Widget['type']>('number');
  const [fn, setFn] = useState<Widget['fn']>('count');
  const [col, setCol] = useState(nums[0]?.key ?? '');
  const [by, setBy] = useState(groupable[0]?.key ?? '');
  const sel = 'w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none';
  return (
    <div className="space-y-2 rounded-2xl border border-sky-400/30 bg-[#141922] p-4 text-xs sm:col-span-2">
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ['number', 'Número', Hash],
            ['bar', 'Barras', BarChart3],
            ['donut', 'Dona', PieChart],
          ] as const
        ).map(([t, l, Icon]) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 font-semibold ${type === t ? 'border-sky-400 bg-sky-500/10 text-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />
            {l}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-zinc-500">Qué calcular</span>
        <select className={sel} value={fn} onChange={(e) => setFn(e.target.value as Widget['fn'])}>
          <option value="count">Cantidad de filas</option>
          {nums.length > 0 && <option value="sum">Suma de una columna</option>}
          {nums.length > 0 && <option value="avg">Promedio de una columna</option>}
        </select>
      </label>
      {fn !== 'count' && (
        <label className="block">
          <span className="text-zinc-500">Columna</span>
          <select className={sel} value={col} onChange={(e) => setCol(e.target.value)}>
            {nums.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {type !== 'number' && (
        <label className="block">
          <span className="text-zinc-500">Agrupar por</span>
          <select className={sel} value={by} onChange={(e) => setBy(e.target.value)}>
            {groupable.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 font-semibold text-zinc-400 hover:text-white">
          Cancelar
        </button>
        <button
          type="button"
          disabled={(type !== 'number' && !by) || (fn !== 'count' && !col)}
          onClick={() => onAdd({ id: Math.random().toString(36).slice(2, 9), type, fn, col: fn === 'count' ? null : col, by: type === 'number' ? null : by })}
          className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </div>
  );
};
