'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { EntityMenu, type Entity } from '@/components/calendar/EntityPicker';

/**
 * Click a value to edit it in place (Emanuel, 2026-10-15; one click since 2026-10-26). Enter or
 * leaving the field asks "¿Confirmas el cambio?" with antes → después; Esc
 * cancels. A ✓ flashes once saved. Needs a ConfirmProvider above.
 */

type Kind = 'text' | 'money' | 'date' | 'select' | 'entity';
import { CanEditCtx } from '@/components/tables/section';
export { CanEditCtx };

// A single click on a cell that also opens something (a project, a profile)
// waits a moment so a double click can edit instead.
let clickTimer: ReturnType<typeof setTimeout> | undefined;
export const delayedClick = (fn: () => void) => () => {
  clearTimeout(clickTimer);
  clickTimer = setTimeout(fn, 240);
};
type Value = string | number | null;

const grp = (s: string) => {
  const [i, d] = s.replace(/[^\d,]/g, '').split(',');
  const int = (i ?? '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return d !== undefined ? `${int},${d.slice(0, 2)}` : int;
};
const toNumber = (s: string) => {
  const t = s.replace(/\./g, '').replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const fmtDateCl = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

export const Editable: React.FC<{
  label: string;
  value: Value;
  kind?: Kind;
  options?: { value: string; label: string }[];
  /** How the value reads in the confirmation. */
  show?: (v: Value) => string;
  /** Returns an error message, or nothing when it worked. */
  onSave: (v: Value) => Promise<string | null | boolean | void>;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  /** kind 'entity': clients / people shown with photo + bold name, and "+ Nuevo …". */
  entities?: Entity[];
  noneLabel?: string;
  newLabel?: string;
  onCreate?: (name: string) => Promise<string | null>;
  /** Read-only (e.g. a locked table): shows the value, no double-click. */
  disabled?: boolean;
  /** Save without the "¿Confirmas el cambio?" step (the caller asks once for several edits). */
  noConfirm?: boolean;
}> = ({ label, value, kind = 'text', options, show, onSave, children, className, required, entities, noneLabel, newLabel, onCreate, disabled, noConfirm }) => {
  const canEdit = useContext(CanEditCtx);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const initialText = () => (value === null || value === undefined ? '' : kind === 'money' ? grp(String(value).replace('.', ',')) : String(value).slice(0, kind === 'date' ? 10 : undefined));
  const begin = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearTimeout(clickTimer);
    setText(initialText());
    if (kind === 'entity') setAnchor(anchorRef.current?.getBoundingClientRect() ?? null);
    setEditing(true);
  };
  useEffect(() => {
    if (!editing) return;
    ref.current?.focus();
    if (kind === 'text' || kind === 'money') ref.current?.select?.();
  }, [editing, kind]);

  const label2 = (v: Value) => {
    if (show) return show(v);
    if (v === null || v === undefined || v === '') return '';
    if (kind === 'date') return fmtDateCl(String(v));
    if (kind === 'select') return options?.find((o) => o.value === v)?.label ?? String(v);
    if (kind === 'entity') return entities?.find((o) => o.id === v)?.name ?? String(v);
    if (kind === 'money') return `$${grp(String(v).replace('.', ','))}`;
    return String(v);
  };

  const commit = async (picked?: string | null) => {
    if (busy.current) return;
    const raw = picked !== undefined ? picked ?? '' : text;
    const next: Value = kind === 'money' ? toNumber(raw) : raw.trim() === '' ? null : raw.trim();
    const same = String(next ?? '') === String(value ?? '').slice(0, kind === 'date' ? 10 : undefined);
    if (same || (required && (next === null || next === ''))) {
      setEditing(false);
      return;
    }
    busy.current = true;
    const ok = noConfirm || await confirm({
      title: '¿Confirmas el cambio?',
      changes: [{ label, before: label2(value), after: label2(next) }],
      confirmLabel: 'Sí, guardar',
      tone: 'primary',
    });
    if (ok) {
      const r = await onSave(next);
      if (typeof r === 'string' && r) {
        await confirm({ title: 'No se pudo guardar', message: r, confirmLabel: 'Entendido', tone: 'primary' });
      } else if (r !== false) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      }
    }
    busy.current = false;
    setEditing(false);
  };

  if (disabled || !canEdit) return <span className={`inline-flex max-w-full items-center ${className ?? ''}`}>{children}</span>;
  if (editing) {
    const cls = 'w-full min-w-[90px] rounded-lg border border-sky-500 bg-zinc-900 px-2 py-1 text-sm text-white focus:outline-none';
    const keys = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setEditing(false);
      }
    };
    if (kind === 'entity')
      return (
        <span ref={anchorRef} className="inline-flex max-w-full">
          {children}
          {anchor && (
            <EntityMenu
              anchor={anchor}
              items={entities ?? []}
              value={(value as string) ?? null}
              noneLabel={required ? undefined : noneLabel ?? 'Sin asignar'}
              newLabel={newLabel}
              onCreate={onCreate}
              onPick={(id) => {
                setAnchor(null);
                commit(id);
              }}
              onClose={() => {
                setAnchor(null);
                setEditing(false);
              }}
            />
          )}
        </span>
      );
    if (kind === 'select')
      return (
        <select ref={ref} className={cls} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => commit()} onKeyDown={keys} onClick={(e) => e.stopPropagation()}>
          {!required && <option value="">{noneLabel ?? '—'}</option>}
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    return (
      <input
        ref={ref}
        className={`${cls} ${kind === 'money' ? 'text-right font-mono' : ''}`}
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'money' ? 'numeric' : undefined}
        value={text}
        onChange={(e) => setText(kind === 'money' ? grp(e.target.value) : e.target.value)}
        onBlur={() => commit()}
        onKeyDown={keys}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      ref={anchorRef}
      // ONE click edits (Emanuel, 2026-10-26). A click on a button / link inside (e.g. a project name that
      // opens the project) does its own thing; that value is edited from the right-click menu (dblclick).
      onClick={(e) => {
        const inner = (e.target as HTMLElement).closest('button, a, input, select, textarea, label');
        if (inner && e.currentTarget.contains(inner)) return;
        begin(e);
      }}
      onDoubleClick={begin}
      data-editable=""
      title={kind === 'entity' ? 'Clic para elegir' : 'Clic para editar'}
      className={`group/ed relative inline-flex max-w-full ${kind === 'entity' ? 'cursor-pointer' : 'cursor-text'} items-center gap-1 rounded-md decoration-dotted underline-offset-4 hover:underline ${className ?? ''}`}
    >
      {children}
      {saved && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="Guardado" />}
    </span>
  );
};

/** Renders its children only where the current role can change things (buttons like Cobrar, Archivar…). */
export const IfCanEdit: React.FC<{ children: React.ReactNode }> = ({ children }) => (useContext(CanEditCtx) ? <>{children}</> : null);
