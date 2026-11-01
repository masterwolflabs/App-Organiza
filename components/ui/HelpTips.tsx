'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * "¿Para qué sirve?" anywhere (Emanuel, 2026-10-26): resting the cursor 2 s on any element with
 * `data-help="…"` (and optional `data-help-title`) shows a small "negative" box — the same one the
 * table columns use. Mounted once in app/page.tsx. Add `data-help` to anything that needs explaining.
 */
export const HelpTips: React.FC = () => {
  const [tip, setTip] = useState<{ x: number; y: number; title: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cur = useRef<{ el: Element | null; x: number; y: number }>({ el: null, x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-help]') ?? null;
      const moved = Math.abs(e.clientX - cur.current.x) + Math.abs(e.clientY - cur.current.y) > 6;
      if (el === cur.current.el && !moved) return;
      cur.current = { el, x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      setTip(null);
      if (!el) return;
      timer.current = setTimeout(() => {
        const h = el as HTMLElement;
        setTip({ x: cur.current.x, y: cur.current.y, title: h.dataset.helpTitle ?? '', text: h.dataset.help ?? '' });
      }, 2000);
    };
    const hide = () => {
      clearTimeout(timer.current);
      cur.current.el = null;
      setTip(null);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('mouseleave', hide);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
      document.removeEventListener('mouseleave', hide);
    };
  }, []);
  if (!tip || !tip.text) return null;
  return createPortal(
    <div role="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.min(tip.y + 18, window.innerHeight - 120) }} className="mf-negative pointer-events-none fixed z-[96] w-max max-w-[280px] rounded-xl px-3 py-2 text-xs leading-snug shadow-2xl">
      {tip.title && <p className="font-bold">{tip.title}</p>}
      <p className={tip.title ? 'mt-0.5 opacity-80' : ''}>{tip.text}</p>
    </div>,
    document.body,
  );
};
