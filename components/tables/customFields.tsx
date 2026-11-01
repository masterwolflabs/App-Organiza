'use client';

import React, { useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTableViewsStore } from '@/components/tables/viewsStore';
import { PropertyMenu, SelectCell, TextCell } from '@/components/databases/DatabaseTable';
import { parseDateText, parseNumberText, type FVal } from '@/utils/notionFormula';
import {
  type CellValue,
  type DbProperty,
  type SelectOption,
  displayText,
  evaluateFormula,
  formulaDisplay,
  formatNumber,
  isSafeUrl,
} from '@/utils/databases';

/**
 * Columns the user adds to any Empresa table, like Notion's "+" (Emanuel,
 * 2026-10-16): texto, número, selección, selección múltiple, fecha, casilla,
 * enlace y fórmula. Same types/cells/formulas as Bases de datos
 * (utils/databases.ts). They live in the shared `table_views` store under
 * `<tableId>::campos` = { fields, values: { <row data-unit>: { <fieldId>: value } } },
 * so every view and every computer sees them. Formulas can use the custom
 * fields AND the table's own columns by name: {Monto} * 0.1.
 */
export type FieldsDoc = { fields: DbProperty[]; values: Record<string, Record<string, CellValue>>; locked?: boolean };
const EMPTY_DOC: FieldsDoc = { fields: [], values: {} };
export const CF_PREFIX = 'cf:';

export function useCustomFields(id?: string) {
  const store = useTableViewsStore();
  const key = id ? `${id}::campos` : '';
  // Only once the store has loaded (after mount): reading earlier would differ from the server render.
  const enabled = !!id && !!store && store.ready;
  const doc: FieldsDoc = (enabled ? (store!.get(key) as FieldsDoc | undefined) : undefined) ?? EMPTY_DOC;
  const write = useCallback(
    (mut: (d: FieldsDoc) => FieldsDoc) => {
      if (!id || !store) return;
      const cur = (store.get(key) as FieldsDoc | undefined) ?? EMPTY_DOC;
      store.set(key, mut({ fields: cur.fields ?? [], values: cur.values ?? {}, locked: cur.locked }));
    },
    [id, store, key],
  );
  return {
    enabled,
    locked: !!doc.locked,
    setLocked: (locked: boolean) => write((d) => ({ ...d, locked })),
    fields: doc.fields ?? [],
    values: doc.values ?? {},
    addField: (p: DbProperty) => write((d) => ({ ...d, fields: [...d.fields, p] })),
    updateField: (p: DbProperty) => write((d) => ({ ...d, fields: d.fields.map((f) => (f.id === p.id ? p : f)) })),
    removeField: (fid: string) =>
      write((d) => ({
        ...d,
        fields: d.fields.filter((f) => f.id !== fid),
        values: Object.fromEntries(Object.entries(d.values).map(([u, v]) => [u, Object.fromEntries(Object.entries(v).filter(([k]) => k !== fid))])),
      })),
    /** Several at once (one write — the store's reads are per render, so back-to-back removes would undo each other). */
    removeFields: (ids: string[]) =>
      write((d) => ({
        ...d,
        fields: d.fields.filter((f) => !ids.includes(f.id)),
        values: Object.fromEntries(Object.entries(d.values).map(([u, v]) => [u, Object.fromEntries(Object.entries(v).filter(([k]) => !ids.includes(k)))])),
      })),
    addOption: (fid: string, o: SelectOption) =>
      write((d) => ({ ...d, fields: d.fields.map((f) => (f.id === fid ? { ...f, options: [...(f.options ?? []), o] } : f)) })),
    setValue: (unit: string, fid: string, v: CellValue) =>
      write((d) => ({ ...d, values: { ...d.values, [unit]: { ...(d.values[unit] ?? {}), [fid]: v } } })),
  };
}
export type CustomFieldsApi = ReturnType<typeof useCustomFields>;

/** The table's own columns, so formulas can reference them by name: prop("Monto"). */
export type Builtin = { name: string; text: string };

/** "$ 1.200.000" → number, "15-10-2026" → date, otherwise the text (empty → vacío). */
export function builtinValue(text: string): FVal {
  const t = text.trim();
  if (!t || t === '—' || t === '-') return null;
  const n = parseNumberText(t);
  if (n !== null) return n;
  const d = parseDateText(t);
  return d ?? t;
}

