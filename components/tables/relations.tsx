'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeftRight, Check, Layers, Search, Trash2, X } from 'lucide-react';
import { Popover } from '@/components/databases/DatabaseTable';
import { useTableViewsStore } from '@/components/tables/viewsStore';
import { builtinValue, type FieldsDoc } from '@/components/tables/customFields';
import { formatCLP } from '@/utils/formatters';
import type { CellValue, DbProperty, RollupFn } from '@/utils/databases';

/**
 * Relaciones entre tablas de Empresa, como en Notion (Moisés, 2026-10-19).
 *
 * - Every Empresa table with an id PUBLISHES its rows here (key, a readable
 *   label and each column's text) — in memory and in localStorage, so a table
 *   that's folded or on another screen (Master Cloud) can still be pointed at.
 * - A "Relación" column (DbProperty type 'relation') keeps, per row, the keys
 *   of rows of ANOTHER table. Two-way by default: the other table gets a
 *   mirrored column and both sides are kept in step.
 * - A "Resumen" column (type 'rollup') summarizes a column of the related rows
 *   (contar, sumar, promedio, mínimo, máximo, mostrar).
 *
 * Values live in the same `table_views` store as every custom column
 * (`<tableId>::campos`), so no migration.
 */

// ── Rows registry ──────────────────────────────────────────────────────────
export type RegRow = { key: string; label: string; cols: Record<string, string> };
export type RegTable = { id: string; title: string; rows: RegRow[] };
type RegMap = Record<string, RegTable>;

/** Tables rendered more than once (one per person / per project) can't be a target. */
export const NOT_RELATABLE = new Set(['comisiones', 'pagos-recibidos']);

const maps = new Map<string, RegMap>();
const listeners = new Set<() => void>();
const lsKey = (scope: string) => `mf-rows:${scope}`;
function load(scope: string): RegMap {
  let m = maps.get(scope);
  if (m) return m;
  try {
    m = JSON.parse(localStorage.getItem(lsKey(scope)) || '{}') as RegMap;
  } catch {
    m = {};
  }
  maps.set(scope, m);
  return m;
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function publishRows(scope: string, t: RegTable) {
  if (!scope || NOT_RELATABLE.has(t.id)) return;
  const m = load(scope);
  if (JSON.stringify(m[t.id]) === JSON.stringify(t)) return;
  const next = { ...m, [t.id]: t };
  maps.set(scope, next);
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(lsKey(scope), JSON.stringify(next));
    } catch {
      /* full / private mode */
    }
  }, 400);
}
const EMPTY: RegMap = {};
export function useRegistry(scope: string | undefined): RegMap {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (scope ? load(scope) : EMPTY),
    () => EMPTY,
  );
}

// ── Two-way writes ─────────────────────────────────────────────────────────
type Store = NonNullable<ReturnType<typeof useTableViewsStore>>;
const docOf = (store: Store, table: string): FieldsDoc => {
  const d = store.get(`${table}::campos`) as FieldsDoc | undefined;
  return { fields: d?.fields ?? [], values: d?.values ?? {}, locked: d?.locked };
};
const keysOf = (v: CellValue | undefined): string[] => (Array.isArray(v) ? v : []);

/** Set a row's related keys and mirror the change on the other table. */
export function setRelation(store: Store, table: string, field: DbProperty, unit: string, next: string[]) {
  const own = docOf(store, table);
  const before = keysOf(own.values[unit]?.[field.id]);
  store.set(`${table}::campos`, { ...own, values: { ...own.values, [unit]: { ...(own.values[unit] ?? {}), [field.id]: next } } });
  const target = field.relation?.table;
  const rid = field.relation?.reverseId;
  if (!target || !rid || target === table) return;
  const added = next.filter((k) => !before.includes(k));
  const removed = before.filter((k) => !next.includes(k));
  if (!added.length && !removed.length) return;
  const other = docOf(store, target);
  const values = { ...other.values };
  for (const k of added) {
    const cur = keysOf(values[k]?.[rid]);
    if (!cur.includes(unit)) values[k] = { ...(values[k] ?? {}), [rid]: [...cur, unit] };
  }
  for (const k of removed) values[k] = { ...(values[k] ?? {}), [rid]: keysOf(values[k]?.[rid]).filter((x) => x !== unit) };
  store.set(`${target}::campos`, { ...other, values });
}

