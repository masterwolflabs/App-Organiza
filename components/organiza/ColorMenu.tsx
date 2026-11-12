'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';

/**
 * Pintar una acción del Horario (Emanuel, 2026-11-12): clic derecho en la tarjeta (o mantener 2 s en el
 * celular) → color de FONDO (clarito pero notorio) y color de BORDE. Sirve para marcar lo que está claro,
 * lo que no y lo que hoy no se va a aclarar. Colores de un toque + cualquier color (RGB). Se guarda al tiro.
 */
export const SWATCHES = ['#facc15', '#4ade80', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c', '#f87171', '#94a3b8'];

/** Fondo de la tarjeta: el color encima del gris, transparente (se lee igual en tema claro y oscuro). */
export const tintCss = (bg?: string | null, border?: string | null): React.CSSProperties => ({
  ...(bg ? { backgroundImage: `linear-gradient(${bg}47, ${bg}47)` } : {}),
  ...(border ? { boxShadow: `0 0 0 2px ${border}` } : {}),
});

const Row: React.FC<{ title: string; value?: string | null; onPick: (c: string | null) => void }> = ({ title, value, onPick }) => (
  <div className="space-y-1.5">
    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{title}</p>
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} aria-label={`Color ${c}`} className={`h-7 w-7 rounded-full ring-2 transition hover:scale-110 ${value?.toLowerCase() === c ? 'ring-white' : 'ring-transparent'}`} style={{ background: c }} />
      ))}
      {/* Cualquier color (RGB). */}
      <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-2 ring-white/20 hover:scale-110" data-help="Elegir cualquier color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
        <input type="color" value={value || '#38bdf8'} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <button type="button" onClick={() => onPick(null)} disabled={!value} className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30">
        Sin color
      </button>
    </div>
  </div>
);

export const ColorMenu: React.FC<{ x: number; y: number; title: string; bg?: string | null; border?: string | null; onChange: (p: { bg_color?: string | null; border_color?: string | null }) => void; onClose: () => void }> = ({ x, y, title, bg, border, onChange, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Un tick después: el mismo clic que abrió el menú no lo cierra.
    const t = setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const W = 300;
  const left = typeof window === 'undefined' ? x : Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = typeof window === 'undefined' ? y : Math.max(8, Math.min(y, window.innerHeight - 230));
  return (
    <BodyPortal lockScroll={false}>
      <div ref={ref} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }} className="fixed z-[90] space-y-3 rounded-2xl bg-[#14171d]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur" style={{ left, top, width: W }}>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">🎨 {title}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Row title="Fondo" value={bg} onPick={(c) => onChange({ bg_color: c })} />
        <Row title="Borde" value={border} onPick={(c) => onChange({ border_color: c })} />
      </div>
    </BodyPortal>
  );
};
