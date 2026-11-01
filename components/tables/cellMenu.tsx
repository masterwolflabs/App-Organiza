'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, EyeOff, Highlighter, Italic, Palette, Pencil, RemoveFormatting, RotateCcw, Sigma, SlidersHorizontal, Strikethrough, HelpCircle } from 'lucide-react';

/**
 * Right-click formatting for Empresa tables (Emanuel, 2026-10-16): a cell or a
 * whole column can be bold / italic / highlighted / recolored. Stored in the
 * table view's prefs (`fmt`) and applied with generated CSS keyed by the row's
 * `data-unit` and the cell's `data-col`, so it survives sorting and reordering.
 */
export type CellFmt = { b?: boolean; i?: boolean; s?: boolean; hl?: string; c?: string };
export type Fmt = { cols: Record<string, CellFmt>; cells: Record<string, CellFmt> };
export const EMPTY_FMT: Fmt = { cols: {}, cells: {} };
export const cellKey = (unit: string, col: string) => `${unit}::${col}`;

const TEXT_COLORS = ['#38bdf8', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#a1a1aa'];
const HL_COLORS = ['#facc15', '#34d399', '#38bdf8', '#f87171', '#a78bfa', '#fb923c'];

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

/** CSS for a table's formats. Cells beat columns (more specific selector). */
export function fmtCss(tid: string, fmt: Fmt | undefined): string {
  if (!fmt) return '';
  const rules: string[] = [];
  const add = (sel: string, f: CellFmt) => {
    const d = [
      f.b === true ? 'font-weight:700!important' : f.b === false ? 'font-weight:400!important' : '',
      f.i === true ? 'font-style:italic!important' : f.i === false ? 'font-style:normal!important' : '',
      f.s === true ? 'text-decoration:line-through!important' : f.s === false ? 'text-decoration:none!important' : '',
      f.c ? `color:${f.c}!important` : '',
    ].filter(Boolean).join(';');
    if (d) rules.push(`${sel},${sel} *{${d}}`);
    if (f.hl) rules.push(`${sel}{background:${hexA(f.hl, 0.2)}!important;box-shadow:inset 3px 0 0 ${f.hl}}`);
  };
  for (const [col, f] of Object.entries(fmt.cols)) add(`#${tid}>tbody>tr>td[data-col="${esc(col)}"]`, f);
  for (const [k, f] of Object.entries(fmt.cells)) {
    const i = k.lastIndexOf('::');
    add(`#${tid}>tbody>tr[data-unit="${esc(k.slice(0, i))}"]>td[data-col="${esc(k.slice(i + 2))}"]`, f);
  }
  return rules.join('\n');
}

export type MenuTarget = { x: number; y: number; col: string; colLabel: string; unit: string | null; editable: HTMLElement | null };

type Props = {
  target: MenuTarget;
  fmt: Fmt;
  onChange: (fmt: Fmt) => void;
  onClose: () => void;
  /** What the column offers: Editar fórmula / Editar casilla / Crear fórmula con esta columna. */
  columnAction?: { label: string; kind: 'formula' | 'cell' | 'create'; run: () => void } | null;
  /** Why the cell can't be edited here (computed by the app), shown instead of "Editar dato". */
  cellNote?: string;
  /** Hide the whole column in this view (it comes back from Configuración → Columnas). */
  onHideColumn?: () => void;
  /** "¿Para qué sirve?": shows the column's help box (same as resting the cursor 3 s). */
  onHelp?: () => void;
};

/** The right-click menu: "Celda" (only when a row cell was clicked) + "Columna". */
export const CellMenu: React.FC<Props> = ({ target, fmt, onChange, onClose, columnAction, cellNote, onHideColumn, onHelp }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const [open, setOpen] = useState<string | null>(null); // which color row is open

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(target.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - r.height - 8)),
    });
  }, [target, open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const colF = fmt.cols[target.col] ?? {};
  const cKey = target.unit ? cellKey(target.unit, target.col) : null;
  const cellF = cKey ? fmt.cells[cKey] ?? {} : {};
  // What the cell actually shows (its own format, else the column's).
  const eff = { b: cellF.b ?? colF.b, i: cellF.i ?? colF.i, s: cellF.s ?? colF.s, hl: cellF.hl ?? colF.hl, c: cellF.c ?? colF.c };

  const setCol = (f: CellFmt | null) => {
    const cols = { ...fmt.cols };
    if (f && Object.values(f).some((v) => v !== undefined)) cols[target.col] = f;
    else delete cols[target.col];
    onChange({ ...fmt, cols });
  };
  const setCell = (f: CellFmt | null) => {
    if (!cKey) return;
    const cells = { ...fmt.cells };
    if (f && Object.values(f).some((v) => v !== undefined)) cells[cKey] = f;
    else delete cells[cKey];
    onChange({ ...fmt, cells });
  };

  const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  const swatches = (colors: string[], value: string | undefined, pick: (c: string | undefined) => void) => (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 pt-0.5">
      {colors.map((c) => (
        <button key={c} type="button" onClick={() => pick(c)} aria-label={c} style={{ background: c }} className={`h-5 w-5 rounded-md border ${value === c ? 'border-white ring-2 ring-sky-400/60' : 'border-white/20'}`} />
      ))}
      <button type="button" onClick={() => pick(undefined)} className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white">
        Quitar
      </button>
    </div>
  );

  const group = (scope: 'cell' | 'col') => {
    const f = scope === 'cell' ? cellF : colF;
    const shown = scope === 'cell' ? eff : colF;
    const set = scope === 'cell' ? setCell : setCol;
    const k = (name: string) => `${scope}:${name}`;
    return (
      <>
        {/* Notion-style row: Normal · Negrita · Cursiva · Tachado (toggles keep the menu open). */}
        <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5" role="group" aria-label={scope === 'cell' ? 'Estilo de la celda' : 'Estilo de la columna'}>
          {(
            [
              ['normal', 'Normal (quitar estilo)', RemoveFormatting],
              ['b', 'Negrita', Bold],
              ['i', 'Cursiva', Italic],
              ['s', 'Tachado', Strikethrough],
            ] as const
          ).map(([key, label, Icon]) => {
            const isOn = key === 'normal' ? !shown.b && !shown.i && !shown.s : !!shown[key];
            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={key === 'normal' ? undefined : isOn}
                onClick={() => {
                  if (key === 'normal') {
                    // Keep color / highlight; drop bold, italic and strikethrough.
                    const off = scope === 'cell' ? { b: colF.b ? false : undefined, i: colF.i ? false : undefined, s: colF.s ? false : undefined } : { b: undefined, i: undefined, s: undefined };
                    set({ ...f, ...off });
                  } else set({ ...f, [key]: shown[key] ? (scope === 'cell' && colF[key] ? false : undefined) : true });
                }}
                className={`flex h-8 flex-1 items-center justify-center rounded-lg border transition-colors ${
                  isOn && key !== 'normal' ? 'border-sky-400/60 bg-sky-500/20 text-sky-100' : 'border-white/10 text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <button type="button" className={item} onClick={() => setOpen(open === k('hl') ? null : k('hl'))}>
          <Highlighter className="h-3.5 w-3.5 text-zinc-400" /> Destacar {shown.hl && <span className="ml-auto h-3 w-3 rounded-sm" style={{ background: shown.hl }} />}
        </button>
        {open === k('hl') && swatches(HL_COLORS, f.hl, (c) => { set({ ...f, hl: c }); onClose(); })}
        <button type="button" className={item} onClick={() => setOpen(open === k('c') ? null : k('c'))}>
          <Palette className="h-3.5 w-3.5 text-zinc-400" /> Cambiar color {shown.c && <span className="ml-auto h-3 w-3 rounded-full" style={{ background: shown.c }} />}
        </button>
        {open === k('c') && swatches(TEXT_COLORS, f.c, (c) => { set({ ...f, c }); onClose(); })}
      </>
    );
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={ref} role="menu" style={pos} className="fixed z-[91] w-60 rounded-xl border border-white/10 bg-[#151922] p-1.5 text-xs shadow-2xl" onContextMenu={(e) => e.preventDefault()}>
        {onHelp && (
          <button type="button" onClick={onHelp} className="mb-1 flex w-full items-center gap-2 rounded-lg border-b border-white/[0.06] px-2 py-1.5 text-left text-zinc-200 hover:bg-white/[0.06]">
            <HelpCircle className="h-3.5 w-3.5 text-violet-300" /> ¿Para qué sirve?
          </button>
        )}
        {target.unit && (
          <>
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Celda</p>
            {target.editable ? (
              <button
                type="button"
                className={item}
                onClick={() => {
                  const el = target.editable!;
                  onClose();
                  setTimeout(() => {
                    // Our own columns are inputs (focus them); the table's values open their double-click editor.
                    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                      el.focus();
                      el.select?.();
                    } else if (el instanceof HTMLButtonElement) el.click();
                    else el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                  }, 0);
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-zinc-400" /> Editar dato
              </button>
            ) : (
              <p className="flex items-start gap-2 px-2 py-1.5 text-[11px] leading-snug text-zinc-500">
                <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {cellNote ?? 'Este dato lo calcula la app: se cambia desde su ficha o su origen.'}
              </p>
            )}
            {group('cell')}
            <div className="my-1.5 border-t border-white/[0.08]" />
          </>
        )}
        <p className="truncate px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Columna{target.colLabel ? ` · ${target.colLabel}` : ''}</p>
        {group('col')}
        {columnAction && (
          <button
            type="button"
            className={`${item} text-sky-200`}
            onClick={() => {
              onClose();
              columnAction.run();
            }}
          >
            {columnAction.kind === 'cell' ? <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" /> : <Sigma className="h-3.5 w-3.5 text-sky-300" />} {columnAction.label}
          </button>
        )}
        {onHideColumn && (
          <button
            type="button"
            className={item}
            onClick={() => {
              onClose();
              onHideColumn();
            }}
          >
            <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> Ocultar columna
          </button>
        )}
        {(Object.keys(fmt.cols).length > 0 || Object.keys(fmt.cells).length > 0) && (
          <>
            <div className="my-1.5 border-t border-white/[0.08]" />
            <button type="button" className={item} onClick={() => { onChange(EMPTY_FMT); onClose(); }}>
              <RotateCcw className="h-3.5 w-3.5 text-zinc-400" /> Quitar todos los formatos de la tabla
            </button>
          </>
        )}
      </div>
    </>,
    document.body,
  );
};
