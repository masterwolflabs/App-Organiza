/**
 * Bases de datos estilo Notion (Emanuel, 2026-10-15) — pure logic shared by
 * the table UI, the section and the note embed. Tables: `user_databases`
 * (properties jsonb) + `user_database_rows` (values jsonb {propertyId: value}).
 *
 * Formulas (2026-10-16): Notion's formula language — prop("Nombre"), if(),
 * dates, text, lists… — via utils/notionFormula.ts (never eval). The older
 * {Nombre} references keep working.
 */
import { formatValue, parseDateText, runFormula, type FVal } from '@/utils/notionFormula';

export type PropType = 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url' | 'formula' | 'relation' | 'rollup';
/** Rollup ("Resumen") functions over the related rows' column. */
export type RollupFn = 'contar' | 'contar_valores' | 'sumar' | 'promedio' | 'minimo' | 'maximo' | 'mostrar';
export type NumberFormat = 'plain' | 'clp' | 'usd' | 'percent';
export type OptionColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export interface SelectOption {
  id: string;
  name: string;
  color: OptionColor;
}

export interface DbProperty {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
  numberFormat?: NumberFormat;
  formula?: string;
  width?: number;
  /** relation: the other table (Empresa table id) and the mirrored column there. */
  relation?: { table: string; reverseId?: string | null };
  /** rollup: which relation column, which column of the related rows, and how to summarize. */
  rollup?: { relationId: string; column: string; fn: RollupFn };
}

export type CellValue = string | number | boolean | string[] | null;

export interface DbRow {
  id: string;
  values: Record<string, CellValue>;
  position: number;
}

export interface UserDatabase {
  id: string;
  title: string;
  icon: string | null;
  properties: DbProperty[];
  updatedAt: string;
}

export const TYPE_LABEL: Record<PropType, string> = {
  title: 'Título',
  text: 'Texto',
  number: 'Número',
  select: 'Selección',
  multi_select: 'Selección múltiple',
  date: 'Fecha',
  checkbox: 'Casilla',
  url: 'Enlace',
  formula: 'Fórmula',
  relation: 'Relación',
  rollup: 'Resumen',
};

