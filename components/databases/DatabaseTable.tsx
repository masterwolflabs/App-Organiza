'use client';

import { DataTable, OpenRowCtx, type Col } from '@/components/tables/table';
import { Section } from '@/components/tables/section';
import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormulaEditor } from '@/components/databases/FormulaEditor';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  Hash,
  Link2,
  List,
  Loader2,
  Maximize2,
  Plus,
  Sigma,
  Tag,
  Trash2,
  Type,
  X, ArrowLeftRight, Layers } from 'lucide-react';
import {
  ADDABLE_TYPES,
  CellValue,
  DbProperty,
  DbRow,
  NumberFormat,
  OPTION_CLASS,
  OPTION_COLORS,
  OptionColor,
  PropType,
  SelectOption,
  TYPE_LABEL,
  displayText,
  evaluateFormula,
  formulaDisplay,
  formatNumber,
  isSafeUrl,
  newOption,
  newProperty,
} from '@/utils/databases';
import { useDatabaseDoc } from '@/utils/useDatabases';

/**
 * A Notion-style database (Emanuel, 2026-10-15): typed columns, inline
 * editing, select / multi-select pills you create by typing, formulas over
 * other columns, sort and search. Used full size in the "Bases de datos"
 * section and compact inside notes (TipTap embed). Data: utils/useDatabases.tsx.
 */

export const TYPE_ICON: Record<PropType, React.ComponentType<{ className?: string }>> = {
  title: Type,
  text: List,
  number: Hash,
  select: ChevronDown,
  multi_select: Tag,
  date: Calendar,
  checkbox: CheckSquare,
  url: Link2,
  formula: Sigma,
  relation: ArrowLeftRight,
  rollup: Layers,
};

const COLOR_LABEL: Record<OptionColor, string> = {
  gray: 'Gris',
  brown: 'Café',
  orange: 'Naranjo',
  yellow: 'Amarillo',
  green: 'Verde',
  blue: 'Azul',
  purple: 'Morado',
  pink: 'Rosado',
  red: 'Rojo',
};

// ── Floating popover (portal; tables scroll sideways and would clip it) ────
export const Popover: React.FC<{ anchor: HTMLElement | null; onClose: () => void; width?: number; children: React.ReactNode }> = ({ anchor, onClose, width = 260, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 6;
    setPos({ top: below + 320 > window.innerHeight ? Math.max(8, r.top - 6 - 320) : below, left });
  }, [anchor, width]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left, width }}
      className="fixed z-[80] max-h-[320px] overflow-y-auto rounded-xl border border-white/10 bg-[#151922] p-1.5 text-sm text-zinc-200 shadow-2xl shadow-black/60"
    >
      {children}
    </div>,
    document.body,
  );
};

const menuItem = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]';
const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none';

// ── Text-like cell: local draft, saved on blur / Enter ─────────────────────
export const TextCell: React.FC<{ value: string; onCommit: (v: string) => void; placeholder?: string; bold?: boolean; numeric?: boolean; display?: string }> = ({
  value,
  onCommit,
  placeholder,
  bold,
  numeric,
  display,
}) => {
  const [draft, setDraft] = useState(value);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setDraft(value);
  }, [value, focus]);
  return (
    <input
      value={focus || display === undefined ? draft : display}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      inputMode={numeric ? 'decimal' : undefined}
      placeholder={placeholder}
      className={`w-full min-w-0 bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:rounded-md focus:bg-white/[0.06] focus:outline-none ${bold ? 'font-semibold' : ''} ${numeric ? 'text-right font-mono' : ''}`}
    />
  );
};