/** One custom cell. A hidden copy of its text keeps filter / search / sort working (they read the cell's text). */
export const CustomCell: React.FC<{ field: DbProperty; unit: string; api: CustomFieldsApi; builtins: Builtin[] }> = ({ field: p, unit, api, builtins }) => {
  const v = api.values[unit]?.[p.id] ?? null;
  const set = (nv: CellValue) => api.setValue(unit, p.id, nv);
  const text = (t: string) => <span className="sr-only">{t}</span>;
  switch (p.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : null;
      const shown = n === null ? '' : formatNumber(n, p.numberFormat);
      return (
        <>
          {text(shown)}
          <TextCell
            value={n === null ? '' : String(n).replace('.', ',')}
            display={shown}
            numeric
            onCommit={(s) => {
              const t = s.trim().replace(/\$|US|%/g, '').replace(/\./g, '').replace(',', '.');
              const num = t === '' ? null : Number(t);
              set(num === null || !Number.isFinite(num) ? null : num);
            }}
          />
        </>
      );
    }
    case 'select':
    case 'multi_select':
      return (
        <>
          {text(displayText(p, v))}
          <SelectCell prop={p} value={v} onChange={set} onAddOption={(o) => api.addOption(p.id, o)} />
        </>
      );
    case 'date':
      return (
        <>
          {text(typeof v === 'string' ? v.split('-').reverse().join('-') : '')}
          <input type="date" value={typeof v === 'string' ? v : ''} onChange={(e) => set(e.target.value || null)} className="w-full bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none" />
        </>
      );
    case 'checkbox':
      return (
        <div className="flex justify-center py-1.5">
          {text(v ? 'sí' : 'no')}
          <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-sky-500" aria-label={p.name} />
        </div>
      );
    case 'url': {
      const s = typeof v === 'string' ? v : '';
      return (
        <div className="flex items-center">
          {text(s)}
          <TextCell value={s} placeholder="https://…" onCommit={(x) => set(x.trim() || null)} />
          {s && isSafeUrl(s) && (
            <a href={s.trim()} target="_blank" rel="noopener noreferrer" className="shrink-0 px-1.5 text-sky-300 hover:text-sky-200" aria-label="Abrir enlace">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      );
    }
    case 'formula': {
      const extra = Object.fromEntries(builtins.map((b) => [b.name.trim().toLowerCase(), builtinValue(b.text)]));
      // Relation / rollup columns reach formulas through `builtins` (their shown text), not as raw keys.
      const res = evaluateFormula(p.formula ?? '', api.fields.filter((f) => f.type !== 'relation' && f.type !== 'rollup'), { id: unit, values: api.values[unit] ?? {}, position: 0 }, { extra });
      // A missing value (e.g. dividing by an empty cell) reads as "—", not as an error.
      const blank = res.error === 'Resultado no válido' || res.error === 'División por cero';
      const shown = blank ? '—' : formulaDisplay(res, p.numberFormat);
      const isNum = typeof res.raw === 'number';
      const tip = blank ? 'Falta un dato para calcular (por ejemplo, dividir por una celda vacía)' : res.error ?? (p.formula ? `= ${p.formula}` : 'Escribe la fórmula en el menú de la columna');
      return (
        <div title={tip} className={`truncate px-2 py-1.5 text-sm ${isNum || blank ? 'text-right font-mono' : ''} ${blank ? 'text-zinc-500' : res.error ? 'text-rose-300' : 'text-zinc-200'}`}>
          {shown}
        </div>
      );
    }
    default: {
      const s = typeof v === 'string' ? v : '';
      return (
        <>
          {text(s)}
          <TextCell value={s} placeholder="Vacío" onCommit={(x) => set(x.trim() || null)} />
        </>
      );
    }
  }
};

/** The column menu (rename, type, number format, formula, options, sort, delete) — the same one Bases de datos uses. */
export const CustomFieldMenu: React.FC<{
  field: DbProperty;
  anchor: HTMLElement;
  api: CustomFieldsApi;
  onSort: (dir: 'asc' | 'desc') => void;
  onDeleted: () => void;
  onClose: () => void;
  confirmDelete: (name: string) => Promise<boolean>;
  onOpenFormula: () => void;
}> = ({ field, anchor, api, onSort, onDeleted, onClose, confirmDelete, onOpenFormula }) => (
  <PropertyMenu
    prop={field}
    anchor={anchor}
    locked={api.locked}
    onOpenFormula={onOpenFormula}
    onClose={onClose}
    onChange={(p) => api.updateField(p)}
    onDelete={async () => {
      onClose();
      if (await confirmDelete(field.name)) {
        api.removeField(field.id);
        onDeleted();
      }
    }}
    onSort={(dir) => {
      onSort(dir);
      onClose();
    }}
  />
);
