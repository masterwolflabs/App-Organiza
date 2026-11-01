'use client';

import React, { useEffect, useRef, useState } from 'react';
import { NoteColor } from '@/types/notes';
import { COLOR_KEYS, NOTE_COLORS } from '@/utils/notes';
import { Check, Plus, Tag } from 'lucide-react';

/** Anchored dropdown that closes on outside click / Escape. */
export const Popover: React.FC<{
  open: boolean;
  onClose: () => void;
  anchor: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  up?: boolean;
}> = ({ open, onClose, anchor, children, align = 'right', width = 'w-56', up }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {anchor}
      {open && (
        <div
          className={`absolute z-[80] ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${align === 'right' ? 'right-0' : 'left-0'} ${width} overflow-hidden rounded-xl border border-white/10 bg-[#16171c] py-1 text-zinc-200 shadow-2xl shadow-black/60`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const MenuItem: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}> = ({ icon: Icon, label, onClick, danger, disabled, hint }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors disabled:opacity-40 ${
      danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-zinc-300 hover:bg-white/5'
    }`}
  >
    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
    <span className="flex-1">{label}</span>
    {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
  </button>
);

export const MenuDivider = () => <div className="my-1 h-px bg-white/5" />;

export const ColorSwatches: React.FC<{ value: NoteColor; onChange: (c: NoteColor) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
    {COLOR_KEYS.map((key) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        title={NOTE_COLORS[key].label}
        aria-label={`Color ${NOTE_COLORS[key].label}`}
        className={`h-5 w-5 rounded-full ${NOTE_COLORS[key].swatch} ${
          value === key ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#16171c]' : 'opacity-80 hover:opacity-100'
        }`}
      />
    ))}
  </div>
);

/** Category list with "Sin categoría" and inline "Nueva categoría". */
export const CategoryList: React.FC<{
  categories: string[];
  value: string | null;
  onPick: (category: string | null) => void;
  onAdd?: (name: string) => void;
}> = ({ categories, value, onPick, onAdd }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    onAdd?.(clean);
    onPick(clean);
    setName('');
    setAdding(false);
  };
  return (
    <div className="max-h-72 overflow-y-auto">
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Categoría</p>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-zinc-400 hover:bg-white/5"
      >
        <span className="flex-1">Sin categoría</span>
        {!value && <Check className="h-3.5 w-3.5 text-sky-400" />}
      </button>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5"
        >
          <Tag className="h-3 w-3 text-zinc-500" />
          <span className="flex-1 truncate">{c}</span>
          {value === c && <Check className="h-3.5 w-3.5 text-sky-400" />}
        </button>
      ))}
      {onAdd &&
        (adding ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Nombre"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
            />
            <button type="button" onClick={submit} className="rounded-lg bg-sky-600 px-2 py-1.5 text-[11px] font-semibold text-white">
              Crear
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-sky-400 hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva categoría
          </button>
        ))}
    </div>
  );
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

const PEER_COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600'];
export function peerColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PEER_COLORS[Math.abs(h) % PEER_COLORS.length];
}
