'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ExternalLink, Loader2, Plus, Search } from 'lucide-react';
import { McAvatar } from '@/components/calendar/McAvatar';

/**
 * Picker for a client or a person (Moisés, 2026-10-18 — "como Notion, pero más
 * lindo"): every option is the circular photo + the name in bold, there's a
 * search box and "+ Nuevo …" right at the top, so a new client / closer /
 * trabajador / socio is created on the spot without going to Master Cloud.
 */
export type Entity = { id: string; name: string; avatar_url?: string | null; sub?: string | null };

/** The chosen value as it reads in a field / cell: photo + bold name. */
export const EntityChip: React.FC<{ entity?: Entity | null; placeholder?: string; size?: number }> = ({ entity, placeholder = '—', size = 24 }) =>
  entity ? (
    <span className="inline-flex min-w-0 items-center gap-2">
      <McAvatar name={entity.name} url={entity.avatar_url} size={size} />
      <span className="truncate font-semibold text-white">{entity.name}</span>
    </span>
  ) : (
    <span className="text-zinc-500">{placeholder}</span>
  );

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type MenuProps = {
  anchor: DOMRect;
  items: Entity[];
  value: string | null;
  /** Several people at once (e.g. a Daily task's Ejecutor): checks on each; the caller toggles on pick and keeps it open. */
  values?: string[];
  onPick: (id: string | null) => void;
  onClose: () => void;
  /** "Sin cliente" etc.; omit to not allow empty. */
  noneLabel?: string;
  /** "Nuevo cliente" etc. With onCreate, the "+" row appears. */
  newLabel?: string;
  onCreate?: (name: string) => Promise<string | null>;
  /** Top button that opens the directory in a new tab ("Closers ↗"). Default: guessed from newLabel. */
  directory?: { label: string; tab: string } | null;
};

/**
 * Where each kind of person lives (Emanuel, 2026-10-21): for now Master Cloud,
 * later the CRM / recursos humanos app. Guessed from "Nuevo closer", "Nuevo cliente"…
 */
