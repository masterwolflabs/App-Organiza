'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowDownUp, ArrowUp, CalendarDays, ChartGantt, Copy, LayoutDashboard, Newspaper, GripVertical, LayoutGrid, Table2, ListFilter, Lock, LockOpen, Maximize2, Minimize2, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { formatCLP } from '@/utils/formatters';
import { amountsHidden } from '@/utils/privacy';
import { FloatingPanel, NameMenu, SectionCtx, SectionSettings } from '@/components/tables/section';
import { useTableViewsStore } from '@/components/tables/viewsStore';
import { CellMenu, EMPTY_FMT, fmtCss, type Fmt, type MenuTarget } from '@/components/tables/cellMenu';
import { CF_PREFIX, CustomCell, CustomFieldMenu, builtinValue, useCustomFields, type Builtin } from '@/components/tables/customFields';
import { Popover, TYPE_ICON } from '@/components/databases/DatabaseTable';
import { FormulaEditor } from '@/components/databases/FormulaEditor';
import { evaluateFormula, formulaDisplay } from '@/utils/databases';
import { ADDABLE_TYPES, TYPE_LABEL, newProperty } from '@/utils/databases';
import { useConfirm } from '@/components/ui/confirm';
import { Calendar, CardLayoutPicker, DEFAULT_CARD, Gallery, RowPeek, type CardPrefs, type Item, type Prop, type ViewType } from '@/components/tables/tableViews';
import { Dashboard, Feed, Timeline, defaultWidgets, type DashCol, type TimelineZoom, type Widget } from '@/components/tables/moreViews';
import { AddRelationPanel, NOT_RELATABLE, RelationCell, RelationFieldMenu, RollupCell, RollupConfig, createRelation, publishRows, relationText, removeRelationMirror, useRegistry, type RegRow } from '@/components/tables/relations';

/**
 * Tables of Finanzas de empresa (Emanuel, 2026-10-15) — the Empresa database
 * format. Every table with an `id` has a Notion-like toolbar:
 *   Filtro · Ordenar · Buscar · Agrandar (pantalla completa) · Configuración
 * Configuración holds everything else: number view (1.200.000 | 1,2M),
 * columns (show / hide / move) and — when the table lives in a Section — the
 * section's move / size / colors. Headers can also be dragged to move a
 * column and their right edge dragged to resize it. Per browser:
 * localStorage `mf-tbl:<id>`.
 * Rows stay plain <tr>/<Td> children: cells are re-ordered by POSITION (one
 * cell per header). Full-width rows that belong to the row above carry
 * className="mf-detail"; group header rows carry "mf-group" (hidden while a
 * filter, sort or search is on). Filter / sort / search read the cells' text.
 */

// ── Amounts: complete or abbreviated, per table ────────────────────────────
const CompactCtx = createContext(false);

const full = (n: number, currency: string) => (currency === 'CLP' ? formatCLP(n) : `${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`);

/** $1.200.000 → $1,2M · $100.000 → $100K · $17.780 → $17,8K (below 1.000 unchanged). */
export function compactMoney(n: number, currency = 'CLP'): string {
  const abs = Math.abs(n);
  if (abs < 1000 || amountsHidden()) return full(n, currency);
  const [div, unit] = abs >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = abs / div;
  const num = v.toLocaleString('es-CL', { maximumFractionDigits: v < 100 ? 1 : 0 });
  const sign = n < 0 ? '-' : '';
  return currency === 'CLP' ? `${sign}$${num}${unit}` : `${sign}${num}${unit} ${currency}`;
}

const Amt: React.FC<{ n: number | null | undefined; c: string }> = ({ n, c }) => {
  const compact = useContext(CompactCtx);
  if (n === null || n === undefined || !Number.isFinite(n)) return <>—</>;
  // .mf-num: every amount follows the section's "color de los números".
  if (!compact) return <span className="mf-num">{full(n, c)}</span>;
  return (
    <span className="mf-num" title={amountsHidden() ? undefined : full(n, c)}>
      {compactMoney(n, c)}
    </span>
  );
};
/** Amount that follows the table's number view (use instead of fmt() inside tables). */
export const amt = (n: number | null | undefined, currency = 'CLP') => <Amt n={n} c={currency} />;

