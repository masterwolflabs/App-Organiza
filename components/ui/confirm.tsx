'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Pencil } from 'lucide-react';

/**
 * Confirmations for Finanzas de empresa / Master Cloud (Emanuel, 2026-10-15):
 * every delete and every saved edit asks first, in the app's own window (no
 * browser confirm()). `const confirm = useConfirm(); if (!(await confirm({...}))) return;`
 * `changes` shows a before → after list (see `diffRows`). With `input`, the
 * promise resolves to the typed text (or null when cancelled).
 */

export type Change = { label: string; before: string; after: string };
type Options = {
  title: string;
  message?: React.ReactNode;
  changes?: Change[];
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  input?: { label: string; placeholder?: string };
};
type Pending = Options & { resolve: (v: boolean | string | null) => void };

const Ctx = createContext<((o: Options) => Promise<boolean | string | null>) | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const ask = useCallback((o: Options) => new Promise<boolean | string | null>((resolve) => {
    setText('');
    setPending({ ...o, resolve });
  }), []);
  const close = (v: boolean | string | null) => {
    pending?.resolve(v);
    setPending(null);
  };
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending) return;
    if (!pending.input) okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(pending.input ? null : false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const danger = pending?.tone === 'danger';
  return (
    <Ctx.Provider value={ask}>
      {children}
      {pending &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={() => close(pending.input ? null : false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11151c] p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'}`}>
                  {danger ? <AlertTriangle className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white">{pending.title}</h3>
                  {pending.message && <div className="mt-1 text-sm text-zinc-400">{pending.message}</div>}
                </div>
              </div>
              {pending.changes && pending.changes.length > 0 && (
                <div className="mf-noscroll mt-4 max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-white/[0.08] p-3 text-xs">
                  {pending.changes.map((c) => (
                    <div key={c.label} className="grid grid-cols-[110px_1fr] items-start gap-2">
                      <span className="text-zinc-500">{c.label}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-zinc-500 line-through">{c.before || '—'}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-zinc-500" />
                        <span className="font-semibold text-white">{c.after || '—'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {pending.input && (
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-medium text-zinc-400">{pending.input.label}</span>
                  <input
                    autoFocus
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
                    value={text}
                    placeholder={pending.input.placeholder}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && close(text)}
                  />
                </label>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => close(pending.input ? null : false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.06]">
                  Cancelar
                </button>
                <button
                  ref={okRef}
                  type="button"
                  onClick={() => close(pending.input ? text : true)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'}`}
                >
                  {pending.confirmLabel ?? (danger ? 'Borrar' : 'Confirmar')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
};

/** Returns ask(): resolves true/false (or the typed text / null with `input`). Falls back to window.confirm outside a provider. */
export function useConfirm() {
  const ask = useContext(Ctx);
  return useCallback(
    async (o: Options): Promise<boolean> => {
      if (ask) return (await ask(o)) === true;
      return window.confirm(o.title);
    },
    [ask],
  );
}
/** Same window with a text field: resolves the text, or null if cancelled. */
export function useAsk() {
  const ask = useContext(Ctx);
  return useCallback(
    async (o: Options & { input: NonNullable<Options['input']> }): Promise<string | null> => {
      if (ask) {
        const v = await ask(o);
        return typeof v === 'string' ? v : null;
      }
      return window.prompt(o.title);
    },
    [ask],
  );
}

/** Before → after rows for the fields that actually changed. */
export function diffRows(fields: { label: string; before: unknown; after: unknown; show?: (v: unknown) => string }[]): Change[] {
  const str = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  return fields
    .filter((f) => str(f.before) !== str(f.after))
    .map((f) => ({ label: f.label, before: f.show ? f.show(f.before) : str(f.before), after: f.show ? f.show(f.after) : str(f.after) }));
}

/** For edit forms: asks "¿Guardar cambios?" with the diff; true when there's nothing to confirm. */
export function useConfirmChanges() {
  const confirm = useConfirm();
  return useCallback(
    async (title: string, changes: Change[]) => {
      if (!changes.length) return true;
      return confirm({ title, message: 'Revisa lo que cambia antes de guardar.', changes, confirmLabel: 'Guardar cambios', tone: 'primary' });
    },
    [confirm],
  );
}
