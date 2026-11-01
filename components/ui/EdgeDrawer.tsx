'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * A left menu that HIDES on desktop and comes back when the mouse rests on the left edge of the
 * window (or on the small handle there), like Finance's main menu (Emanuel, 2026-10-27: "de fácil
 * aparición y fácil desaparición"). It goes away when the mouse leaves it or after picking an
 * option. On phones nothing changes: the menu renders in place with `className`.
 */
export const EdgeDrawer: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // The mouse moved well past the menu → it goes away (more reliable than mouseleave alone).
    const onMove = (e: MouseEvent) => {
      const right = asideRef.current?.getBoundingClientRect().right ?? 0;
      if (e.clientX > right + 24) later(() => setOpen(false), 200);
      else if (e.clientX <= right) clearTimeout(timer.current);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  }, [open]);

  return (
    <>
      {/* Hot edge + handle (desktop only): rest the mouse there, or click the handle. */}
      <div aria-hidden className="fixed inset-y-0 left-0 z-[69] hidden w-2 md:block" onMouseEnter={() => later(() => setOpen(true), 180)} onMouseLeave={() => clearTimeout(timer.current)} />
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onMouseEnter={() => later(() => setOpen(true), 180)}
          onMouseLeave={() => clearTimeout(timer.current)}
          aria-label="Abrir menú"
          className="fixed left-0 top-1/2 z-[69] hidden h-16 w-2.5 -translate-y-1/2 rounded-r-full bg-white/15 transition hover:w-3.5 hover:bg-sky-400/60 md:block"
        />
      )}
      <aside
        ref={asideRef}
        onMouseEnter={() => clearTimeout(timer.current)}
        onMouseLeave={() => later(() => setOpen(false), 250)}
        onClickCapture={(e) => (e.target as HTMLElement).closest('button, a') && later(() => setOpen(false), 120)}
        className={`${className} md:fixed md:inset-y-0 md:left-0 md:z-[70] md:overflow-y-auto md:border-r md:border-zinc-800 md:bg-[#0c0c0f] md:shadow-2xl md:shadow-black/60 md:transition-transform md:duration-200 ${open ? 'md:translate-x-0' : 'md:-translate-x-full'}`}
      >
        {children}
      </aside>
    </>
  );
};
