'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Ban, Pipette } from 'lucide-react';

// Text color for the selected text in a note (TipTap TextStyle + Color).
// A wide palette (grays + 17 hues × 4 shades, readable on the pastel post-its
// and on the dark movement notes), "Recientes" and a custom color picker.
// The panel is position: fixed under the button because the toolbar scrolls
// horizontally (an absolute dropdown inside it would be clipped).

const HUES: { name: string; shades: string[] }[] = [
  { name: 'Rojo', shades: ['#7f1d1d', '#b91c1c', '#dc2626', '#f87171'] },
  { name: 'Naranjo', shades: ['#7c2d12', '#c2410c', '#ea580c', '#fb923c'] },
  { name: 'Ámbar', shades: ['#78350f', '#b45309', '#d97706', '#fbbf24'] },
  { name: 'Amarillo', shades: ['#713f12', '#a16207', '#ca8a04', '#facc15'] },
  { name: 'Lima', shades: ['#365314', '#4d7c0f', '#65a30d', '#a3e635'] },
  { name: 'Verde', shades: ['#14532d', '#15803d', '#16a34a', '#4ade80'] },
  { name: 'Esmeralda', shades: ['#064e3b', '#047857', '#059669', '#34d399'] },
  { name: 'Turquesa', shades: ['#134e4a', '#0f766e', '#0d9488', '#2dd4bf'] },
  { name: 'Cian', shades: ['#164e63', '#0e7490', '#0891b2', '#22d3ee'] },
  { name: 'Celeste', shades: ['#0c4a6e', '#0369a1', '#0284c7', '#38bdf8'] },
  { name: 'Azul', shades: ['#1e3a8a', '#1d4ed8', '#2563eb', '#60a5fa'] },
  { name: 'Índigo', shades: ['#312e81', '#4338ca', '#4f46e5', '#818cf8'] },
  { name: 'Violeta', shades: ['#4c1d95', '#6d28d9', '#7c3aed', '#a78bfa'] },
  { name: 'Morado', shades: ['#581c87', '#7e22ce', '#9333ea', '#c084fc'] },
  { name: 'Fucsia', shades: ['#701a75', '#a21caf', '#c026d3', '#e879f9'] },
  { name: 'Rosado', shades: ['#831843', '#be185d', '#db2777', '#f472b6'] },
  { name: 'Café', shades: ['#422006', '#78350f', '#92400e', '#b45309'] },
];
const GRAYS = ['#000000', '#27272a', '#52525b', '#a1a1aa', '#ffffff'];
const RECENT_KEY = 'mf-note-recent-colors';

const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8);
  } catch {
    return [];
  }
};

export const TextColorPicker: React.FC<{ editor: Editor | null; current?: string | null }> = ({ editor, current }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const WIDTH = 272;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const apply = (color: string | null, keepOpen = false) => {
    if (!editor) return;
    if (color) {
      editor.chain().focus().setColor(color).run();
      const next = [color, ...readRecent().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      setRecent(next);
    } else {
      editor.chain().focus().unsetColor().run();
    }
    if (!keepOpen) setOpen(false);
  };

  const Swatch = ({ c, label }: { c: string; label?: string }) => (
    <button
      type="button"
      title={label ?? c}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => apply(c)}
      className={`h-5 w-5 rounded-md ring-1 ring-black/15 transition-transform hover:scale-125 ${current?.toLowerCase() === c.toLowerCase() ? 'outline outline-2 outline-offset-1 outline-sky-500' : ''}`}
      style={{ backgroundColor: c }}
    />
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Color del texto"
        aria-label="Color del texto"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg transition-colors ${open ? 'bg-black/10' : 'hover:bg-black/10'}`}
      >
        <span className="text-[15px] font-bold leading-none text-zinc-900/80">A</span>
        <span className="mt-0.5 h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: current || 'linear-gradient(90deg,#dc2626,#ca8a04,#16a34a,#2563eb,#9333ea)' }} />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          onMouseDown={(e) => {
            // Keep the text selection in the editor while picking (except the native color input).
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
          }}
          className="fixed z-[90] rounded-2xl border border-white/10 bg-[#16171c] p-3 shadow-2xl shadow-black/60"
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
        >
          <p className="mb-2 text-[11px] font-medium text-zinc-400">Color del texto seleccionado</p>

          <button
            type="button"
            onClick={() => apply(null)}
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5"
          >
            <Ban className="h-3.5 w-3.5 text-zinc-500" /> Automático (quitar color)
          </button>

          {recent.length > 0 && (
            <>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Recientes</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {recent.map((c) => (
                  <Swatch key={`r-${c}`} c={c} />
                ))}
              </div>
            </>
          )}

          <div className="mb-2 flex gap-1.5">
            {GRAYS.map((c) => (
              <Swatch key={c} c={c} label={c === '#000000' ? 'Negro' : c === '#ffffff' ? 'Blanco' : 'Gris'} />
            ))}
          </div>
          {/* Columns = hues, rows = dark → light */}
          <div className="grid grid-flow-col grid-rows-4 gap-1.5" style={{ gridTemplateColumns: 'repeat(9, 1.25rem)' }}>
            {HUES.slice(0, 9).flatMap((h) => h.shades.map((c) => <Swatch key={c + h.name} c={c} label={h.name} />))}
          </div>
          <div className="mt-1.5 grid grid-flow-col grid-rows-4 gap-1.5" style={{ gridTemplateColumns: 'repeat(8, 1.25rem)' }}>
            {HUES.slice(9).flatMap((h) => h.shades.map((c) => <Swatch key={c + h.name} c={c} label={h.name} />))}
          </div>

          <button
            type="button"
            onClick={() => customRef.current?.click()}
            className="mt-2.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5"
          >
            <Pipette className="h-3.5 w-3.5 text-zinc-500" /> Otro color…
          </button>
          <input
            ref={customRef}
            type="color"
            className="sr-only"
            defaultValue={current || '#2563eb'}
            onChange={(e) => apply(e.target.value, true)}
          />
        </div>
      )}
    </>
  );
};
