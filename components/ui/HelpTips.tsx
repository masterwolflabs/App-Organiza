'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * "¿Para qué sirve?" anywhere (Emanuel, 2026-10-26; mantener presionado 2 s con dedo o mouse: 2026-11-12): resting the cursor 2 s on any element with
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
    // Mantener presionado 2 s (dedo o mouse) sobre algo con ayuda la muestra (Daily ayuda-en-cada-campo,
    // 2026-11-12). Al soltar, ese toque no activa el botón. En el celular se va sola a los 6 s.
    let press: { t: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
    let swallow = false;
    let away: ReturnType<typeof setTimeout> | undefined;
    const onDown = (e: PointerEvent) => {
      if (press) clearTimeout(press.t);
      press = null;
      const el = (e.target as Element | null)?.closest?.('[data-help]') as HTMLElement | null;
      if (!el?.dataset.help) return;
      const x = e.clientX;
      const y = e.clientY;
      press = {
        x,
        y,
        t: setTimeout(() => {
          press = null;
          swallow = true;
          if (e.pointerType !== 'mouse') navigator.vibrate?.(10);
          setTip({ x, y, title: el.dataset.helpTitle ?? '', text: el.dataset.help ?? '' });
          clearTimeout(away);
          if (e.pointerType !== 'mouse') away = setTimeout(() => setTip(null), 6000);
        }, 2000),
      };
    };
    const onPMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
        clearTimeout(press.t);
        press = null;
      }
    };
    const onUp = () => {
      if (press) clearTimeout(press.t);
      press = null;
    };
    const onClick = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onCtx = (e: Event) => {
      if (press || swallow) e.preventDefault();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onPMove, { passive: true });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('contextmenu', onCtx, true);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('mouseleave', hide);
    return () => {
      clearTimeout(timer.current);
      if (press) clearTimeout(press.t);
      clearTimeout(away);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onPMove);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('contextmenu', onCtx, true);
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
