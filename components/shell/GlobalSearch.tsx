'use client';

import { APP } from '@/app.config';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { SearchGroup, SearchItem, searchAll } from '@/utils/globalSearch';

/**
 * Topbar search over the whole app (see utils/globalSearch.ts). Desktop: the
 * input opens a results panel under it; phones: a search icon opens the same
 * search full screen. ⌘K / Ctrl+K focuses it from anywhere; ↑ ↓ Enter Esc.
 */
export const GlobalSearch: React.FC<{
  /** Everything searchable — called while the panel is open. */
  getItems: () => SearchItem[];
  /** Shown before typing. */
  quick: SearchItem[];
}> = ({ getItems, quick }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const groups: SearchGroup[] = useMemo(() => {
    if (!open && !mobile) return [];
    if (!q.trim()) return quick.length ? [{ kind: 'accion', label: 'Accesos rápidos', items: quick }] : [];
    return searchAll(getItems(), q);
    // getItems changes every render of the page; recompute on query / open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, mobile, quick]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [q]);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) {
          inputRef.current?.focus();
          setOpen(true);
        } else setMobile(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click outside closes the desktop panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (mobile) setTimeout(() => mobileInputRef.current?.focus(), 30);
  }, [mobile]);

  const close = () => {
    setOpen(false);
    setMobile(false);
    setQ('');
    inputRef.current?.blur();
  };
  const choose = (item: SearchItem) => {
    close();
    item.run();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      const item = flat[active];
      if (item) choose(item);
    } else if (e.key === 'Escape') close();
  };

  const results = (
    <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain p-2">
      {groups.length === 0 && q.trim() && (
        <p className="px-3 py-8 text-center text-sm text-zinc-500">
          Nada para “{q.trim()}”. Prueba con otra palabra o un monto (ej. 17.000).
        </p>
      )}
      {groups.map((g) => (
        <div key={g.kind + g.label} className="mb-1">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
          {g.items.map((item) => {
            const idx = flat.indexOf(item);
            const on = idx === active;
            return (
              <button
                key={item.kind + item.id}
                type="button"
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${on ? 'bg-sky-500/15' : 'hover:bg-white/[0.04]'}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-base">{item.icon ?? '•'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-xs text-zinc-500">{item.subtitle}</span>}
                </span>
                {item.amount !== undefined && item.kind !== 'accion' && (
                  <span className="shrink-0 font-mono text-xs font-semibold text-zinc-300">{item.amount.toLocaleString('es-CL')}</span>
                )}
                {on && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-sky-300" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div ref={boxRef} className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={`Buscar en ${APP.name}…`}
          aria-label="Buscar en toda la app"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-2.5 pl-10 pr-14 text-sm text-white placeholder:text-zinc-500 transition-colors focus:border-sky-500/50 focus:bg-zinc-900 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">⌘K</kbd>
        {open && (groups.length > 0 || q.trim()) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 min-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#11151c]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
            {results}
            <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2 text-[11px] text-zinc-500">
              <span>↑ ↓ para moverte</span>
              <span>Enter para abrir</span>
              <span>Esc para cerrar</span>
            </div>
          </div>
        )}
      </div>

      {/* Phone */}
      <button type="button" onClick={() => setMobile(true)} aria-label="Buscar" className="shrink-0 rounded-xl p-2 text-zinc-400 hover:text-white md:hidden">
        <Search className="h-5 w-5" />
      </button>
      {/* Portal: the header (backdrop-blur, sliding wrapper) would trap a fixed overlay inside it. */}
      {mobile && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0d12]/98 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                ref={mobileInputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Buscar en ${APP.name}…`}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-3 text-base text-white placeholder:text-zinc-500 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <button type="button" onClick={close} aria-label="Cerrar" className="rounded-xl p-2 text-zinc-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{results}</div>
        </div>,
        document.body,
      )}
    </>
  );
};