/** New relation column (and its mirror on the other table when two-way). Returns the new field. */
export function createRelation(store: Store, table: string, tableTitle: string, target: RegTable, twoWay: boolean): DbProperty {
  const fid = `rel${Math.random().toString(36).slice(2, 9)}`;
  const rid = twoWay && target.id !== table ? `rel${Math.random().toString(36).slice(2, 9)}` : null;
  const field: DbProperty = { id: fid, name: target.title, type: 'relation', relation: { table: target.id, reverseId: rid } };
  const own = docOf(store, table);
  store.set(`${table}::campos`, { ...own, fields: [...own.fields, field] });
  if (rid) {
    const other = docOf(store, target.id);
    store.set(`${target.id}::campos`, { ...other, fields: [...other.fields, { id: rid, name: tableTitle, type: 'relation', relation: { table, reverseId: fid } }] });
  }
  return field;
}

/** Removing a relation also removes its mirror on the other table (and rollups that used it). */
export function removeRelationMirror(store: Store, field: DbProperty) {
  const target = field.relation?.table;
  const rid = field.relation?.reverseId;
  if (!target || !rid) return;
  const other = docOf(store, target);
  const fields = other.fields.filter((f) => f.id !== rid && f.rollup?.relationId !== rid);
  const values = Object.fromEntries(Object.entries(other.values).map(([u, v]) => [u, Object.fromEntries(Object.entries(v).filter(([k]) => k !== rid))]));
  store.set(`${target}::campos`, { ...other, fields, values });
}

// ── Rollup ─────────────────────────────────────────────────────────────────
export const ROLLUP_LABEL: Record<RollupFn, string> = {
  contar: 'Contar filas',
  contar_valores: 'Contar con valor',
  sumar: 'Sumar',
  promedio: 'Promedio',
  minimo: 'Mínimo',
  maximo: 'Máximo',
  mostrar: 'Mostrar los valores',
};
const fmtNum = (n: number, money: boolean) => (money ? formatCLP(n) : n.toLocaleString('es-CL', { maximumFractionDigits: 2 }));
export function rollupText(field: DbProperty, rowValues: Record<string, CellValue> | undefined, reg: RegMap, relField: DbProperty | undefined): string {
  const r = field.rollup;
  if (!r || !relField?.relation) return '';
  const target = reg[relField.relation.table];
  const keys = keysOf(rowValues?.[relField.id]);
  if (r.fn === 'contar') return String(keys.length);
  const texts = keys.map((k) => target?.rows.find((x) => x.key === k)?.cols[r.column] ?? '').filter((t) => t.trim() && t.trim() !== '—');
  if (r.fn === 'contar_valores') return String(texts.length);
  if (r.fn === 'mostrar') return texts.join(', ');
  const money = texts.some((t) => t.includes('$'));
  const nums = texts.map((t) => builtinValue(t)).filter((x): x is number => typeof x === 'number');
  if (!nums.length) return '';
  const v = r.fn === 'sumar' ? nums.reduce((a, b) => a + b, 0) : r.fn === 'promedio' ? nums.reduce((a, b) => a + b, 0) / nums.length : r.fn === 'minimo' ? Math.min(...nums) : Math.max(...nums);
  return fmtNum(v, money);
}

// ── Cells ──────────────────────────────────────────────────────────────────
const chip = 'inline-flex max-w-[180px] items-center gap-1 truncate rounded-md bg-sky-500/15 px-1.5 py-0.5 text-xs font-medium text-sky-100';

export const RelationCell: React.FC<{ table: string; field: DbProperty; unit: string; value: CellValue | undefined }> = ({ table, field, unit, value }) => {
  const store = useTableViewsStore();
  const reg = useRegistry(store?.scope);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const target = field.relation ? reg[field.relation.table] : undefined;
  const keys = keysOf(value);
  const labelOf = (k: string) => target?.rows.find((r) => r.key === k)?.label ?? 'Fila no disponible';
  const labels = keys.map(labelOf);
  return (
    <>
      <span className="sr-only">{labels.join(', ')}</span>
      <button
        type="button"
        disabled={!store}
        onClick={(e) => setAnchor(e.currentTarget)}
        className="flex min-h-[30px] w-full flex-wrap items-center gap-1 px-2 py-1 text-left hover:bg-white/[0.04]"
        title={labels.join(', ') || 'Relacionar con…'}
      >
        {keys.length ? keys.slice(0, 3).map((k, i) => <span key={k} className={chip}>↗ {labels[i]}</span>) : <span className="text-xs text-zinc-600">Vacío</span>}
        {keys.length > 3 && <span className="text-xs text-zinc-400">+{keys.length - 3}</span>}
      </button>
      {anchor && store && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={300}>
          <RelationPicker
            target={target}
            selected={keys}
            onChange={(next) => setRelation(store, table, field, unit, next)}
          />
        </Popover>
      )}
    </>
  );
};

