'use client';

import React, { useEffect, useRef } from 'react';

/**
 * The app's ambient light (whole platform, behind every view): three soft
 * lights pinned to the screen corners — top-right and bottom-left large,
 * top-left smaller — that breathe slowly (`.mf-light` in globals.css). While
 * the page scrolls they brighten with the scroll speed and fade back once it
 * stops (`--mf-energy`, 0…1). Glass panels scroll over them, so the frosted
 * blur always shows light moving behind. Fixed + `-z-10`: it sits under all
 * content and above body's background (so its parent must not paint a
 * background). Reduced motion: static, no scroll reaction.
 * Colors: --amb-* in globals.css (follow the accent, or Configuración → Luces).
 */
export const AmbientBackdrop: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let energy = 0;
    let target = 0;
    let raf = 0;

    const tick = () => {
      // Rise quickly toward the scroll speed, decay gently when it stops.
      energy = target > energy ? energy + (target - energy) * 0.25 : energy * 0.94;
      target *= 0.85;
      el.style.setProperty('--mf-energy', energy.toFixed(3));
      raf = energy > 0.005 || target > 0.005 ? requestAnimationFrame(tick) : 0;
      if (!raf) el.style.setProperty('--mf-energy', '0');
    };

    const onScroll = () => {
      const now = performance.now();
      const speed = Math.abs(window.scrollY - lastY) / Math.max(now - lastT, 1); // px per ms
      lastY = window.scrollY;
      lastT = now;
      target = Math.max(target, Math.min(1, speed / 2.5));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="mf-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* top-right, large */}
      <span
        className="mf-light"
        style={{
          top: '-28vh',
          right: '-18vw',
          width: 'min(62vw, 900px)',
          height: 'min(62vw, 900px)',
          background: 'radial-gradient(circle at center, var(--amb-1) 0%, var(--amb-1b) 38%, transparent 68%)',
        }}
      />
      {/* bottom-left, large */}
      <span
        className="mf-light b"
        style={{
          bottom: '-30vh',
          left: '-20vw',
          width: 'min(60vw, 880px)',
          height: 'min(60vw, 880px)',
          background: 'radial-gradient(circle at center, var(--amb-2) 0%, var(--amb-2b) 40%, transparent 68%)',
        }}
      />
      {/* top-left, small */}
      <span
        className="mf-light c"
        style={{
          top: '-14vh',
          left: '-8vw',
          width: 'min(30vw, 440px)',
          height: 'min(30vw, 440px)',
          background: 'radial-gradient(circle at center, var(--amb-3) 0%, var(--amb-3b) 40%, transparent 68%)',
        }}
      />
    </div>
  );
};
