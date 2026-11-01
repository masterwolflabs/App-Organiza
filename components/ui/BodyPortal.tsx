'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a modal / side panel straight into <body>, above everything (dock,
 * quick actions, top bar), and locks the page scroll while it's open.
 * Needed because the glass/neon sections use backdrop-filter, which traps
 * `position: fixed` children inside the section (cut off, only that section
 * blurred, and below the dock).
 */
export function BodyPortal({ children, lockScroll = true }: { children: React.ReactNode; lockScroll?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useScrollLock(lockScroll && mounted);
  return mounted ? createPortal(children, document.body) : null;
}

let locks = 0;
let saved: { html: string; body: string } | null = null;

/** Stops the page from scrolling while `active` (nested locks are counted). */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    if (locks === 0) {
      saved = { html: html.style.overflow, body: document.body.style.overflow };
      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        html.style.overflow = saved.html;
        document.body.style.overflow = saved.body;
        saved = null;
      }
    };
  }, [active]);
}