const Pill: React.FC<{ o: SelectOption; onRemove?: () => void }> = ({ o, onRemove }) => (
  <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-xs font-medium ${OPTION_CLASS[o.color]}`}>
    <span className="truncate">{o.name}</span>
    {onRemove && (
      <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100" aria-label={`Quitar ${o.name}`}>
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

// ── Select / multi-select cell ─────────────────────────────────────────────
export const SelectCell: React.FC<{ prop: DbProperty; value: CellValue; onChange: (v: CellValue) => void; onAddOption: (o: SelectOption) => void }> = ({ prop, value, onChange, onAddOption }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState('');
  const multi = prop.type === 'multi_select';
  const options = prop.options ?? [];
  const selected: string[] = multi ? (Array.isArray(value) ? value : []) : typeof value === 'string' && value ? [value] : [];
  const sel = options.filter((o) => selected.includes(o.id));
  const matches = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  const toggle = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      onChange(selected.includes(id) ? null : id);
      setAnchor(null);
    }
  };
  const create = () => {
    const name = q.trim();
    if (!name) return;
    const o = newOption(name, options);
    onAddOption(o);
    if (multi) onChange([...selected, o.id]);
    else {
      onChange(o.id);
      setAnchor(null);
    }
    setQ('');
  };
  return (
    <>
      <button type="button" onClick={(e) => setAnchor(e.currentTarget)} className="flex min-h-[34px] w-full flex-wrap items-center gap-1 px-2 py-1 text-left">
        {sel.length ? sel.map((o) => <Pill key={o.id} o={o} />) : <span className="text-sm text-zinc-600">Vacío</span>}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matches.length === 1 && q.trim()) toggle(matches[0].id);
                else if (!exact) create();
              }
            }}
            placeholder={options.length ? 'Busca o crea una opción…' : 'Escribe para crear una opción…'}
            className={field}
          />
          <div className="mt-1.5 space-y-0.5">
            {matches.map((o) => (
              <button key={o.id} type="button" onClick={() => toggle(o.id)} className={menuItem}>
                <span className="w-4 text-sky-300">{selected.includes(o.id) ? '✓' : ''}</span>
                <Pill o={o} />
              </button>
            ))}
            {q.trim() && !exact && (
              <button type="button" onClick={create} className={menuItem}>
                <Plus className="h-4 w-4 text-zinc-400" /> Crear <Pill o={{ id: 'new', name: q.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length] }} />
              </button>
            )}
            {!q.trim() && !options.length && <p className="px-2.5 py-2 text-xs text-zinc-500">Sin opciones todavía.</p>}
          </div>
        </Popover>
      )}
    </>
  );
};

// ── Column (property) menu ─────────────────────────────────────────────────
export const PropertyMenu: React.FC<{
  prop: DbProperty;
  anchor: HTMLElement;
  onClose: () => void;
  onChange: (p: DbProperty) => void;
  onDelete: () => void;
  onSort: (dir: 'asc' | 'desc') => void;
  /** Opens the full formula editor (FormulaEditor) instead of the one-line field. */
  onOpenFormula?: () => void;
  /** Locked database: data stays editable, the column's structure and formula don't. */
  locked?: boolean;
}> = ({ prop, anchor, onClose, onChange, onDelete, onSort, onOpenFormula, locked }) => {
  const [name, setName] = useState(prop.name);
  const [formula, setFormula] = useState(prop.formula ?? '');
  const isTitle = prop.type === 'title';
  const commitName = () => !locked && name.trim() && name.trim() !== prop.name && onChange({ ...prop, name: name.trim() });
  const changeType = (t: PropType) => {
    const next: DbProperty = { ...newProperty(t, prop.name), id: prop.id, width: prop.width };
    if ((t === 'select' || t === 'multi_select') && prop.options) next.options = prop.options;
    onChange(next);
  };
  return (
    <Popover
      anchor={anchor}
      width={290}
      onClose={() => {
        commitName();
        if (!locked && !onOpenFormula && prop.type === 'formula' && formula !== (prop.formula ?? '')) onChange({ ...prop, name: name.trim() || prop.name, formula });
        onClose();
      }}
    >
      {locked && (
        <p className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200">
          🔒 Base bloqueada: puedes editar los datos, no las columnas ni las fórmulas.
        </p>
      )}
      <input
        autoFocus={!locked}
        readOnly={locked}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={field}
        aria-label="Nombre de la columna"
      />
      {!isTitle && !locked && (
        <>
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tipo</p>
          <div className="grid grid-cols-2 gap-0.5">
            {ADDABLE_TYPES.map((t) => {
              const Icon = TYPE_ICON[t];
              return (
                <button key={t} type="button" onClick={() => changeType(t)} className={`${menuItem} ${prop.type === t ? 'bg-sky-500/15 text-sky-200' : ''}`}>
                  <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> <span className="truncate text-xs">{TYPE_LABEL[t]}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {(prop.type === 'number' || prop.type === 'formula') && (
        <>
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Formato</p>
          <select disabled={locked} value={prop.numberFormat ?? 'plain'} onChange={(e) => onChange({ ...prop, numberFormat: e.target.value as NumberFormat })} className={field}>
            <option value="plain">Número</option>
            <option value="clp">Pesos ($)</option>
            <option value="usd">Dólares (US$)</option>
            <option value="percent">Porcentaje (%)</option>
          </select>
        </>
      )}
      {prop.type === 'formula' && (
        <>
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fórmula</p>
          {onOpenFormula ? (
            <>
              <pre className="mx-1 max-h-20 overflow-hidden whitespace-pre-wrap break-words rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-sky-200">{prop.formula?.trim() || 'Sin fórmula todavía'}</pre>
              <button
                type="button"
                onClick={() => {
                  commitName();
                  onClose();
                  onOpenFormula();
                }}
                className={`${menuItem} mt-1 text-sky-300`}
              >
                <Sigma className="h-3.5 w-3.5" /> {locked ? 'Ver fórmula' : 'Editar fórmula'}
              </button>
            </>
          ) : (
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onBlur={() => formula !== (prop.formula ?? '') && onChange({ ...prop, formula })}
            placeholder='prop("Precio") * prop("Cantidad")'
            className={`${field} font-mono`}
          />
          )}
          {!onOpenFormula && <p className="px-2.5 pt-1.5 text-[11px] leading-snug text-zinc-500">Ej: prop(&quot;Ingresos&quot;) - prop(&quot;Gastos&quot;)</p>}
        </>
      )}
      {!locked && (prop.type === 'select' || prop.type === 'multi_select') && (prop.options?.length ?? 0) > 0 && (
        <>
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Opciones</p>
          <div className="space-y-1">
            {prop.options!.map((o) => (
              <div key={o.id} className="flex items-center gap-1.5 px-1">
                <select
                  value={o.color}
                  onChange={(e) => onChange({ ...prop, options: prop.options!.map((x) => (x.id === o.id ? { ...x, color: e.target.value as OptionColor } : x)) })}
                  className="w-[86px] rounded-md border border-white/10 bg-black/30 px-1 py-1 text-[11px] text-zinc-200"
                  aria-label="Color"
                >
                  {OPTION_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {COLOR_LABEL[c]}
                    </option>
                  ))}
                </select>
                <input
                  defaultValue={o.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== o.name && onChange({ ...prop, options: prop.options!.map((x) => (x.id === o.id ? { ...x, name: e.target.value.trim() } : x)) })}
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-xs text-white focus:bg-white/[0.06] focus:outline-none"
                />
                <button type="button" onClick={() => onChange({ ...prop, options: prop.options!.filter((x) => x.id !== o.id) })} className="rounded p-1 text-zinc-500 hover:text-rose-300" aria-label="Quitar opción">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-2 border-t border-white/[0.06] pt-1.5">
        <button type="button" onClick={() => onSort('asc')} className={menuItem}>
          <ArrowUp className="h-3.5 w-3.5 text-zinc-400" /> Ordenar ascendente
        </button>
        <button type="button" onClick={() => onSort('desc')} className={menuItem}>
          <ArrowDown className="h-3.5 w-3.5 text-zinc-400" /> Ordenar descendente
        </button>
        {!isTitle && !locked && (
          <button type="button" onClick={onDelete} className={`${menuItem} text-rose-300 hover:bg-rose-500/10`}>
            <Trash2 className="h-3.5 w-3.5" /> Eliminar columna
          </button>
        )}
      </div>
    </Popover>
  );
};

// ── The table ──────────────────────────────────────────────────────────────
/** Notion's "Abrir" next to the name: the row as a window (lateral, flotante, completa). */
const OpenRow: React.FC<{ rowId: string }> = ({ rowId }) => {
  const open = useContext(OpenRowCtx);
  if (!open) return null;
  return (
    <button type="button" onClick={() => open(`.$${rowId}`)} data-help="Abre la fila en una ventana: lateral, flotante o completa." className="shrink-0 rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 opacity-0 transition hover:bg-white/10 focus:opacity-100 group-hover/row:opacity-100">
      Abrir
    </button>
  );
};

const ICONS = ['📄', '💰', '🛒', '🎯', '📊', '🏦', '📈', '🧾', '🗂️', '✅', '📅', '💡', '🐺', '🏠', '🚗', '✈️'];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
/** "2026-10-06" → "6 oct 2026": the shape the table reads as a date (filters, Calendario, Cronograma). */
const dateText = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : '';
};

/** Every database is an Empresa table (Emanuel, 2026-11-02: "que queden todas iguales"): same Table, with the columns kept in the database. */
export const DatabaseTable: React.FC<{
  databaseId: string;
  /** Inside a note: smaller, no outer card, "Abrir completa" link. */
  embedded?: boolean;
  onOpenFull?: (id: string) => void;
}> = ({ databaseId, embedded, onOpenFull }) => {
  const { db, rows, status, saveError, patchDb, setCell, addRow, deleteRow } = useDatabaseDoc(databaseId);
  const [menu, setMenu] = useState<{ prop: DbProperty; anchor: HTMLElement; sort: (dir: 'asc' | 'desc') => void } | null>(null);
  const [formulaEdit, setFormulaEdit] = useState<string | null>(null);
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState('');
  useEffect(() => setTitle(db?.title ?? ''), [db?.title]);

  const props = useMemo(() => db?.properties ?? [], [db?.properties]);

  if (status === 'loading') return <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando base de datos…</div>;
  if (status !== 'ready' || !db)
    return <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-zinc-500">Esta base de datos no está disponible (se eliminó o no tienes acceso).</p>;

  const updateProp = (p: DbProperty) => {
    patchDb({ properties: props.map((x) => (x.id === p.id ? p : x)) });
    setMenu((m) => (m && m.prop.id === p.id ? { ...m, prop: p } : m));
  };
  const addOption = (prop: DbProperty, o: SelectOption) => patchDb({ properties: props.map((x) => (x.id === prop.id ? { ...x, options: [...(x.options ?? []), o] } : x)) });

  const cell = (p: DbProperty, r: DbRow) => {
    const v = r.values[p.id] ?? null;
    switch (p.type) {
      case 'title':
      case 'text':
        return <TextCell value={typeof v === 'string' ? v : ''} bold={p.type === 'title'} placeholder={p.type === 'title' ? 'Sin título' : ''} onCommit={(s) => setCell(r.id, p.id, s || null)} />;
      case 'number': {
        const n = typeof v === 'number' ? v : null;
        return (
          <TextCell
            numeric
            value={n === null ? '' : String(n).replace('.', ',')}
            display={n === null ? '' : formatNumber(n, p.numberFormat)}
            onCommit={(s) => {
              const t = s.trim().replace(/\$|US|%/g, '').replace(/\./g, '').replace(',', '.');
              const num = t === '' ? null : Number(t);
              setCell(r.id, p.id, num === null || !Number.isFinite(num) ? null : num);
            }}
          />
        );
      }
      case 'select':
      case 'multi_select':
        return <SelectCell prop={p} value={v} onChange={(nv) => setCell(r.id, p.id, nv)} onAddOption={(o) => addOption(p, o)} />;
      case 'date':
        return (
          <input
            type="date"
            value={typeof v === 'string' ? v : ''}
            onChange={(e) => setCell(r.id, p.id, e.target.value || null)}
            className="w-full bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none"
          />
        );
      case 'checkbox':
        return (
          <div className="flex justify-center py-1.5">
            <input type="checkbox" checked={Boolean(v)} onChange={(e) => setCell(r.id, p.id, e.target.checked)} className="h-4 w-4 accent-sky-500" />
          </div>
        );
      case 'url': {
        const s = typeof v === 'string' ? v : '';
        return (
          <div className="flex items-center">
            <TextCell value={s} placeholder="https://…" onCommit={(x) => setCell(r.id, p.id, x.trim() || null)} />
            {s && isSafeUrl(s) && (
              <a href={s.trim()} target="_blank" rel="noopener noreferrer" className="shrink-0 px-1.5 text-sky-300 hover:text-sky-200" aria-label="Abrir enlace">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        );
      }
      case 'formula': {
        const res = evaluateFormula(p.formula ?? '', props, r);
        const isNum = typeof res.raw === 'number';
        return (
          <div title={res.error} className={`truncate px-2 py-1.5 text-sm ${isNum ? 'text-right font-mono' : ''} ${res.error ? 'text-rose-300' : 'text-zinc-200'}`}>
            {formulaDisplay(res, p.numberFormat)}
          </div>
        );
      }
    }
  };

  // The table filters, sorts and detects dates by each cell's text, and an <input> has none.
  const hiddenText = (p: DbProperty, r: DbRow) => {
    const v = r.values[p.id] ?? null;
    if (p.type === 'select' || p.type === 'multi_select' || p.type === 'formula') return null;
    const text = p.type === 'date' && typeof v === 'string' ? dateText(v) : p.type === 'number' && typeof v === 'number' ? formatNumber(v, p.numberFormat) : displayText(p, v);
    return <span className="sr-only">{text}</span>;
  };
  const width = (p: DbProperty) => p.width ?? (p.type === 'title' ? 220 : p.type === 'checkbox' ? 90 : p.type === 'multi_select' ? 200 : 160);
  const columns: Col<DbRow>[] = props.map((p) => ({
    key: p.id,
    label: p.name,
    noClamp: true,
    className: '!p-0',
    cell: (r) =>
      p.type === 'title' ? (
        <div className="flex items-center">
          {hiddenText(p, r)}
          <div className="min-w-0 flex-1">{cell(p, r)}</div>
          <OpenRow rowId={r.id} />
          <button type="button" onClick={() => deleteRow(r.id)} className="mr-1 shrink-0 rounded p-1.5 text-zinc-600 opacity-0 transition-opacity hover:text-rose-300 focus:opacity-100 group-hover/row:opacity-100" aria-label="Eliminar fila">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div>
          {hiddenText(p, r)}
          {cell(p, r)}
        </div>
      ),
  }));

  const table = (
    <>
      <DataTable
        id={`dbt-${databaseId}`}
        title={db.title}
        noTitle
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        minWidth={props.reduce((s, p) => s + width(p), 44)}
        empty="Sin filas todavía."
        rowClassName="group/row border-b border-white/[0.05] hover:bg-white/[0.02]"
        onAddField={(t) => patchDb({ properties: [...props, newProperty(t)] })}
        onColumnMenu={(key, anchor, sort) => {
          const prop = props.find((x) => x.id === key);
          if (prop) setMenu({ prop, anchor, sort });
        }}
      />
      <button type="button" onClick={() => addRow()} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200">
        <Plus className="h-4 w-4" /> Nueva fila
      </button>
    </>
  );
  const head = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <button type="button" onClick={(e) => setIconAnchor(e.currentTarget)} className={`${embedded ? 'text-xl' : 'text-3xl'} rounded-lg px-1 hover:bg-white/[0.06]`} aria-label="Cambiar ícono">
        {db.icon || '📄'}
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() !== db.title && patchDb({ title: title.trim() || 'Sin título' })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`min-w-0 flex-1 bg-transparent font-bold tracking-tight text-white focus:outline-none ${embedded ? 'text-lg' : 'text-2xl sm:text-3xl'}`}
        aria-label="Título de la base de datos"
      />
    </span>
  );
  const counter = (
    <>
      <span className="text-xs text-zinc-500">{rows.length} {rows.length === 1 ? 'fila' : 'filas'}</span>
      {saveError && <span className="text-xs text-rose-300">No se pudo guardar el último cambio.</span>}
    </>
  );

  return (
    <div>
      {embedded ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {head}
            {counter}
            {onOpenFull && (
              <button type="button" onClick={() => onOpenFull(db.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.06] hover:text-white">
                <Maximize2 className="h-3.5 w-3.5" /> Abrir completa
              </button>
            )}
          </div>
          {table}
        </>
      ) : (
        <Section
          n={1}
          id={`db-${databaseId}`}
          title={db.title}
          head={head}
          actions={
            <>
              {counter}
              <button type="button" onClick={() => addRow()} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
                <Plus className="h-3.5 w-3.5" /> Nueva fila
              </button>
            </>
          }
        >
          {table}
        </Section>
      )}

      {formulaEdit && props.find((x) => x.id === formulaEdit) && (() => {
        const fp = props.find((x) => x.id === formulaEdit)!;
        const first = rows[0];
        const title = props.find((x) => x.type === 'title');
        return (
          <FormulaEditor
            columnName={fp.name}
            value={fp.formula ?? ''}
            propNames={props.filter((x) => x.id !== fp.id).map((x) => x.name)}
            preview={(formula) => {
              if (!first) return { text: '' };
              const res = evaluateFormula(formula, props.map((x) => (x.id === fp.id ? { ...x, formula } : x)), first);
              const sample = title ? String(first.values[title.id] ?? '') : '';
              return { text: res.error ? '' : formulaDisplay(res, fp.numberFormat), error: res.error, sample: sample.slice(0, 40) };
            }}
            onSave={(formula) => updateProp({ ...fp, formula })}
            onClose={() => setFormulaEdit(null)}
          />
        );
      })()}
      {menu && (
        <PropertyMenu
          key={menu.prop.id}
          prop={menu.prop}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onChange={updateProp}
          onOpenFormula={() => setFormulaEdit(menu.prop.id)}
          onDelete={() => {
            if (!window.confirm(`¿Eliminar la columna “${menu.prop.name}” y sus datos?`)) return;
            patchDb({ properties: props.filter((x) => x.id !== menu.prop.id) });
            setMenu(null);
          }}
          onSort={(dir) => {
            menu.sort(dir);
            setMenu(null);
          }}
        />
      )}
      {iconAnchor && (
        <Popover anchor={iconAnchor} onClose={() => setIconAnchor(null)} width={232}>
          <div className="grid grid-cols-8 gap-0.5">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => {
                  patchDb({ icon: ic });
                  setIconAnchor(null);
                }}
                className="rounded-md p-1 text-lg hover:bg-white/[0.08]"
              >
                {ic}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
};