export function directoryFor(newLabel?: string): { label: string; tab: string } | null {
  const k = (newLabel ?? '').toLowerCase();
  if (k.includes('cliente')) return { label: 'Clientes', tab: 'clientes' };
  if (k.includes('closer')) return { label: 'Closers', tab: 'vendedores' };
  if (k.includes('setter')) return { label: 'Setters', tab: 'vendedores' };
  if (k.includes('socio')) return { label: 'Socios', tab: 'personal' };
  if (k.includes('colaborador') || k.includes('trabajador')) return { label: 'Colaboradores', tab: 'trabajadores' };
  return k ? { label: 'Personas', tab: 'personal' } : null;
}
// The directory lives in Recursos humanos (/equipo), wherever the menu is opened (Empresa, Mente Maestra…).
export const directoryHref = (tab: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/equipo#master-cloud/${tab}`;

/** The floating list (portal: glass sections trap fixed overlays). */
export const EntityMenu: React.FC<MenuProps> = ({ anchor, items, value, values, onPick, onClose, noneLabel, newLabel = 'Nuevo', onCreate, directory }) => {
  const dir = directory === undefined ? directoryFor(newLabel) : directory;
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number }>({ left: anchor.left, top: anchor.bottom + 6, width: Math.max(260, anchor.width), maxH: 360 });

  useLayoutEffect(() => {
    const width = Math.max(260, Math.min(380, anchor.width));
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const below = window.innerHeight - anchor.bottom - 16;
    const above = anchor.top - 16;
    const up = below < 280 && above > below;
    const maxH = Math.min(380, up ? above : below);
    setPos({ left, width, maxH, top: up ? anchor.top - 6 - Math.min(maxH, box.current?.offsetHeight ?? maxH) : anchor.bottom + 6 });
  }, [anchor, q, creating]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (creating !== null) setCreating(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, creating]);

  const shown = items.filter((x) => !q || norm(`${x.name} ${x.sub ?? ''}`).includes(norm(q)));
  const exact = items.some((x) => norm(x.name) === norm(q));
  // Keyboard order: [none] + matches.
  const rows: (string | null)[] = [...(noneLabel && !q ? [null] : []), ...shown.map((x) => x.id)];

  const create = async (name: string) => {
    if (!onCreate || !name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const id = await onCreate(name.trim());
    setBusy(false);
    if (!id) return setErr('No se pudo crear. Intenta de nuevo.');
    onPick(id);
  };

  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm';
  return createPortal(
    <>
      <div className="fixed inset-0 z-[95]" onMouseDown={onClose} />
      <div
        ref={box}
        role="listbox"
        style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
        className="mf-noscroll fixed z-[96] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#151922] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {dir && (
          // A real <a>: window.open after a click can be popup-blocked (see CLAUDE.md).
          <a
            href={directoryHref(dir.tab)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            title={`Abrir ${dir.label} en Master Cloud (nueva pestaña)`}
            className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:bg-white/[0.04] hover:text-white"
          >
            {dir.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (rows.length) onPick(rows[active] ?? null);
                else if (onCreate && q.trim()) create(q);
              }
            }}
            placeholder="Buscar…"
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        <div className="mf-noscroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {onCreate &&
            (creating !== null ? (
              <div className="mb-1 flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
                <Plus className="h-4 w-4 shrink-0 text-sky-300" />
                <input
                  autoFocus
                  value={creating}
                  onChange={(e) => setCreating(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      create(creating);
                    }
                  }}
                  placeholder="Nombre"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-zinc-500 focus:outline-none"
                />
                <button type="button" disabled={!creating.trim() || busy} onClick={() => create(creating)} className="rounded-md bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Crear'}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => (q.trim() && !exact ? create(q) : setCreating(q))} className={`${row} mb-1 font-semibold text-sky-300 hover:bg-sky-500/10`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-sky-400/60">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
                {q.trim() && !exact ? <>Crear “{q.trim()}”</> : newLabel}
              </button>
            ))}
          {err && <p className="px-2 pb-1 text-xs text-rose-300">{err}</p>}
          {noneLabel && !q && (
            <button type="button" onClick={() => onPick(null)} onMouseEnter={() => setActive(0)} className={`${row} text-zinc-400 ${rows[active] === null ? 'bg-white/[0.06]' : 'hover:bg-white/[0.06]'}`}>
              <span className="h-6 w-6 shrink-0 rounded-full border border-white/10" />
              <span className="flex-1">{noneLabel}</span>
              {(values ? !values.length : !value) && <Check className="h-4 w-4 text-sky-300" />}
            </button>
          )}
          {shown.map((x) => {
            const i = rows.indexOf(x.id);
            return (
              <button
                key={x.id}
                type="button"
                role="option"
                aria-selected={values ? values.includes(x.id) : x.id === value}
                onClick={() => onPick(x.id)}
                onMouseEnter={() => setActive(i)}
                className={`${row} ${i === active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.06]'}`}
              >
                <McAvatar name={x.name} url={x.avatar_url} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{x.name}</span>
                  {x.sub && <span className="block truncate text-[11px] text-zinc-500">{x.sub}</span>}
                </span>
                {(values ? values.includes(x.id) : x.id === value) && <Check className="h-4 w-4 shrink-0 text-sky-300" />}
              </button>
            );
          })}
          {!shown.length && q && <p className="px-2 py-2 text-xs text-zinc-500">No hay nadie con “{q}”.</p>}
        </div>
      </div>
    </>,
    document.body,
  );
};

/** A form field: looks like an input, opens the menu. */
export const EntityPicker: React.FC<Omit<MenuProps, 'anchor' | 'onPick' | 'onClose'> & { onChange: (id: string | null) => void; disabled?: boolean; placeholder?: string }> = ({
  value,
  onChange,
  items,
  disabled,
  placeholder,
  ...menu
}) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const chosen = items.find((x) => x.id === value) ?? null;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm focus:border-sky-500 focus:outline-none disabled:opacity-60"
      >
        <EntityChip entity={chosen} placeholder={placeholder ?? menu.noneLabel ?? 'Elegir…'} size={22} />
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
      </button>
      {anchor && (
        <EntityMenu
          {...menu}
          anchor={anchor}
          items={items}
          value={value}
          onPick={(id) => {
            onChange(id);
            setAnchor(null);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
};

const ROLE_LABEL: Record<string, string> = { setter: 'Setter', closer: 'Closer', socio: 'Socio' };
/** Clients / people → picker options (sub = legal name or roles). */
export const toClientEntities = (list: { id: string; name: string; avatar_url?: string | null; legal_name?: string | null; archived_at?: string | null }[], keep?: string | null): Entity[] =>
  list.filter((c) => !c.archived_at || c.id === keep).map((c) => ({ id: c.id, name: c.name, avatar_url: c.avatar_url, sub: c.legal_name && c.legal_name !== c.name ? c.legal_name : null }));
export const toPersonEntities = (list: { id: string; name: string; avatar_url?: string | null; roles: string[]; archived_at?: string | null }[], keep?: (string | null | undefined)[]): Entity[] =>
  list
    .filter((p) => !p.archived_at || (keep ?? []).includes(p.id))
    .map((p) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url, sub: p.roles.length ? p.roles.map((r) => ROLE_LABEL[r] ?? r.charAt(0).toUpperCase() + r.slice(1)).join(' · ') : null }));