/** Types offered when adding / changing a column (title is fixed, one per database). */
export const ADDABLE_TYPES: PropType[] = ['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'formula'];

export const OPTION_COLORS: OptionColor[] = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

/** Pill classes per option color (dark-first; the light theme layer adapts them). */
export const OPTION_CLASS: Record<OptionColor, string> = {
  gray: 'bg-zinc-500/20 text-zinc-200',
  brown: 'bg-amber-900/40 text-amber-200',
  orange: 'bg-orange-500/20 text-orange-200',
  yellow: 'bg-yellow-500/20 text-yellow-200',
  green: 'bg-emerald-500/20 text-emerald-200',
  blue: 'bg-sky-500/20 text-sky-200',
  purple: 'bg-violet-500/20 text-violet-200',
  pink: 'bg-pink-500/20 text-pink-200',
  red: 'bg-rose-500/20 text-rose-200',
};

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export const newProperty = (type: PropType, name?: string): DbProperty => ({
  id: uid(),
  name: name ?? TYPE_LABEL[type],
  type,
  ...(type === 'select' || type === 'multi_select' ? { options: [] } : {}),
  ...(type === 'number' ? { numberFormat: 'plain' as NumberFormat } : {}),
  ...(type === 'formula' ? { formula: '' } : {}),
});

export const newOption = (name: string, existing: SelectOption[]): SelectOption => ({
  id: uid(),
  name,
  color: OPTION_COLORS[existing.length % OPTION_COLORS.length],
});

export function formatNumber(n: number, f: NumberFormat = 'plain'): string {
  if (!Number.isFinite(n)) return '—';
  if (f === 'clp') return `$${Math.round(n).toLocaleString('es-CL')}`;
  if (f === 'usd') return `US$${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (f === 'percent') return `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
  return n.toLocaleString('es-CL', { maximumFractionDigits: 6 });
}

/** Numeric value of a cell, for formulas and sorting. */
export function numericValue(p: DbProperty, v: CellValue): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (p.type === 'number') return typeof v === 'number' ? v : Number(v);
  if (p.type === 'checkbox') return v ? 1 : 0;
  if (p.type === 'multi_select') return Array.isArray(v) ? v.length : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface FormulaResult {
  /** Numeric result (null when the formula gives text, a date, etc.). */
  value: number | null;
  /** Any result: number, text, true/false, date or list. */
  raw: FVal;
  error?: string;
}

/** A cell as a formula value: number, text, true/false, date (from "YYYY-MM-DD") or list of option names. */
export function formulaValue(p: DbProperty, v: CellValue): FVal {
  if (v === null || v === undefined || v === '') return null;
  switch (p.type) {
    case 'number':
      return typeof v === 'number' ? v : Number(v);
    case 'checkbox':
      return Boolean(v);
    case 'select':
      return p.options?.find((o) => o.id === v)?.name ?? null;
    case 'multi_select':
      return Array.isArray(v) ? v.map((id) => p.options?.find((o) => o.id === id)?.name ?? '').filter(Boolean) : [];
    case 'date':
      return typeof v === 'string' ? parseDateText(v) : null;
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

/**
 * Evaluates a formula column (Notion syntax). Other formula columns are
 * evaluated on demand; a cycle stops with "Referencia circular". `extra`
 * adds values by name (e.g. an Empresa table's own columns).
 */
export function evaluateFormula(formula: string, props: DbProperty[], row: DbRow, opts?: { extra?: Record<string, FVal>; stack?: string[] }): FormulaResult {
  const stack = opts?.stack ?? [];
  const extra = opts?.extra ?? {};
  const byName = (name: string) => props.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  const res = runFormula(formula, (name) => {
    const p = byName(name);
    if (p) {
      if (p.type !== 'formula') return formulaValue(p, row.values[p.id] ?? null);
      if (stack.includes(p.id)) throw new Error('Referencia circular');
      const inner = evaluateFormula(p.formula ?? '', props, row, { extra, stack: [...stack, p.id] });
      if (inner.error) throw new Error(inner.error);
      return inner.raw;
    }
    const k = name.trim().toLowerCase();
    return k in extra ? extra[k] : undefined;
  });
  const raw = res.value;
  return { raw, value: typeof raw === 'number' ? raw : null, error: res.error };
}

/** What a formula cell shows: numbers with the column's format, true/false as ✓ / ✗, dates dd-mm-aaaa. */
export function formulaDisplay(res: FormulaResult, f?: NumberFormat): string {
  if (res.error) return '⚠︎';
  const v = res.raw;
  if (typeof v === 'number') return formatNumber(v, f);
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return formatValue(v);
}

/** Text used for search and text sorting. */
export function displayText(p: DbProperty, v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (p.type === 'select') return p.options?.find((o) => o.id === v)?.name ?? '';
  if (p.type === 'multi_select') return Array.isArray(v) ? v.map((id) => p.options?.find((o) => o.id === id)?.name ?? '').join(' ') : '';
  if (p.type === 'checkbox') return v ? 'sí' : 'no';
  return String(v);
}

export function compareRows(p: DbProperty, props: DbProperty[], a: DbRow, b: DbRow): number {
  if (p.type === 'number' || p.type === 'checkbox' || p.type === 'formula') {
    const av = p.type === 'formula' ? evaluateFormula(p.formula ?? '', props, a).value : numericValue(p, a.values[p.id] ?? null);
    const bv = p.type === 'formula' ? evaluateFormula(p.formula ?? '', props, b).value : numericValue(p, b.values[p.id] ?? null);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  }
  return displayText(p, a.values[p.id] ?? null).localeCompare(displayText(p, b.values[p.id] ?? null), 'es');
}

export const isSafeUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

// ── Templates ──────────────────────────────────────────────────────────────
export interface DbTemplate {
  key: string;
  icon: string;
  title: string;
  description: string;
  build: () => { properties: DbProperty[]; rows: Record<string, CellValue>[] };
}

export const DB_TEMPLATES: DbTemplate[] = [
  {
    key: 'blank',
    icon: '📄',
    title: 'En blanco',
    description: 'Solo una columna de título. Arma el resto a tu medida.',
    build: () => ({ properties: [{ ...newProperty('title', 'Nombre') }, newProperty('text', 'Notas')], rows: [{}, {}, {}] }),
  },
  {
    key: 'budget',
    icon: '💰',
    title: 'Presupuesto',
    description: 'Ítems, categoría, presupuestado vs gastado y la diferencia.',
    build: () => {
      const title = newProperty('title', 'Ítem');
      const cat = newProperty('select', 'Categoría');
      cat.options = ['Hogar', 'Comida', 'Transporte', 'Ocio'].map((n, i) => ({ id: uid(), name: n, color: OPTION_COLORS[(i + 4) % OPTION_COLORS.length] }));
      const plan = { ...newProperty('number', 'Presupuesto'), numberFormat: 'clp' as NumberFormat };
      const spent = { ...newProperty('number', 'Gastado'), numberFormat: 'clp' as NumberFormat };
      const diff = { ...newProperty('formula', 'Diferencia'), formula: '{Presupuesto} - {Gastado}', numberFormat: 'clp' as NumberFormat };
      return {
        properties: [title, cat, plan, spent, diff],
        rows: [
          { [title.id]: 'Arriendo', [cat.id]: cat.options[0].id, [plan.id]: 450000, [spent.id]: 450000 },
          { [title.id]: 'Supermercado', [cat.id]: cat.options[1].id, [plan.id]: 200000, [spent.id]: 168000 },
          { [title.id]: 'Bencina', [cat.id]: cat.options[2].id, [plan.id]: 80000, [spent.id]: 92000 },
        ],
      };
    },
  },
  {
    key: 'shopping',
    icon: '🛒',
    title: 'Lista de compras',
    description: 'Producto, cantidad, precio, total y casilla de comprado.',
    build: () => {
      const title = newProperty('title', 'Producto');
      const qty = newProperty('number', 'Cantidad');
      const price = { ...newProperty('number', 'Precio'), numberFormat: 'clp' as NumberFormat };
      const total = { ...newProperty('formula', 'Total'), formula: '{Cantidad} * {Precio}', numberFormat: 'clp' as NumberFormat };
      const done = newProperty('checkbox', 'Comprado');
      return {
        properties: [title, qty, price, total, done],
        rows: [
          { [title.id]: 'Leche', [qty.id]: 2, [price.id]: 1190 },
          { [title.id]: 'Pan', [qty.id]: 1, [price.id]: 2500 },
        ],
      };
    },
  },
  {
    key: 'goals',
    icon: '🎯',
    title: 'Metas de ahorro',
    description: 'Meta, monto objetivo, ahorrado, % de avance y fecha.',
    build: () => {
      const title = newProperty('title', 'Meta');
      const target = { ...newProperty('number', 'Objetivo'), numberFormat: 'clp' as NumberFormat };
      const saved = { ...newProperty('number', 'Ahorrado'), numberFormat: 'clp' as NumberFormat };
      const pct = { ...newProperty('formula', 'Avance %'), formula: '{Ahorrado} / {Objetivo} * 100', numberFormat: 'percent' as NumberFormat };
      const date = newProperty('date', 'Fecha límite');
      return {
        properties: [title, target, saved, pct, date],
        rows: [{ [title.id]: 'Fondo de emergencia', [target.id]: 1500000, [saved.id]: 400000 }],
      };
    },
  },
];