// ── Reading cell text (filter / sort / search) ─────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
/** A number or date hidden in a cell's text ("$1,2M", "$535.500 /mes", "6 oct 26", "12%"), else null. */
function cellValue(text: string): number | null {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
  const d = /^(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.? (\d{2,4})/i.exec(t);
  if (d) {
    const y = Number(d[3]) < 100 ? 2000 + Number(d[3]) : Number(d[3]);
    return y * 10000 + MONTHS[d[2].toLowerCase()] * 100 + Number(d[1]);
  }
  const m = /^(-)?\$?\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s?([KM])?(?![\d/])/.exec(t);
  if (!m) return null;
  let n = Number(`${m[2].replace(/\./g, '')}.${m[3] ?? '0'}`);
  if (m[4] === 'K') n *= 1e3;
  if (m[4] === 'M') n *= 1e6;
  return m[1] ? -n : n;
}

type FilterOp = 'contiene' | 'no_contiene' | 'es' | 'no_es' | 'en' | 'igual' | 'mayor' | 'menor' | 'antes' | 'despues' | 'vacio' | 'no_vacio';
/** Like Notion: each column filters by its kind (read from its cells). */
type ColKind = 'text' | 'select' | 'number' | 'date';
const OP_LABEL: Record<FilterOp, string> = {
  contiene: 'contiene',
  no_contiene: 'no contiene',
  es: 'es',
  no_es: 'no es',
  en: 'es cualquiera de',
  igual: 'es igual a',
  mayor: 'es mayor que',
  menor: 'es menor que',
  antes: 'es antes de',
  despues: 'es después de',
  vacio: 'está vacío',
  no_vacio: 'no está vacío',
};
const KIND_OPS: Record<ColKind, FilterOp[]> = {
  text: ['contiene', 'no_contiene', 'es', 'no_es', 'vacio', 'no_vacio'],
  select: ['es', 'no_es', 'en', 'contiene', 'vacio', 'no_vacio'],
  number: ['igual', 'mayor', 'menor', 'vacio', 'no_vacio'],
  date: ['igual', 'antes', 'despues', 'vacio', 'no_vacio'],
};
const DATE_RE = /^(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.? (\d{2,4})/i;
const isEmptyText = (t: string) => ['', '—', '-'].includes(t.trim());
function kindOf(values: string[]): { kind: ColKind; options: string[] } {
  const filled = values.map((v) => v.trim()).filter((v) => !isEmptyText(v));
  const options = [...new Set(filled)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  if (!filled.length) return { kind: 'text', options };
  if (filled.every((v) => DATE_RE.test(v))) return { kind: 'date', options };
  if (filled.every((v) => cellValue(v) !== null && !/[a-zñ]{3,}/i.test(v.replace(/[KM]\b/g, '')))) return { kind: 'number', options };
  if (options.length <= 15 && options.every((o) => o.length <= 40)) return { kind: 'select', options };
  return { kind: 'text', options };
}
export type Filter = { col: string; op: FilterOp; value: string };
export type Sort = { col: string; dir: 'asc' | 'desc' };

function passes(text: string, f: Filter) {
  const t = norm(text);
  const v = norm(f.value);
  const empty = t === '' || t === '—' || t === '-';
  switch (f.op) {
    case 'vacio':
      return empty;
    case 'no_vacio':
      return !empty;
    case 'es':
      return !v || t === v;
    case 'en': {
      const opts = f.value.split('|').filter(Boolean).map(norm);
      return !opts.length || opts.includes(t);
    }
    case 'no_es':
      return !v || t !== v;
    case 'antes':
    case 'despues': {
      const a = cellValue(text);
      const b = cellValue(f.value);
      if (a === null || b === null) return !f.value;
      return f.op === 'antes' ? a < b : a > b;
    }
    case 'contiene':
      return !v || t.includes(v);
    case 'no_contiene':
      return !v || !t.includes(v);
    case 'igual': {
      const a = cellValue(text);
      const b = cellValue(f.value);
      return a !== null && b !== null ? a === b : t === v;
    }
    case 'mayor':
    case 'menor': {
      const a = cellValue(text);
      const b = cellValue(f.value) ?? Number(f.value.replace(/\./g, '').replace(',', '.'));
      if (a === null || !Number.isFinite(b)) return false;
      return f.op === 'mayor' ? a > b : a < b;
    }
  }
}

const VIEW_ICON: Partial<Record<ViewType, React.ComponentType<{ className?: string }>>> = { gallery: LayoutGrid, calendar: CalendarDays, timeline: ChartGantt, dashboard: LayoutDashboard, feed: Newspaper };

// ── Preferences ────────────────────────────────────────────────────────────
type Prefs = { order: string[]; hidden: string[]; widths: Record<string, number>; compact: boolean; filters: Filter[]; sort: Sort | null; lines: boolean; fmt: Fmt; card?: CardPrefs; calCol?: string | null; tl?: { start?: string | null; end?: string | null; dep?: string | null; zoom?: TimelineZoom }; dash?: Widget[] };
const EMPTY: Prefs = { order: [], hidden: [], widths: {}, compact: false, filters: [], sort: null, lines: true, fmt: EMPTY_FMT };

// ── Views (Notion): each one keeps its own filters, sort, columns and numbers ──
/** `type`: Tabla (default) · Galería · Calendario (2026-10-21) · Cronograma · Panel de control · Feed (Emanuel, 2026-10-26). */
type View = { id: string; name: string; prefs: Prefs; type?: ViewType };
type ViewsDoc = { title?: string | null; views: View[]; active: string };
/** A view a table starts with (e.g. Presupuestos → Activos / Aceptados…). */
export type ViewDef = { name: string; filters?: Filter[]; sort?: Sort | null; hidden?: string[]; type?: ViewType; card?: CardPrefs };
const vid = () => Math.random().toString(36).slice(2, 10);

function loadPrefs(id: string, keys: string[]): Prefs {
  try {
    const saved = localStorage.getItem(`mf-tbl:${id}`);
    if (saved) return { ...EMPTY, ...JSON.parse(saved) };
    // Older formats: key-based (DataTable) or hidden indexes (first version).
    const v2 = localStorage.getItem(`mf-cols2:${id}`);
    if (v2) return { ...EMPTY, ...JSON.parse(v2) };
    const v1 = localStorage.getItem(`mf-cols:${id}`);
    if (v1) return { ...EMPTY, hidden: (JSON.parse(v1) as number[]).map((i) => keys[i]).filter(Boolean) };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

// ── Rows: flatten fragments, group a row with its detail rows ──────────────
type RowEl = React.ReactElement<{ children?: React.ReactNode; className?: string; style?: React.CSSProperties }>;
type Unit = { key: string; kind: 'row' | 'group' | 'lead'; rows: RowEl[] };

function flatten(node: React.ReactNode, prefix = ''): RowEl[] {
  const out: RowEl[] = [];
  React.Children.toArray(node).forEach((child) => {
    if (!React.isValidElement(child)) return;
    const el = child as RowEl;
    const key = `${prefix}${String(el.key)}`;
    if (el.type === React.Fragment) out.push(...flatten(el.props.children, `${key}/`));
    else if (el.type === 'tr') out.push(React.cloneElement(el, { key }));
  });
  return out;
}
function toUnits(rows: RowEl[]): Unit[] {
  const units: Unit[] = [];
  for (const r of rows) {
    const cls = r.props.className ?? '';
    if (cls.includes('mf-group')) units.push({ key: String(r.key), kind: 'group', rows: [r] });
    else if (cls.includes('mf-detail')) {
      const last = units[units.length - 1];
      if (last && last.kind === 'row') last.rows.push(r);
      else units.push({ key: String(r.key), kind: 'lead', rows: [r] });
    } else units.push({ key: String(r.key), kind: 'row', rows: [r] });
  }
  return units;
}

// ── Table ──────────────────────────────────────────────────────────────────
/** A cell's way to open its row as a page (only inside the table, not in that page). Takes the row's unit key. */
export const OpenRowCtx = createContext<((key: string) => void) | null>(null);
const MIN_W = 64;
const iconBtn = 'relative rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white';
const selCls = 'rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none';

export const Table: React.FC<{
  id?: string;
  head: React.ReactNode[];
  /** Stable column ids (default: their position). */
  colKeys?: string[];
  children: React.ReactNode;
  minWidth?: number;
  empty?: string;
  isEmpty?: boolean;
  /** The database's title (editable; also shown full screen). */
  title?: string;
  /** Views it starts with (each a set of filters / sort / hidden columns). */
  defaultViews?: ViewDef[];
  /** More content under a row's properties when it opens as a page (e.g. a project's whole window). */
  peekExtra?: (rowKey: string) => React.ReactNode;
  /** Column keys NOT shown when a row opens as a page. */
  peekHide?: string[];
  /** "¿Para qué es?" per column key: shown after resting the cursor 2 s on it, and in the right-click menu. */
  help?: Record<string, string>;
  /** The user's Bases de datos keep their columns in the database itself: "+" and "···" hand over to it. */
  onAddField?: (type: (typeof ADDABLE_TYPES)[number]) => void;
  onColumnMenu?: (key: string, anchor: HTMLElement, sort: (dir: 'asc' | 'desc') => void) => void;
  /** The title already shows above (its Section or database): it's kept for full screen and relations only. */
  noTitle?: boolean;
  /** The filters on screen: a row created now takes them, so it shows up (like Notion). */
  onFilters?: (filters: Filter[]) => void;
}> = ({ id, head: baseHead, colKeys, children, minWidth = 900, empty, isEmpty, title, defaultViews, peekExtra, peekHide, help, onAddField, onColumnMenu, noTitle, onFilters }) => {
  const section = useContext(SectionCtx);
  const baseKeys = useMemo(() => colKeys ?? baseHead.map((_, i) => String(i)), [colKeys, baseHead]);
  // Columns the user added with "+" (texto, número, selección, fórmula…).
  const cf = useCustomFields(id);
  const confirm = useConfirm();
  const cfKey = cf.fields.map((f) => f.id + f.name).join('|');
  const keys = useMemo(() => [...baseKeys, ...cf.fields.map((f) => CF_PREFIX + f.id)], [baseKeys, cfKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const head: React.ReactNode[] = [...baseHead, ...cf.fields.map((f) => f.name)];
  const fieldOf = (k: string) => (k.startsWith(CF_PREFIX) ? cf.fields.find((f) => CF_PREFIX + f.id === k) ?? null : null);
  const [fieldMenu, setFieldMenu] = useState<{ fid: string; anchor: HTMLElement } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [formulaEdit, setFormulaEdit] = useState<string | null>(null);
  // Relaciones entre tablas (components/company/relations.tsx).
  const [addRel, setAddRel] = useState<HTMLElement | null>(null);
  const [addRollup, setAddRollup] = useState<HTMLElement | null>(null);
  const canAdd = (cf.enabled || !!onAddField) && !cf.locked;
  const hasExtraCol = cf.enabled || !!onAddField; // the "+" (or 🔒) column
  // Views live in `doc`; `prefs` is the active view's settings.
  const store = useTableViewsStore();
  const reg = useRegistry(store?.scope);
  const [doc, setDoc] = useState<ViewsDoc | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => {
    if (!id || (store && !store.ready)) return;
    let saved = store?.get(id) as ViewsDoc | undefined;
    if (!store)
      try {
        saved = JSON.parse(localStorage.getItem(`mf-views::${id}`) || 'null') ?? undefined;
      } catch {
        /* ignore */
      }
    if (saved?.views?.length) {
      setDoc({ ...saved, views: saved.views.map((v) => ({ ...v, prefs: { ...EMPTY, ...v.prefs } })) });
      return;
    }
    // First time: the table's own default views, or one view with what this browser had.
    const views: View[] = defaultViews?.length
      ? defaultViews.map((d) => ({ id: vid(), name: d.name, type: d.type, prefs: { ...EMPTY, filters: d.filters ?? [], sort: d.sort ?? null, hidden: d.hidden ?? [], ...(d.card ? { card: d.card } : {}) } }))
      : [{ id: vid(), name: 'Vista principal', prefs: loadPrefs(id, keys) }];
    setDoc({ title: null, views, active: views[0].id });
  }, [id, store?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeView = doc?.views.find((v) => v.id === doc.active) ?? doc?.views[0];
  const viewType: ViewType = activeView?.type ?? 'table';
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const prefs: Prefs = activeView?.prefs ?? EMPTY;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const saveDoc = useCallback(
    (next: ViewsDoc) => {
      setDoc(next);
      if (id && store) store.set(id, next);
      else if (id)
        try {
          localStorage.setItem(`mf-views::${id}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
    },
    [id, store],
  );
  /** Change the active view's settings on screen only (drags in progress). */
  const setPrefs = (u: Prefs | ((p: Prefs) => Prefs)) =>
    setDoc((d) => (d ? { ...d, views: d.views.map((v) => (v.id === (d.active ?? d.views[0].id) ? { ...v, prefs: typeof u === 'function' ? u(v.prefs) : u } : v)) } : d));
  /** Change and save the active view's settings. */
  const persist = (next: Prefs) => {
    const d = docRef.current;
    if (!d) return;
    saveDoc({ ...d, views: d.views.map((v) => (v.id === d.active ? { ...v, prefs: next } : v)) });
  };
  // View management
  const [viewMenu, setViewMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  // Right-click on the database title → "Cambiar nombre" (Moisés, 2026-10-18).
  const [titleMenu, setTitleMenu] = useState<{ x: number; y: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const selectView = (vId: string) => doc && saveDoc({ ...doc, active: vId });
  const TYPE_NAME: Record<ViewType, string> = { table: 'Tabla', gallery: 'Galería', calendar: 'Calendario', timeline: 'Cronograma', dashboard: 'Panel de control', feed: 'Feed' };
  const addView = (type: ViewType = 'table') => {
    if (!doc) return;
    const v: View = { id: vid(), name: type === 'table' ? `Vista ${doc.views.length + 1}` : TYPE_NAME[type], type, prefs: { ...EMPTY, order: prefs.order, widths: prefs.widths, compact: prefs.compact, lines: prefs.lines } };
    saveDoc({ ...doc, views: [...doc.views, v], active: v.id });
    setRenaming(v.id);
  };
  const [addViewAt, setAddViewAt] = useState<DOMRect | null>(null);
  // Drag a view tab to reorder (like Notion).
  const [dragView, setDragView] = useState<string | null>(null);
  const moveView = (from: string, to: string) => {
    if (!doc || from === to) return;
    const views = [...doc.views];
    const i = views.findIndex((v) => v.id === from);
    const [v] = views.splice(i, 1);
    views.splice(views.findIndex((x) => x.id === to) + (i <= views.findIndex((x) => x.id === to) ? 1 : 0), 0, v);
    saveDoc({ ...doc, views });
  };
  const renameView = (vId: string, name: string) => doc && name.trim() && saveDoc({ ...doc, views: doc.views.map((v) => (v.id === vId ? { ...v, name: name.trim() } : v)) });
  const duplicateView = (vId: string) => {
    if (!doc) return;
    const src = doc.views.find((v) => v.id === vId);
    if (!src) return;
    const v: View = { id: vid(), name: `${src.name} (copia)`, prefs: JSON.parse(JSON.stringify(src.prefs)) };
    const i = doc.views.findIndex((x) => x.id === vId);
    saveDoc({ ...doc, views: [...doc.views.slice(0, i + 1), v, ...doc.views.slice(i + 1)], active: v.id });
  };
  const deleteView = (vId: string) => {
    if (!doc || doc.views.length < 2) return;
    const views = doc.views.filter((v) => v.id !== vId);
    saveDoc({ ...doc, views, active: doc.active === vId ? views[0].id : doc.active });
  };
  const dbTitle = doc?.title || title || '';

  // Saved order; a new column goes right after its left neighbour in the default order; unknown keys dropped.
  const order = (() => {
    const out = prefs.order.filter((k) => keys.includes(k));
    keys.forEach((k, i) => {
      if (out.includes(k)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const p = out.indexOf(keys[j]);
        if (p >= 0) {
          at = p + 1;
          break;
        }
      }
      out.splice(at, 0, k);
    });
    return out;
  })();
  const hidden = prefs.hidden.filter((k) => keys.includes(k));
  const visible = order.filter((k) => !hidden.includes(k));
  const indexOf = (k: string) => keys.indexOf(k);
  const label = (k: string) => head[indexOf(k)];
  const named = (k: string) => typeof label(k) === 'string' && (label(k) as string).trim() !== '';
  const labelText = (k: string) => (named(k) ? (label(k) as string) : '');
  const widthsSet = id ? visible.every((k) => prefs.widths[k]) : false;
  const custom = hidden.length > 0 || order.join() !== keys.join() || Object.keys(prefs.widths).length > 0;
  const filters = prefs.filters.filter((f) => keys.includes(f.col));
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    onFilters?.(JSON.parse(filtersKey));
  }, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const sort = prefs.sort && keys.includes(prefs.sort.col) ? prefs.sort : null;

  const tableRef = useRef<HTMLTableElement>(null);
  const [panel, setPanel] = useState<{ kind: 'filter' | 'sort' | 'settings'; anchor: DOMRect } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const openPanel = (kind: 'filter' | 'sort' | 'settings') => (e: React.MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget.getBoundingClientRect();
    setPanel((p) => (p?.kind === kind ? null : { kind, anchor }));
  };
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !panel && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, panel]);

  const measure = () => {
    const out: Record<string, number> = {};
    tableRef.current?.querySelectorAll<HTMLTableCellElement>(':scope>thead>tr>th[data-col]').forEach((th) => {
      out[th.dataset.col!] = Math.round(th.getBoundingClientRect().width);
    });
    return out;
  };

  // Resize: the first drag freezes every column at its current width.
  const startResize = (k: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = { ...measure(), ...Object.fromEntries(Object.entries(prefsRef.current.widths).filter(([kk]) => visible.includes(kk))) };
    const startX = e.clientX;
    const startW = base[k] ?? 120;
    let latest = prefsRef.current;
    const move = (ev: PointerEvent) => {
      latest = { ...prefsRef.current, widths: { ...base, [k]: Math.max(MIN_W, Math.round(startW + ev.clientX - startX)) } };
      setPrefs(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      persist(latest);
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Move: drag a header; the column jumps live to wherever the pointer is.
  const startMove = (k: string, e: React.PointerEvent) => {
    if (!id || e.button !== 0 || !named(k)) return;
    const startX = e.clientX;
    let active = false;
    let current = order;
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.abs(ev.clientX - startX) < 5) return;
        active = true;
        setDragging(k);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const th = tableRef.current?.querySelector<HTMLTableCellElement>(':scope>thead>tr>th');
      const y = th ? th.getBoundingClientRect().top + 8 : ev.clientY;
      const target = (document.elementFromPoint(ev.clientX, y) as HTMLElement | null)?.closest<HTMLTableCellElement>('th[data-col]');
      const to = target?.dataset.col;
      if (!to || to === k || !tableRef.current?.contains(target)) return;
      const next = current.filter((x) => x !== k);
      const ti = next.indexOf(to);
      next.splice(current.indexOf(k) < current.indexOf(to) ? ti + 1 : ti, 0, k);
      current = next;
      setPrefs((p) => ({ ...p, order: next }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (active) {
        setDragging(null);
        persist({ ...prefsRef.current, order: current });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const shift = (k: string, dir: -1 | 1) => {
    const i = order.indexOf(k);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persist({ ...prefs, order: next });
  };
  const toggleHidden = (k: string) => persist({ ...prefs, hidden: hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k] });
  const resetColumns = () => persist({ ...prefs, order: [], hidden: [], widths: {} });

  // ── Rows: arrange cells, then filter / search / sort by the cells' text ──
  const units = toUnits(flatten(children));
  const texts = useRef<Map<string, Record<string, string>>>(new Map());
  const [, setTick] = useState(0);
  const active = filters.length > 0 || !!sort || query.trim() !== '';
  useLayoutEffect(() => {
    const next = new Map<string, Record<string, string>>();
    tableRef.current?.querySelectorAll<HTMLTableRowElement>(':scope>tbody>tr[data-unit]').forEach((tr) => {
      const rec: Record<string, string> = {};
      tr.querySelectorAll<HTMLTableCellElement>(':scope>td[data-col]').forEach((td) => (rec[td.dataset.col!] = td.textContent ?? ''));
      next.set(tr.dataset.unit!, rec);
    });
    const changed = next.size !== texts.current.size || [...next].some(([k, v]) => JSON.stringify(v) !== JSON.stringify(texts.current.get(k)));
    texts.current = next;
    if (changed && (active || viewType !== 'table' || cf.fields.some((f) => f.type === 'formula'))) setTick((t) => t + 1);
  });
  // Publish this table's rows so other tables can relate to them (and summarize their columns).
  useEffect(() => {
    if (!id || !store?.scope || NOT_RELATABLE.has(id) || !cf.enabled) return;
    const labelCols = baseKeys.filter(named);
    const rows: RegRow[] = [];
    const partsOf: string[][] = [];
    let labelIdx = -1;
    tableRef.current?.querySelectorAll<HTMLTableRowElement>(':scope>tbody>tr[data-unit]').forEach((tr) => {
      const unit = tr.dataset.unit!;
      const rec = texts.current.get(unit) ?? {};
      const cols: Record<string, string> = {};
      for (const k of labelCols) cols[labelText(k)] = (rec[k] ?? '').trim().slice(0, 160);
      for (const f of cf.fields) if (f.type !== 'relation') cols[f.name] = (rec[CF_PREFIX + f.id] ?? '').trim().slice(0, 160);
      // Each column's first line (a cell like "Web corporativa / MW-001" → "Web corporativa").
      const parts = labelCols.map((k) => {
        const td = tr.querySelector<HTMLElement>(`:scope>td[data-col="${CSS.escape(k)}"]`);
        return ((td?.innerText ?? rec[k] ?? '').split('\n').map((x) => x.trim()).find(Boolean) ?? '').slice(0, 60);
      });
      if (labelIdx < 0) labelIdx = parts.findIndex((t) => t && t !== '—' && cellValue(t) === null);
      partsOf.push(parts);
      rows.push({ key: unit, label: unit, cols });
    });
    // Readable label: the first column with words (not a date or an amount); when two rows
    // read the same, add the next columns until they're told apart ("Web · 1 oct 26").
    const li = Math.max(0, labelIdx);
    const order = [li, ...labelCols.map((_, i) => i).filter((i) => i !== li)];
    rows.forEach((r, n) => {
      const p = partsOf[n];
      const base = p[li] || r.key;
      const dup = rows.some((_, m) => m !== n && (partsOf[m][li] || rows[m].key) === base);
      const more = dup ? order.slice(1).map((i) => p[i]).find((t) => t && t !== '—') : undefined;
      r.label = (more ? `${base} · ${more}` : base).slice(0, 90);
    });
    publishRows(store.scope, { id, title: dbTitle || section?.title || id, rows });
  });
  const shows = (u: Unit) => {
    if (u.kind !== 'row') return !active;
    const rec = texts.current.get(u.key);
    if (!rec) return true;
    if (!filters.every((f) => passes(rec[f.col] ?? '', f))) return false;
    const q = norm(query);
    return !q || q.split(/\s+/).every((w) => Object.values(rec).some((t) => norm(t).includes(w)));
  };
  let ordered = units;
  if (sort) {
    const val = (u: Unit) => texts.current.get(u.key)?.[sort.col] ?? '';
    ordered = [...units.filter((u) => u.kind !== 'row'), ...units.filter((u) => u.kind === 'row').sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const nx = cellValue(x);
      const ny = cellValue(y);
      const c = nx !== null && ny !== null ? nx - ny : nx !== null ? -1 : ny !== null ? 1 : x.localeCompare(y, 'es', { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? c : -c;
    })];
  }
  const shownCount = ordered.filter((u) => u.kind === 'row' && shows(u)).length;
  const totalRows = units.filter((u) => u.kind === 'row').length;

  const renderRow = (r: RowEl, unit: Unit, isMain: boolean, show: boolean) => {
    const style = show ? r.props.style : { ...(r.props.style ?? {}), display: 'none' };
    if (!isMain)
      return React.cloneElement(
        r,
        { style },
        React.Children.map(r.props.children, (td) => (React.isValidElement(td) ? React.cloneElement(td as React.ReactElement<{ colSpan?: number }>, { colSpan: visible.length + (hasExtraCol ? 1 : 0) }) : td)),
      );
    const cells = React.Children.toArray(r.props.children);
    if (cells.length !== baseKeys.length) return React.cloneElement(r, { style, 'data-unit': unit.key } as Record<string, unknown>);
    const rec = texts.current.get(unit.key) ?? {};
    const builtins: Builtin[] = [
      ...baseKeys.filter(named).map((k) => ({ name: labelText(k), text: rec[k] ?? '' })),
      // Relations and summaries reach formulas as their shown text: prop("Cuotas") / prop("Total cobrado").
      ...cf.fields.filter((f) => f.type === 'relation' || f.type === 'rollup').map((f) => ({ name: f.name, text: relationText(f, cf.values[unit.key], reg, cf.fields) })),
    ];
    return React.cloneElement(
      r,
      { style, 'data-unit': unit.key } as Record<string, unknown>,
      [
        ...visible.map((k) => {
          const f = fieldOf(k);
          if (f)
            return (
              <td key={k} data-col={k} className="overflow-hidden px-1 py-0.5 align-middle">
                {f.type === 'relation' && id ? (
                  <RelationCell table={id} field={f} unit={unit.key} value={cf.values[unit.key]?.[f.id]} />
                ) : f.type === 'rollup' ? (
                  <RollupCell field={f} fields={cf.fields} rowValues={cf.values[unit.key]} />
                ) : (
                  <CustomCell field={f} unit={unit.key} api={cf} builtins={builtins} />
                )}
              </td>
            );
          const cell = cells[indexOf(k)];
          return React.isValidElement(cell) ? React.cloneElement(cell as React.ReactElement<Record<string, unknown>>, { key: k, 'data-col': k }) : cell;
        }),
        ...(hasExtraCol ? [<td key="__add" aria-hidden="true" />] : []),
      ],
    );
  };

  const tid = id ? `mf-tbl-${id}` : undefined;
  const totalWidth = widthsSet ? visible.reduce((s, k) => s + prefs.widths[k], 0) + (hasExtraCol ? 44 : 0) : 0;
  const hl = dragging && tid ? `#${tid} [data-col="${dragging}"]{background:rgba(56,189,248,0.1)}` : '';
  const fmt = prefs.fmt ?? EMPTY_FMT;
  const fmtStyle = tid ? fmtCss(tid, fmt) : '';
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  /** Right-click on a cell (Celda + Columna) or a header (Columna). */
  // Rest the cursor 3 s on a column (header or cell) → a small "negative" box with what it's for (Emanuel, 2026-10-26).
  const [tip, setTip] = useState<{ x: number; y: number; col: string } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tipAt = useRef<{ x: number; y: number; col: string | null }>({ x: 0, y: 0, col: null });
  const onTableMouseMove = (e: React.MouseEvent) => {
    if (!help) return;
    const col = (e.target as HTMLElement).closest<HTMLElement>('td[data-col],th[data-col]')?.dataset.col ?? null;
    const moved = Math.abs(e.clientX - tipAt.current.x) + Math.abs(e.clientY - tipAt.current.y) > 6;
    if (col === tipAt.current.col && !moved) return;
    tipAt.current = { x: e.clientX, y: e.clientY, col };
    clearTimeout(tipTimer.current);
    setTip(null);
    if (col && help[col]) tipTimer.current = setTimeout(() => setTip({ x: tipAt.current.x, y: tipAt.current.y, col }), 2000);
  };
  const onTableMouseLeave = () => {
    clearTimeout(tipTimer.current);
    tipAt.current.col = null;
    setTip(null);
  };
  useEffect(() => () => clearTimeout(tipTimer.current), []);
  // A tip opened from the menu closes with the next click / scroll anywhere.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [tip]);
  const onTableContextMenu = (e: React.MouseEvent) => {
    onTableMouseLeave();
    if (!id) return;
    const el = e.target as HTMLElement;
    // While typing in a cell keep the browser's menu (copy / paste); otherwise ours, also on our own columns' inputs.
    const typing = el.closest('input,textarea,select');
    if (typing && document.activeElement === typing) return;
    const cell = el.closest<HTMLTableCellElement>('td[data-col],th[data-col]');
    if (!cell || !tableRef.current?.contains(cell)) return;
    const row = cell.tagName === 'TD' ? cell.closest<HTMLTableRowElement>('tr[data-unit]') : null;
    if (cell.tagName === 'TD' && !row) return;
    e.preventDefault();
    const col = cell.dataset.col!;
    setMenu({ x: e.clientX, y: e.clientY, col, colLabel: labelText(col), unit: row?.dataset.unit ?? null, editable: cell.querySelector<HTMLElement>('[data-editable]') ?? (cell.dataset.col!.startsWith(CF_PREFIX) ? cell.querySelector<HTMLElement>('input:not([type=checkbox]):not([readonly]), textarea, button, input[type=checkbox]') : null) });
  };
  const filterable = visible.filter(named);
  /** Kind + distinct values of a column, read from the rows' cell text. */
  const colInfo = (k: string) => kindOf([...texts.current.values()].map((r) => r[k] ?? ''));

  /** Rows a view shows (its filters; search not included). */
  const viewCount = (v: View) =>
    units.filter((u) => {
      if (u.kind !== 'row') return false;
      const rec = texts.current.get(u.key);
      return !rec || v.prefs.filters.filter((f) => keys.includes(f.col)).every((f) => passes(rec[f.col] ?? '', f));
    }).length;

  // ── Galería / Calendario: the rows the table shows, as properties ──
  const itemOf = (unit: Unit): Item | null => {
    const r = unit.rows[0];
    const cells = React.Children.toArray(r.props.children);
    if (cells.length !== baseKeys.length) return null;
    const rec = texts.current.get(unit.key) ?? {};
    const builtins: Builtin[] = [
      ...baseKeys.filter(named).map((k) => ({ name: labelText(k), text: rec[k] ?? '' })),
      ...cf.fields.filter((f) => f.type === 'relation' || f.type === 'rollup').map((f) => ({ name: f.name, text: relationText(f, cf.values[unit.key], reg, cf.fields) })),
    ];
    const propOf = (k: string): Prop | null => {
      if (!named(k)) return null;
      const f = fieldOf(k);
      let node: React.ReactNode;
      if (f)
        node =
          f.type === 'relation' && id ? (
            <RelationCell table={id} field={f} unit={unit.key} value={cf.values[unit.key]?.[f.id]} />
          ) : f.type === 'rollup' ? (
            <RollupCell field={f} fields={cf.fields} rowValues={cf.values[unit.key]} />
          ) : (
            <CustomCell field={f} unit={unit.key} api={cf} builtins={builtins} />
          );
      else {
        const cell = cells[indexOf(k)];
        node = React.isValidElement(cell) ? (cell as React.ReactElement<{ children?: React.ReactNode }>).props.children : cell;
      }
      return { key: k, label: labelText(k), node, text: rec[k] ?? '' };
    };
    return { key: unit.key, props: visible.map(propOf).filter(Boolean) as Prop[], all: order.map(propOf).filter(Boolean) as Prop[] };
  };
  const items: Item[] = viewType === 'table' ? [] : (ordered.filter((u) => u.kind === 'row' && shows(u)).map(itemOf).filter(Boolean) as Item[]);
  const dateCols = viewType === 'calendar' || viewType === 'timeline' ? keys.filter((k) => named(k) && colInfo(k).kind === 'date') : [];
  const calCol = prefs.calCol && keys.includes(prefs.calCol) ? prefs.calCol : dateCols[0] ?? null;
  // Cronograma: start / end date columns + an optional "depende de" relation to this same table.
  const tl = prefs.tl ?? {};
  const tlStart = tl.start && keys.includes(tl.start) ? tl.start : dateCols[0] ?? null;
  const tlEnd = tl.end === null ? null : tl.end && keys.includes(tl.end) ? tl.end : (dateCols.find((k) => k !== tlStart) ?? null);
  const selfRelations = cf.fields.filter((f) => f.type === 'relation' && f.relation?.table === id);
  // Arrows from the first "depende de" relation by default; "Sin flechas" (null) turns them off.
  const tlDep = tl.dep === null ? null : tl.dep && selfRelations.some((f) => f.id === tl.dep) ? tl.dep : (selfRelations[0]?.id ?? null);
  const depsOf = tlDep ? (key: string) => { const v = cf.values[key]?.[tlDep]; return Array.isArray(v) ? (v as string[]) : []; } : undefined;
  // Panel de control: the columns it can count / sum / group by.
  const dashCols: DashCol[] = viewType === 'dashboard' ? keys.filter(named).map((k) => ({ key: k, label: labelText(k), kind: colInfo(k).kind as DashCol['kind'], options: colInfo(k).options.length })) : [];
  const widgets = prefs.dash ?? defaultWidgets(dashCols);
  const card = prefs.card ?? DEFAULT_CARD;
  const peekItem = peekKey ? (ordered.find((u) => u.key === peekKey) ? itemOf(ordered.find((u) => u.key === peekKey)!) : null) : null;

  const viewsBar = id && doc && (
    <div className="mb-3">
      {/* Database title — right-click, double-click or ⋯ to rename. */}
      {titleEditing ? (
        <input
          autoFocus
          defaultValue={dbTitle}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            saveDoc({ ...doc, title: e.target.value.trim() || null });
            setTitleEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTitleEditing(false);
          }}
          className="mb-2 w-full max-w-md rounded-lg border border-sky-500 bg-zinc-900 px-2 py-1 text-lg font-bold text-white focus:outline-none"
        />
      ) : (
        dbTitle && !noTitle && (
          <h3
            onDoubleClick={() => setTitleEditing(true)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTitleMenu({ x: e.clientX, y: e.clientY });
            }}
            title="Clic derecho o doble clic para cambiar el nombre"
            className="mb-2 cursor-text text-lg font-bold tracking-tight text-white"
          >
            {dbTitle}
          </h3>
        )
      )}
      {tabMenu && (
        <NameMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
          items={[
            { label: 'Cambiar nombre de la vista', onClick: () => setRenaming(tabMenu.id) },
            { label: 'Duplicar vista', icon: <Copy className="h-3.5 w-3.5" />, onClick: () => duplicateView(tabMenu.id) },
            { label: 'Cambiar nombre de la tabla', onClick: () => setTitleEditing(true) },
            ...(doc.views.length > 1 ? [{ label: 'Eliminar vista', icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => deleteView(tabMenu.id) }] : []),
          ]}
        />
      )}
      {titleMenu && <NameMenu x={titleMenu.x} y={titleMenu.y} onClose={() => setTitleMenu(null)} items={[{ label: 'Cambiar nombre', onClick: () => setTitleEditing(true) }]} />}
      <div className="flex flex-wrap items-center gap-1.5">
        {doc.views.map((v) => {
          const on = v.id === doc.active;
          if (renaming === v.id)
            return (
              <input
                key={v.id}
                autoFocus
                defaultValue={v.name}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  renameView(v.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="w-36 rounded-full border border-sky-500 bg-zinc-900 px-3 py-1 text-xs font-semibold text-white focus:outline-none"
              />
            );
          return (
            <span
              key={v.id}
              draggable
              onDragStart={(e) => {
                setDragView(v.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => dragView && dragView !== v.id && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragView) moveView(dragView, v.id);
                setDragView(null);
              }}
              onDragEnd={() => setDragView(null)}
              data-help-title="Vista" data-help="Una forma de ver esta tabla, con sus propios filtros y columnas. Clic para abrirla, arrástrala para cambiar el orden y clic derecho para renombrar, duplicar o borrar."
              onContextMenu={(e) => {
                // Right-click on a view tab = its menu (Cambiar nombre · Duplicar · Eliminar), at the cursor.
                e.preventDefault();
                setTabMenu({ id: v.id, x: e.clientX, y: e.clientY });
              }}
              className={`group/v inline-flex items-center rounded-full border text-xs font-semibold ${on ? 'border-sky-400 bg-sky-500 text-white' : 'border-white/15 text-zinc-300 hover:border-white/30'}`}>
              <button type="button" onClick={() => selectView(v.id)} onDoubleClick={() => setRenaming(v.id)} className={`inline-flex items-center gap-1 py-1 pl-3 pr-1.5 ${dragView === v.id ? 'opacity-50' : ''}`}>
                {(() => {
                  const I = v.type ? VIEW_ICON[v.type] : null;
                  return I ? <I className="h-3 w-3" /> : null;
                })()}
                {v.name} <span className="opacity-70">{viewCount(v)}</span>
              </button>
              <button
                type="button"
                aria-label={`Opciones de ${v.name}`}
                onClick={(e) => setViewMenu({ id: v.id, anchor: e.currentTarget.getBoundingClientRect() })}
                className={`mr-1 rounded-full p-0.5 ${on ? 'text-white/80 hover:bg-white/20' : 'text-zinc-500 opacity-0 hover:bg-white/10 group-hover/v:opacity-100'}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        <button type="button" onClick={(e) => setAddViewAt(e.currentTarget.getBoundingClientRect())} data-help-title="Nueva vista" data-help="Crea otra forma de ver la misma tabla: tabla, galería, calendario, cronograma, panel de control o feed. Los datos son los mismos." className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1 text-xs font-semibold text-zinc-400 hover:border-white/40 hover:text-white">
          <Plus className="h-3.5 w-3.5" /> Nueva vista
        </button>
        {addViewAt && (
          <FloatingPanel anchor={addViewAt} width={320} onClose={() => setAddViewAt(null)}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Agregar una nueva vista</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['table', 'Tabla', Table2],
                  ['gallery', 'Galería', LayoutGrid],
                  ['calendar', 'Calendario', CalendarDays],
                  ['timeline', 'Cronograma', ChartGantt],
                  ['dashboard', 'Panel de control', LayoutDashboard],
                  ['feed', 'Feed', Newspaper],
                ] as const
              ).map(([t, l, Icon]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setAddViewAt(null);
                    addView(t);
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06]"
                >
                  <Icon className="h-5 w-5 text-zinc-300" />
                  {l}
                </button>
              ))}
            </div>
          </FloatingPanel>
        )}
      </div>
    </div>
  );

  const viewMenuEl = viewMenu && doc && (
    <FloatingPanel anchor={viewMenu.anchor} width={210} onClose={() => setViewMenu(null)}>
      {(() => {
        const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.06]';
        const close = (fn: () => void) => () => {
          fn();
          setViewMenu(null);
        };
        return (
          <div className="space-y-0.5">
            <button type="button" className={item} onClick={close(() => setRenaming(viewMenu.id))}>
              <Pencil className="h-3.5 w-3.5" /> Cambiar nombre de la vista
            </button>
            <button type="button" className={item} onClick={close(() => duplicateView(viewMenu.id))}>
              <Copy className="h-3.5 w-3.5" /> Duplicar vista
            </button>
            <button type="button" className={item} onClick={close(() => setTitleEditing(true))}>
              <Pencil className="h-3.5 w-3.5" /> Cambiar nombre de la tabla
            </button>
            <button type="button" disabled={doc.views.length < 2} className={`${item} text-rose-300 disabled:opacity-40`} onClick={close(() => deleteView(viewMenu.id))}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar vista
            </button>
          </div>
        );
      })()}
    </FloatingPanel>
  );

  const toolbar = id && (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1">
      {active && (
        <span className="mr-auto text-[11px] text-zinc-500">
          {shownCount} de {totalRows}
          {/* The view's own filters / sort are part of the view; only a search is temporary. */}
          {query && (
            <button type="button" className="ml-2 font-semibold text-sky-300 hover:text-sky-200" onClick={() => setQuery('')}>
              Quitar búsqueda
            </button>
          )}
        </span>
      )}
      {searchOpen && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setSearchOpen(false))}
            placeholder="Buscar en la tabla…"
            className="w-48 rounded-lg border border-white/10 bg-zinc-900 py-1 pl-7 pr-6 text-xs text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" aria-label="Borrar búsqueda">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <button type="button" className={`${iconBtn} ${filters.length ? 'text-sky-300' : ''}`} onClick={openPanel('filter')} data-help-title="Filtro" data-help="Muestra solo las filas que cumplen una condición (por ejemplo, Estado = Vencida). Puedes sumar varias." aria-label="Filtro">
        <ListFilter className="h-4 w-4" />
        {filters.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[9px] font-bold text-white">{filters.length}</span>}
      </button>
      <button type="button" className={`${iconBtn} ${sort ? 'text-sky-300' : ''}`} onClick={openPanel('sort')} data-help-title="Ordenar" data-help="Ordena las filas por una columna, de menor a mayor o al revés." aria-label="Ordenar">
        <ArrowDownUp className="h-4 w-4" />
      </button>
      {cf.enabled && (
        <button
          type="button"
          className={`${iconBtn} ${cf.locked ? 'text-amber-300' : ''}`}
          onClick={async () => {
            if (!cf.locked) return cf.setLocked(true);
            if (await confirm({ title: '¿Desbloquear esta base de datos?', message: 'Se podrán agregar, cambiar y borrar columnas y fórmulas.', confirmLabel: 'Desbloquear', tone: 'primary' })) cf.setLocked(false);
          }}
          data-help-title={cf.locked ? 'Base bloqueada' : 'Bloquear base de datos'} data-help={cf.locked ? 'Los datos se editan, pero las columnas y fórmulas no. Clic para desbloquear.' : 'Protege las columnas y fórmulas para que nadie las cambie por error. Los datos se siguen editando.'}
          aria-label={cf.locked ? 'Desbloquear base de datos' : 'Bloquear base de datos'}
        >
          {cf.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </button>
      )}
      <button type="button" className={`${iconBtn} ${searchOpen || query ? 'text-sky-300' : ''}`} onClick={() => (searchOpen ? (setSearchOpen(false), setQuery('')) : setSearchOpen(true))} data-help-title="Buscar" data-help="Busca una palabra o un monto en toda la tabla." aria-label="Buscar">
        <Search className="h-4 w-4" />
      </button>
      <button type="button" className={iconBtn} onClick={() => setFullscreen((f) => !f)} data-help-title={fullscreen ? 'Salir de pantalla completa' : 'Agrandar'} data-help={fullscreen ? 'Vuelve la tabla a su lugar en la página.' : 'Abre la tabla en pantalla completa.'} aria-label="Agrandar">
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button type="button" className={`${iconBtn} ${panel?.kind === 'settings' ? 'text-sky-300' : ''}`} onClick={openPanel('settings')} data-help-title="Configuración" data-help="Cómo se ven los números (1.200.000 o 1,2M), qué columnas se muestran y en qué orden, y el tamaño y aspecto de la sección." aria-label="Configuración">
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </div>
  );

  const body = (
    <CompactCtx.Provider value={prefs.compact}>
      {/* Nested tables (in detail rows) don't carry this section's settings. */}
      <SectionCtx.Provider value={null}>
        <div>
          {viewsBar}
          {toolbar}
          {hl && <style>{hl}</style>}
          {fmtStyle && <style>{fmtStyle}</style>}
          {tip &&
            help?.[tip.col] &&
            createPortal(
              <div role="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.min(tip.y + 18, window.innerHeight - 120) }} className="mf-negative pointer-events-none fixed z-[95] w-max max-w-[280px] rounded-xl px-3 py-2 text-xs leading-snug shadow-2xl">
                <p className="font-bold">{labelText(tip.col)}</p>
                <p className="mt-0.5 opacity-80">{help[tip.col]}</p>
              </div>,
              document.body,
            )}
          {menu && (
            <CellMenu
              target={menu}
              onHelp={
                help?.[menu.col]
                  ? () => {
                      const t = { x: menu.x, y: menu.y, col: menu.col };
                      setMenu(null);
                      tipAt.current = t;
                      setTip(t);
                    }
                  : undefined
              }
              fmt={fmt}
              onChange={(f) => persist({ ...prefs, fmt: f })}
              onClose={() => setMenu(null)}
              onHideColumn={visible.length > 1 ? () => toggleHidden(menu.col) : undefined}
              cellNote={fieldOf(menu.col)?.type === 'formula' ? 'Es el resultado de una fórmula: cambia la fórmula de la columna.' : undefined}
              columnAction={(() => {
                const f = fieldOf(menu.col);
                if (f?.type === 'formula') return { kind: 'formula' as const, label: cf.locked ? 'Ver fórmula' : 'Editar fórmula', run: () => setFormulaEdit(f.id) };
                if (f) {
                  const open = () => {
                    const th = tableRef.current?.querySelector<HTMLElement>(`thead th[data-col="${menu.col}"]`);
                    if (th) setFieldMenu({ fid: f.id, anchor: th });
                  };
                  return { kind: 'cell' as const, label: cf.locked ? 'Ver casilla' : 'Editar casilla (tipo y formato)', run: open };
                }
                // A column the table already has: its value comes from the system, so start a formula from it.
                if (!canAdd || !menu.colLabel) return null;
                return {
                  kind: 'create' as const,
                  label: 'Crear fórmula con esta columna',
                  run: () => {
                    const nf = { ...newProperty('formula'), name: `${menu.colLabel} · fórmula`, formula: `prop("${menu.colLabel}")` };
                    cf.addField(nf);
                    setTimeout(() => setFormulaEdit(nf.id), 0);
                  },
                };
              })()}
            />
          )}
          {fieldMenu && (() => {
            const f = cf.fields.find((x) => x.id === fieldMenu.fid);
            if (!f || (f.type !== 'relation' && f.type !== 'rollup') || !store) return null;
            return (
              <RelationFieldMenu
                field={f}
                fields={cf.fields}
                anchor={fieldMenu.anchor}
                scope={store.scope}
                locked={cf.locked}
                onClose={() => setFieldMenu(null)}
                onRename={(name) => cf.updateField({ ...f, name })}
                onRollup={(rollup) => cf.updateField({ ...f, rollup })}
                onDelete={async () => {
                  setFieldMenu(null);
                  const mirror = f.type === 'relation' && f.relation?.reverseId;
                  const ok = await confirm({
                    title: `¿Eliminar la columna “${f.name}”?`,
                    message: mirror ? 'Se quitan las relaciones de esta columna y también su columna en la otra tabla. Esto no se puede deshacer.' : 'Se borran también sus datos. Esto no se puede deshacer.',
                    confirmLabel: 'Eliminar columna',
                    tone: 'danger',
                  });
                  if (!ok) return;
                  if (f.type === 'relation') removeRelationMirror(store, f);
                  cf.removeFields([f.id, ...cf.fields.filter((x) => x.rollup?.relationId === f.id).map((x) => x.id)]);
                  if (sort?.col === CF_PREFIX + f.id) persist({ ...prefs, sort: null });
                }}
              />
            );
          })()}
          {fieldMenu && cf.fields.find((f) => f.id === fieldMenu.fid && f.type !== 'relation' && f.type !== 'rollup') && (
            <CustomFieldMenu
              field={cf.fields.find((f) => f.id === fieldMenu.fid)!}
              anchor={fieldMenu.anchor}
              api={cf}
              onClose={() => setFieldMenu(null)}
              onSort={(dir) => persist({ ...prefs, sort: { col: CF_PREFIX + fieldMenu.fid, dir } })}
              onDeleted={() => {
                if (sort?.col === CF_PREFIX + fieldMenu.fid) persist({ ...prefs, sort: null });
              }}
              onOpenFormula={() => setFormulaEdit(fieldMenu.fid)}
              confirmDelete={(name) =>
                confirm({ title: `¿Eliminar la columna “${name}”?`, message: 'Se borran también los datos que escribiste en ella. Esto no se puede deshacer.', confirmLabel: 'Eliminar columna', tone: 'danger' })
              }
            />
          )}
          {formulaEdit && cf.fields.find((f) => f.id === formulaEdit) && (() => {
            const field = cf.fields.find((f) => f.id === formulaEdit)!;
            const builtinNames = baseKeys.filter(named).map(labelText);
            const firstRow = units.find((u) => u.kind === 'row');
            const rec = firstRow ? texts.current.get(firstRow.key) ?? {} : {};
            const extra = Object.fromEntries(baseKeys.filter(named).map((k) => [labelText(k).trim().toLowerCase(), builtinValue(rec[k] ?? '')]));
            const sample = firstRow ? (baseKeys.filter(named).map((k) => rec[k]).find((t) => t && t.trim()) ?? '').trim() : '';
            return (
              <FormulaEditor
                columnName={field.name}
                value={field.formula ?? ''}
                readOnly={cf.locked}
                propNames={[...cf.fields.filter((f) => f.id !== field.id).map((f) => f.name), ...builtinNames]}
                preview={(formula) => {
                  if (!firstRow) return { text: '', error: undefined, sample: '' };
                  const res = evaluateFormula(formula, cf.fields.map((f) => (f.id === field.id ? { ...f, formula } : f)), { id: firstRow.key, values: cf.values[firstRow.key] ?? {}, position: 0 }, { extra });
                  return { text: res.error ? '' : formulaDisplay(res, field.numberFormat), error: res.error, sample: sample.slice(0, 40) };
                }}
                onSave={(formula) => cf.updateField({ ...field, formula })}
                onClose={() => setFormulaEdit(null)}
              />
            );
          })()}
          {addAnchor && (
            <Popover anchor={addAnchor} onClose={() => setAddAnchor(null)} width={220}>
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Nueva columna</p>
              {ADDABLE_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (onAddField) {
                        onAddField(t);
                        return setAddAnchor(null);
                      }
                      const f = newProperty(t);
                      cf.addField(f);
                      const anchor = addAnchor;
                      setAddAnchor(null);
                      // Open its menu right away to name it (and write the formula).
                      setTimeout(() => setFieldMenu({ fid: f.id, anchor }), 0);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
                  >
                    <Icon className="h-4 w-4 text-zinc-400" /> {TYPE_LABEL[t]}
                  </button>
                );
              })}
              {store && id && (
                <>
                  <div className="my-1 border-t border-white/[0.06]" />
                  {(['relation', 'rollup'] as const).map((t) => {
                    const Icon = TYPE_ICON[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const a = addAnchor;
                          setAddAnchor(null);
                          setTimeout(() => (t === 'relation' ? setAddRel(a) : setAddRollup(a)), 0);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <Icon className="h-4 w-4 text-sky-300" /> {TYPE_LABEL[t]}
                        <span className="ml-auto text-[10px] text-zinc-500">{t === 'relation' ? 'con otra tabla' : 'suma, cuenta…'}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </Popover>
          )}
          {addRel && store && id && (
            <Popover anchor={addRel} onClose={() => setAddRel(null)} width={290}>
              <AddRelationPanel
                table={id}
                scope={store.scope}
                onPick={(target, twoWay) => {
                  const a = addRel;
                  const f = createRelation(store, id, dbTitle || section?.title || id, target, twoWay);
                  setAddRel(null);
                  setTimeout(() => setFieldMenu({ fid: f.id, anchor: a }), 0);
                }}
              />
            </Popover>
          )}
          {addRollup && store && (
            <Popover anchor={addRollup} onClose={() => setAddRollup(null)} width={280}>
              <RollupConfig
                fields={cf.fields}
                scope={store.scope}
                onSave={(rollup) => {
                  const rel = cf.fields.find((x) => x.id === rollup.relationId);
                  cf.addField({ ...newProperty('rollup'), name: rollup.fn === 'contar' ? `N° ${rel?.name ?? 'relacionadas'}` : `${rollup.column} (${rel?.name ?? ''})`, rollup });
                  setAddRollup(null);
                }}
              />
            </Popover>
          )}
          {viewType === 'gallery' && <Gallery items={items} card={card} onOpen={setPeekKey} empty={isEmpty ? empty ?? 'Sin datos.' : 'Ninguna fila coincide.'} />}
          {viewType === 'calendar' && <Calendar items={items} dateKey={calCol} onOpen={setPeekKey} />}
          {viewType === 'timeline' && <Timeline items={items} startKey={tlStart} endKey={tlEnd} depsOf={depsOf} zoom={tl.zoom ?? 'mes'} onZoom={(z) => persist({ ...prefs, tl: { ...tl, zoom: z } })} onOpen={setPeekKey} />}
          {viewType === 'dashboard' && <Dashboard items={items} cols={dashCols} widgets={widgets} onChange={(w) => persist({ ...prefs, dash: w })} />}
          {viewType === 'feed' && <Feed items={items} onOpen={setPeekKey} empty={isEmpty ? empty ?? 'Sin datos.' : 'Ninguna fila coincide.'} />}
          {peekItem && <RowPeek item={peekItem} extra={peekExtra?.(peekKey!.replace(/^\.\$/, ''))} hide={peekHide} onClose={() => setPeekKey(null)} />}
          {/* The real table stays mounted (hidden) in Galería / Calendario: filters, search and sort read its cells. */}
          <div className={viewType === 'table' ? 'mf-noscroll overflow-x-auto rounded-2xl border border-white/[0.08]' : 'hidden'}>
            <table
              ref={tableRef}
              id={tid}
              onContextMenu={onTableContextMenu}
              onMouseMove={onTableMouseMove}
              onMouseLeave={onTableMouseLeave}
              className={`w-full text-left text-sm ${prefs.lines ? 'mf-col-lines' : 'mf-no-col-lines'}`}
              style={widthsSet ? { tableLayout: 'fixed', width: totalWidth, minWidth: totalWidth } : { minWidth: Math.max(560, minWidth - hidden.length * 95) }}
            >
              {widthsSet && (
                <colgroup>
                  {visible.map((k) => (
                    <col key={k} style={{ width: prefs.widths[k] }} />
                  ))}
                  {hasExtraCol && <col style={{ width: 44 }} />}
                </colgroup>
              )}
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {visible.map((k) => (
                    <th
                      key={k}
                      data-col={k}
                      onPointerDown={(e) => startMove(k, e)}
                      className={`group relative border-b border-white/[0.08] bg-white/[0.03] px-3 py-2.5 align-middle leading-tight transition-colors ${id && named(k) ? 'cursor-grab' : ''} ${dragging === k ? 'text-sky-300' : ''}`}
                    >
                      <span className="inline-flex max-w-full items-center gap-1 overflow-hidden text-ellipsis">
                        {id && named(k) && <GripVertical className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />}
                        {fieldOf(k) && (() => {
                          const Icon = TYPE_ICON[fieldOf(k)!.type];
                          return <Icon className="h-3 w-3 shrink-0 text-zinc-500" />;
                        })()}
                        {/* Long names wrap to two lines instead of widening the column (Emanuel, 2026-10-21). */}
                        <span className="line-clamp-2 max-w-[7.5rem] break-normal">{label(k)}</span>
                        {fieldOf(k) && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => setFieldMenu({ fid: fieldOf(k)!.id, anchor: e.currentTarget })}
                            title="Opciones de la columna"
                            aria-label={`Opciones de ${fieldOf(k)!.name}`}
                            className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        )}
                        {onColumnMenu && !fieldOf(k) && !cf.locked && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => onColumnMenu(k, e.currentTarget, (dir) => persist({ ...prefs, sort: { col: k, dir } }))}
                            title="Opciones de la columna"
                            aria-label={`Opciones de ${labelText(k)}`}
                            className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        )}
                        {sort?.col === k && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-sky-300" /> : <ArrowDown className="h-3 w-3 text-sky-300" />)}
                      </span>
                      {id && (
                        <span
                          onPointerDown={(e) => startResize(k, e)}
                          title="Arrastra para cambiar el ancho"
                          className="absolute inset-y-1 -right-1 z-10 w-2 cursor-col-resize rounded after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-white/10 hover:after:w-0.5 hover:after:bg-sky-400"
                        />
                      )}
                    </th>
                  ))}
                  {hasExtraCol && !canAdd && (
                    <th className="mf-plus-col w-11 bg-transparent px-1 py-1.5 text-center align-middle" title="Base bloqueada: no se pueden agregar ni cambiar columnas">
                      <Lock className="mx-auto h-3.5 w-3.5 text-amber-300/80" aria-label="Base bloqueada" />
                    </th>
                  )}
                  {/* The "+" sits on the card itself, without the header's gray block (Emanuel, 2026-10-26). */}
                  {canAdd && (
                    <th className="mf-plus-col w-11 bg-transparent px-1 py-1.5 text-center align-middle">
                      <button
                        type="button"
                        onClick={(e) => setAddAnchor(e.currentTarget)}
                        title="Agregar columna"
                        aria-label="Agregar columna"
                        className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <OpenRowCtx.Provider value={setPeekKey}>
                {ordered.flatMap((u) => {
                  const show = shows(u);
                  return u.rows.map((r, i) => renderRow(r, u, u.kind === 'row' && i === 0, show));
                })}
                </OpenRowCtx.Provider>
                {(isEmpty || (active && totalRows > 0 && shownCount === 0)) && (
                  <tr className="mf-detail">
                    <td colSpan={visible.length + (hasExtraCol ? 1 : 0)} className="px-3 py-8 text-center text-sm text-zinc-500">
                      {isEmpty ? (empty ?? 'Sin datos.') : 'Ninguna fila coincide.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCtx.Provider>
    </CompactCtx.Provider>
  );

  const panelEl = panel && (
    <FloatingPanel anchor={panel.anchor} width={panel.kind === 'settings' ? 320 : 360} onClose={() => setPanel(null)}>
      {panel.kind === 'filter' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-white">Filtro</p>
          {filters.length === 0 && <p className="text-zinc-500">Sin filtros. Agrega uno para ver solo las filas que cumplan.</p>}
          {filters.map((f, i) => {
            const upd = (patch: Partial<Filter>) => persist({ ...prefs, filters: filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            const info = colInfo(f.col);
            const ops = KIND_OPS[info.kind];
            const op = ops.includes(f.op) ? f.op : ops[0];
            const needsValue = op !== 'vacio' && op !== 'no_vacio';
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] p-2">
                <select
                  className={selCls}
                  value={f.col}
                  onChange={(e) => {
                    const k = colInfo(e.target.value).kind;
                    upd({ col: e.target.value, op: KIND_OPS[k][0], value: '' });
                  }}
                >
                  {filterable.map((k) => (
                    <option key={k} value={k}>
                      {labelText(k)}
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
                    {info.options.map((o) => {
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
                      {info.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : info.kind === 'date' ? (
                    <input type="date" className={selCls} value={f.value} onChange={(e) => upd({ value: e.target.value })} />
                  ) : (
                    <input className={`${selCls} w-28`} value={f.value} onChange={(e) => upd({ value: e.target.value })} placeholder={info.kind === 'number' ? 'Ej: 500.000' : 'Valor'} inputMode={info.kind === 'number' ? 'numeric' : undefined} />
                  ))}
                <button type="button" onClick={() => persist({ ...prefs, filters: filters.filter((_, j) => j !== i) })} className="ml-auto rounded p-1 text-zinc-500 hover:text-rose-300" aria-label="Quitar filtro">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            disabled={!filterable.length}
            onClick={() => persist({ ...prefs, filters: [...filters, { col: filterable[0], op: KIND_OPS[colInfo(filterable[0]).kind][0], value: '' }] })}
            className="inline-flex items-center gap-1 rounded-lg px-1 py-1 font-semibold text-sky-300 hover:text-sky-200"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar filtro
          </button>
        </div>
      )}
      {panel.kind === 'sort' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-white">Ordenar</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select className={selCls} value={sort?.col ?? ''} onChange={(e) => persist({ ...prefs, sort: e.target.value ? { col: e.target.value, dir: sort?.dir ?? 'asc' } : null })}>
              <option value="">Sin orden (como viene)</option>
              {filterable.map((k) => (
                <option key={k} value={k}>
                  {labelText(k)}
                </option>
              ))}
            </select>
            {sort && (
              <div className="inline-flex rounded-lg border border-white/10 p-0.5 font-semibold">
                {(
                  [
                    ['asc', 'Ascendente'],
                    ['desc', 'Descendente'],
                  ] as const
                ).map(([d, l]) => (
                  <button key={d} type="button" onClick={() => persist({ ...prefs, sort: { ...sort, dir: d } })} className={`rounded-md px-2 py-0.5 ${sort.dir === d ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">Montos y fechas se ordenan por su valor; el texto, alfabético.</p>
        </div>
      )}
      {panel.kind === 'settings' && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-white">Configuración</p>
          {/* Order (Emanuel): Tamaño · Números · Columnas · then the rest of the section. */}
          {section && <SectionSettings api={section} only={['fold']} />}
          {viewType === 'gallery' && (
            <div className="space-y-2 rounded-xl border border-white/[0.08] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Tamaño de tarjeta</span>
                <div className="inline-flex rounded-lg border border-white/10 p-0.5 font-semibold" role="group" aria-label="Tamaño de tarjeta">
                  {(
                    [
                      ['s', 'Pequeño'],
                      ['m', 'Mediano'],
                      ['l', 'Grande'],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => persist({ ...prefs, card: { ...card, size: v } })} className={`rounded-md px-2 py-0.5 ${card.size === v ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-center text-[11px] font-semibold text-zinc-400">Diseño de tarjeta</p>
              <CardLayoutPicker value={card.layout} onChange={(v) => persist({ ...prefs, card: { ...card, layout: v } })} />
              <p className="text-[11px] text-zinc-500">Qué datos muestra cada tarjeta: en Columnas (abajo).</p>
            </div>
          )}
          {viewType === 'calendar' && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] p-2.5">
              <span className="font-semibold">Mostrar calendario por</span>
              {dateCols.length ? (
                <select className={selCls} value={calCol ?? ''} onChange={(e) => persist({ ...prefs, calCol: e.target.value })}>
                  {dateCols.map((k) => (
                    <option key={k} value={k}>
                      {labelText(k)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[11px] text-zinc-500">Sin columnas de fecha</span>
              )}
            </div>
          )}
          {viewType === 'timeline' && (
            <div className="space-y-2 rounded-xl border border-white/[0.08] p-2.5">
              {(
                [
                  ['start', 'Empieza', tlStart, false],
                  ['end', 'Termina', tlEnd, true],
                ] as const
              ).map(([k, l, v, optional]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{l}</span>
                  <select className={selCls} value={v ?? ''} onChange={(e) => persist({ ...prefs, tl: { ...tl, [k]: e.target.value || null } })}>
                    {optional && <option value="">Mismo día</option>}
                    {dateCols.map((c) => (
                      <option key={c} value={c}>
                        {labelText(c)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Depende de</span>
                {selfRelations.length ? (
                  <select className={selCls} value={tlDep ?? ''} onChange={(e) => persist({ ...prefs, tl: { ...tl, dep: e.target.value || null } })}>
                    <option value="">Sin flechas</option>
                    {selfRelations.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-zinc-500">Crea una Relación con esta misma tabla (+)</span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Números</span>
            <div className="inline-flex rounded-lg border border-white/10 p-0.5 font-semibold" role="group" aria-label="Vista de números">
              {(
                [
                  [false, '1.200.000'],
                  [true, '1,2M'],
                ] as const
              ).map(([c, l]) => (
                <button key={l} type="button" onClick={() => persist({ ...prefs, compact: c })} title={c ? 'Abreviados (K = mil, M = millón)' : 'Completos'} className={`rounded-md px-2 py-0.5 font-mono ${prefs.compact === c ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Líneas entre columnas</span>
            <div className="inline-flex rounded-lg border border-white/10 p-0.5 font-semibold" role="group" aria-label="Líneas entre columnas">
              {(
                [
                  [true, 'Con líneas'],
                  [false, 'Sin líneas'],
                ] as const
              ).map(([v, l]) => (
                <button key={l} type="button" onClick={() => persist({ ...prefs, lines: v })} className={`rounded-md px-2 py-0.5 ${prefs.lines === v ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold">Columnas</p>
            <p className="mb-1.5 text-[11px] text-zinc-500">Marca para mostrar · flechas para mover (o arrastra los títulos; su borde cambia el ancho).</p>
            <div className="space-y-0.5">
              {order.map((k, i) =>
                named(k) ? (
                  <div key={k} className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-white/[0.06]">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-zinc-200">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-sky-500" checked={!hidden.includes(k)} onChange={() => toggleHidden(k)} />
                      {labelText(k)}
                    </label>
                    <button type="button" disabled={i === 0} onClick={() => shift(k, -1)} aria-label="Mover a la izquierda" className="rounded p-0.5 text-zinc-500 hover:text-white disabled:opacity-25">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={i === order.length - 1} onClick={() => shift(k, 1)} aria-label="Mover a la derecha" className="rounded p-0.5 text-zinc-500 hover:text-white disabled:opacity-25">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
            {custom && (
              <button type="button" onClick={resetColumns} className="mt-1 px-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200">
                Restablecer orden, anchos y columnas
              </button>
            )}
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

  if (fullscreen && typeof document !== 'undefined')
    return (
      <>
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
          Esta tabla está abierta en pantalla completa.{' '}
          <button type="button" className="font-semibold text-sky-300" onClick={() => setFullscreen(false)}>
            Volver aquí
          </button>
        </div>
        {createPortal(
          <div className="mf-noscroll fixed inset-0 z-[70] overflow-auto bg-[#0b0d12] p-4 sm:p-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white">{title ?? section?.title ?? 'Tabla'}</h3>
              <button type="button" onClick={() => setFullscreen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {body}
          </div>,
          document.body,
        )}
        {panelEl}
        {viewMenuEl}
      </>
    );
  return (
    <>
      {body}
      {panelEl}
      {viewMenuEl}
    </>
  );
};

/** Cell: vertically centered; text never wraps into more than 2 lines (rule from Emanuel). */
export const Td: React.FC<{ children?: React.ReactNode; right?: boolean; mono?: boolean; className?: string; colSpan?: number; noClamp?: boolean; 'data-col'?: string }> = ({ children, right, mono, className, colSpan, noClamp, ...rest }) => (
  <td {...rest} colSpan={colSpan} className={`overflow-hidden px-3 py-2.5 align-middle ${right ? 'text-right' : ''} ${mono ? 'whitespace-nowrap font-mono' : ''} ${className ?? ''}`}>
    {mono || noClamp ? children : <div className="line-clamp-2 break-words">{children}</div>}
  </td>
);

// ── DataTable: the same table from column definitions ──────────────────────
export interface Col<T> {
  key: string;
  label: string;
  cell: (row: T) => React.ReactNode;
  right?: boolean;
  mono?: boolean;
  noClamp?: boolean;
  className?: string;
}

export function DataTable<T>({ id, columns, rows, rowKey, minWidth = 900, empty, rowClassName, rowStyle, title, defaultViews, peekExtra, peekHide, help, onAddField, onColumnMenu, noTitle, onFilters }: { id: string; columns: Col<T>[]; rows: T[]; rowKey: (r: T) => string; minWidth?: number; empty?: string; rowClassName?: string; /** Color de fondo / borde por fila (Daily: pintar tareas). */ rowStyle?: (r: T) => React.CSSProperties | undefined; title?: string; defaultViews?: ViewDef[]; peekExtra?: (rowKey: string) => React.ReactNode; peekHide?: string[]; help?: Record<string, string>; onAddField?: (type: (typeof ADDABLE_TYPES)[number]) => void; onColumnMenu?: (key: string, anchor: HTMLElement, sort: (dir: 'asc' | 'desc') => void) => void; noTitle?: boolean; onFilters?: (filters: Filter[]) => void }) {
  return (
    <Table id={id} title={title} defaultViews={defaultViews} peekExtra={peekExtra} peekHide={peekHide} help={help} onAddField={onAddField} onColumnMenu={onColumnMenu} noTitle={noTitle} onFilters={onFilters} head={columns.map((c) => c.label)} colKeys={columns.map((c) => c.key)} minWidth={minWidth} empty={empty} isEmpty={!rows.length}>
      {rows.map((r) => (
        <tr key={rowKey(r)} className={rowClassName ?? 'border-b border-white/[0.05] hover:bg-white/[0.02]'} style={rowStyle?.(r)}>
          {columns.map((c) => (
            <Td key={c.key} right={c.right} mono={c.mono} noClamp={c.noClamp} className={c.className}>
              {c.cell(r)}
            </Td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
