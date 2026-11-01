'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, ArrowLeftRight, Check, Maximize2, Monitor, PanelLeft, PanelRight, X } from 'lucide-react';

type WinMode = 'flotante' | 'lateral' | 'lateral-izq' | 'completa';
const WIN_MODES: { key: WinMode; label: string; icon: React.ReactNode }[] = [
  { key: 'lateral', label: 'Ventana lateral derecha', icon: <PanelRight className="h-4 w-4" /> },
  { key: 'lateral-izq', label: 'Ventana lateral izquierda', icon: <PanelLeft className="h-4 w-4" /> },
  { key: 'flotante', label: 'Ventana flotante', icon: <AppWindow className="h-4 w-4" /> },
  { key: 'completa', label: 'Página completa', icon: <Monitor className="h-4 w-4" /> },
];

/**
 * Dialog rendered in a portal (a glass section's backdrop-filter would trap a
 * fixed overlay). `size` xl = big window like an account's folder; `z` lets a
 * detail window sit under the dialogs opened from it.
 * Like Notion (Emanuel, 2026-10-21): next to the X you pick Ventana lateral /
 * flotante / Página completa (+ a quick maximize). The floating window moves by
 * its header and resizes from the corner; the side one from its left edge.
 * Closing and reopening starts again in the default (floating, centered).
 * The side window can sit on the right or the left (Moisés, 2026-10-25).
 */
export const Modal: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; size?: 'xl'; footer?: React.ReactNode; z?: number; headerExtra?: React.ReactNode }> = ({ title, subtitle, onClose, children, wide, size, footer, z = 75, headerExtra }) => {
  const [mode, setMode] = useState<WinMode>('flotante');
  const [menu, setMenu] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [sideW, setSideW] = useState(620);
  const box = useRef<HTMLDivElement>(null);
  const side = mode === 'lateral' || mode === 'lateral-izq';
  const left = mode === 'lateral-izq';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Lateral pushes the page aside (like Notion) instead of covering its right part.
  useEffect(() => {
    if (!side || window.innerWidth < 640) return;
    const prop = left ? 'paddingLeft' : 'paddingRight';
    const prev = document.body.style[prop];
    document.body.style[prop] = `${Math.min(sideW, window.innerWidth - 40)}px`;
    return () => {
      document.body.style[prop] = prev;
    };
  }, [side, left, sideW]);
  if (typeof document === 'undefined') return null;

  const current = () => {
    if (rect) return rect;
    const r = box.current!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  // Pointer drag helper: calls `move(dx, dy)` until the button is released.
  const drag = (e: React.PointerEvent, move: (dx: number, dy: number) => void) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => move(ev.clientX - sx, ev.clientY - sy);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const startMove = (e: React.PointerEvent) => {
    if (mode !== 'flotante' || (e.target as HTMLElement).closest('button')) return;
    const r0 = current();
    drag(e, (dx, dy) => setRect({ ...r0, x: Math.min(Math.max(r0.x + dx, -r0.w + 120), window.innerWidth - 120), y: Math.min(Math.max(r0.y + dy, 0), window.innerHeight - 60) }));
  };
  const startResize = (e: React.PointerEvent) => {
    const r0 = current();
    drag(e, (dx, dy) => setRect({ ...r0, w: Math.max(360, r0.w + dx), h: Math.max(240, r0.h + dy) }));
  };
  const startSide = (e: React.PointerEvent) => {
    const w0 = sideW;
    drag(e, (dx) => setSideW(Math.min(Math.max(360, left ? w0 + dx : w0 - dx), window.innerWidth - 40)));
  };
  const pick = (m: WinMode) => {
    setMode(m);
    setMenu(false);
    if (m === 'flotante') setRect(null);
  };

  const maxW = size === 'xl' ? 'max-w-6xl' : wide ? 'max-w-4xl' : 'max-w-lg';
  const shell =
    mode === 'completa'
      ? 'fixed inset-0 rounded-none'
      : mode === 'lateral'
        ? 'fixed inset-y-0 right-0 rounded-none border-y-0 border-r-0 sm:rounded-l-3xl'
        : mode === 'lateral-izq'
          ? 'fixed inset-y-0 left-0 rounded-none border-y-0 border-l-0 sm:rounded-r-3xl'
        : rect
          ? 'fixed rounded-3xl'
          : `relative max-h-[92vh] w-full rounded-t-3xl sm:rounded-3xl ${maxW}`;
  const style: React.CSSProperties =
    side ? { width: `min(${sideW}px, 100vw)` } : mode === 'flotante' && rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : {};
  const ModeIcon = WIN_MODES.find((m) => m.key === mode)!.icon;

  return createPortal(
  // Lateral = like Notion's side peek: no dark layer, the page on the left stays usable (clicks pass through).
  <div style={{ zIndex: z }} className={`fixed inset-0 flex items-end justify-center sm:items-center sm:p-4 ${side ? 'pointer-events-none' : mode === 'completa' ? '' : 'bg-black/70'}`} onClick={side ? undefined : onClose}>
    <div ref={box} onClick={(e) => e.stopPropagation()} style={style} className={`pointer-events-auto flex flex-col border border-white/10 bg-[#11151c] shadow-2xl ${shell}`}>
      {side && <div onPointerDown={startSide} title="Arrastra para cambiar el ancho" className={`absolute inset-y-0 ${left ? 'right-0' : 'left-0'} z-10 hidden w-1.5 cursor-col-resize hover:bg-sky-500/40 sm:block`} />}
      <div onPointerDown={startMove} className={`flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4 ${mode === 'flotante' ? 'sm:cursor-move' : ''}`}>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {headerExtra && <div className="ml-auto flex shrink-0 items-center gap-2">{headerExtra}</div>}
        <div className={`relative hidden shrink-0 items-center gap-0.5 sm:flex ${headerExtra ? '' : 'ml-auto'}`}>
          <button type="button" onClick={() => pick(mode === 'completa' ? 'flotante' : 'completa')} title={mode === 'completa' ? 'Achicar a ventana' : 'Agrandar a página completa'} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            {mode === 'completa' ? <AppWindow className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          {side && (
            <button type="button" onClick={() => pick(left ? 'lateral' : 'lateral-izq')} title={left ? 'Pasar al lado derecho' : 'Pasar al lado izquierdo'} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => setMenu((v) => !v)} title="Cómo ver esta ventana" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            {ModeIcon}
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-20 w-52 rounded-2xl border border-white/10 bg-[#161b24] p-1 shadow-2xl">
              {WIN_MODES.map((m) => (
                <button key={m.key} type="button" onClick={() => pick(m.key)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
                  <span className="text-zinc-400">{m.icon}</span>
                  <span className="flex-1">{m.label}</span>
                  {mode === m.key && <Check className="h-4 w-4 text-sky-400" />}
                </button>
              ))}
            </div>
          )}
          <span className="mx-1 h-4 w-px bg-white/10" />
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className={`rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white ${headerExtra ? '' : 'sm:ml-0'}`}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mf-noscroll flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 py-3">{footer}</div>}
      {mode === 'flotante' && (
        <div onPointerDown={startResize} title="Arrastra para agrandar o achicar" className="absolute bottom-0 right-0 hidden h-5 w-5 cursor-se-resize sm:block">
          <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-br-md border-b-2 border-r-2 border-zinc-500" />
        </div>
      )}
    </div>
  </div>,
  document.body,
  );
};