const RelationPicker: React.FC<{ target: RegTable | undefined; selected: string[]; onChange: (next: string[]) => void }> = ({ target, selected, onChange }) => {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!target) return <p className="p-3 text-xs text-zinc-400">Abre una vez la tabla relacionada para que sus filas aparezcan aquí.</p>;
  const rows = target.rows.filter((r) => !q || norm(`${r.label} ${Object.values(r.cols).join(' ')}`).includes(norm(q)));
  const chosen = rows.filter((r) => selected.includes(r.key));
  const rest = rows.filter((r) => !selected.includes(r.key));
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  const Row = ({ r }: { r: RegRow }) => (
    <button type="button" onClick={() => toggle(r.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.includes(r.key) ? 'border-sky-400 bg-sky-500' : 'border-white/20'}`}>{selected.includes(r.key) && <Check className="h-3 w-3 text-white" />}</span>
      <span className="truncate">{r.label}</span>
    </button>
  );
  return (
    <div>
      <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Relacionar con {target.title}</p>
      <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2">
        <Search className="h-3.5 w-3.5 text-zinc-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-full bg-transparent py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none" />
      </div>
      <div className="mf-noscroll max-h-72 overflow-y-auto">
        {chosen.length > 0 && (
          <>
            {chosen.map((r) => <Row key={r.key} r={r} />)}
            <div className="my-1 border-t border-white/[0.06]" />
          </>
        )}
        {rest.map((r) => <Row key={r.key} r={r} />)}
        {!rows.length && <p className="px-2 py-2 text-xs text-zinc-500">Nada coincide.</p>}
      </div>
      {selected.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.06] hover:text-white">
          <X className="h-3.5 w-3.5" /> Quitar todas
        </button>
      )}
    </div>
  );
};

export const RollupCell: React.FC<{ field: DbProperty; fields: DbProperty[]; rowValues: Record<string, CellValue> | undefined }> = ({ field, fields, rowValues }) => {
  const store = useTableViewsStore();
  const reg = useRegistry(store?.scope);
  const rel = fields.find((f) => f.id === field.rollup?.relationId);
  const text = rollupText(field, rowValues, reg, rel);
  const numeric = field.rollup && !['mostrar'].includes(field.rollup.fn);
  return (
    <div className={`truncate px-2 py-1.5 text-sm ${numeric ? 'text-right font-mono text-zinc-100' : 'text-zinc-200'}`} title={rel ? `${ROLLUP_LABEL[field.rollup!.fn]} de “${field.rollup!.column}” en ${rel.name}` : 'Configura el resumen en el menú de la columna'}>
      {text || <span className="text-zinc-600">—</span>}
    </div>
  );
};

/** Text of a relation / rollup cell, for formulas (prop("X")) and the registry. */
export function relationText(field: DbProperty, rowValues: Record<string, CellValue> | undefined, reg: RegMap, fields: DbProperty[]): string {
  if (field.type === 'rollup') return rollupText(field, rowValues, reg, fields.find((f) => f.id === field.rollup?.relationId));
  const t = field.relation ? reg[field.relation.table] : undefined;
  return keysOf(rowValues?.[field.id])
    .map((k) => t?.rows.find((r) => r.key === k)?.label ?? '')
    .filter(Boolean)
    .join(', ');
}

// ── Creating / configuring ─────────────────────────────────────────────────
export const AddRelationPanel: React.FC<{ table: string; scope: string; onPick: (target: RegTable, twoWay: boolean) => void }> = ({ table, scope, onPick }) => {
  const reg = useRegistry(scope);
  const [twoWay, setTwoWay] = useState(true);
  const tables = Object.values(reg).sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return (
    <div className="p-1">
      <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Relacionar con la tabla…</p>
      {tables.map((t) => (
        <button key={t.id} type="button" onClick={() => onPick(t, twoWay)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
          <span className="flex min-w-0 items-center gap-2">
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-sky-300" />
            <span className="truncate">{t.title}</span>
            {t.id === table && <span className="text-[10px] text-zinc-500">(esta)</span>}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-500">{t.rows.length} filas</span>
        </button>
      ))}
      {!tables.length && <p className="px-2 py-2 text-xs text-zinc-500">Todavía no hay tablas para relacionar.</p>}
      <label className="mt-1 flex items-center gap-2 border-t border-white/[0.06] px-2 pt-2 text-xs text-zinc-300">
        <input type="checkbox" checked={twoWay} onChange={(e) => setTwoWay(e.target.checked)} className="accent-sky-500" />
        Mostrar también en la otra tabla (ida y vuelta)
      </label>
    </div>
  );
};

export const RollupConfig: React.FC<{ fields: DbProperty[]; scope: string; value?: DbProperty['rollup']; onSave: (r: NonNullable<DbProperty['rollup']>) => void }> = ({ fields, scope, value, onSave }) => {
  const reg = useRegistry(scope);
  const rels = fields.filter((f) => f.type === 'relation');
  const [relationId, setRelationId] = useState(value?.relationId ?? rels[0]?.id ?? '');
  const rel = rels.find((f) => f.id === relationId);
  const target = rel?.relation ? reg[rel.relation.table] : undefined;
  const columns = useMemo(() => [...new Set((target?.rows ?? []).flatMap((r) => Object.keys(r.cols)))], [target]);
  const [column, setColumn] = useState(value?.column ?? '');
  const [fn, setFn] = useState<RollupFn>(value?.fn ?? 'sumar');
  const sel = 'w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:border-sky-500 focus:outline-none';
  if (!rels.length) return <p className="p-3 text-xs text-zinc-400">Primero agrega una columna de Relación en esta tabla: el resumen se calcula sobre las filas relacionadas.</p>;
  return (
    <div className="space-y-2 p-2 text-xs text-zinc-300">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Resumen de filas relacionadas</p>
      <label className="block">
        Relación
        <select value={relationId} onChange={(e) => { setRelationId(e.target.value); setColumn(''); }} className={sel}>
          {rels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Columna
        <select value={column} onChange={(e) => setColumn(e.target.value)} className={sel}>
          <option value="">Elige una columna…</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Cálculo
        <select value={fn} onChange={(e) => setFn(e.target.value as RollupFn)} className={sel}>
          {(Object.keys(ROLLUP_LABEL) as RollupFn[]).map((k) => (
            <option key={k} value={k}>
              {ROLLUP_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!relationId || (!column && fn !== 'contar')} onClick={() => onSave({ relationId, column: column || '', fn })} className="w-full rounded-lg bg-sky-600 py-1.5 font-semibold text-white disabled:opacity-40">
        Guardar
      </button>
    </div>
  );
};

/** Header menu for a relation / rollup column: rename, configure, delete. */
export const RelationFieldMenu: React.FC<{
  field: DbProperty;
  fields: DbProperty[];
  anchor: HTMLElement;
  scope: string;
  locked: boolean;
  onRename: (name: string) => void;
  onRollup: (r: NonNullable<DbProperty['rollup']>) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ field, fields, anchor, scope, locked, onRename, onRollup, onDelete, onClose }) => {
  const reg = useRegistry(scope);
  const [name, setName] = useState(field.name);
  const target = field.relation ? reg[field.relation.table] : undefined;
  return (
    <Popover anchor={anchor} onClose={() => { if (name.trim() && name.trim() !== field.name) onRename(name.trim()); onClose(); }} width={280}>
      <div className="p-1">
        <div className="flex items-center gap-2 px-1 pb-2">
          {field.type === 'relation' ? <ArrowLeftRight className="h-4 w-4 text-sky-300" /> : <Layers className="h-4 w-4 text-sky-300" />}
          <input
            value={name}
            disabled={locked}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            onBlur={() => name.trim() && name.trim() !== field.name && onRename(name.trim())}
            className="w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-white focus:border-sky-500 focus:outline-none disabled:opacity-60"
          />
        </div>
        {field.type === 'relation' && (
          <p className="px-2 pb-2 text-xs text-zinc-400">
            Relacionada con <b className="text-zinc-200">{target?.title ?? field.relation?.table}</b>
            {field.relation?.reverseId ? ' · ida y vuelta' : ' · solo en esta tabla'}
          </p>
        )}
        {field.type === 'rollup' && !locked && <RollupConfig fields={fields} scope={scope} value={field.rollup} onSave={(r) => { onRollup(r); onClose(); }} />}
        {!locked && (
          <button type="button" onClick={onDelete} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-rose-300 hover:bg-rose-500/10">
            <Trash2 className="h-4 w-4" /> Eliminar columna{field.type === 'relation' && field.relation?.reverseId ? ' (y la de la otra tabla)' : ''}
          </button>
        )}
      </div>
    </Popover>
  );
};

