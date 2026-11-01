'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * A total that counts up from 0 to its value (≈1 s, easing out) the first
 * time it scrolls into view; later changes glide from the old value to the
 * new one (0.6 s). Reduced motion: shows the value right away. `format`
 * receives the in-between number (not rounded — CLP formatters round, USDT
 * keeps decimals). Add `neon-num` / `neon-num-sky` (globals.css) for the glow.
 */
export const AnimatedNumber: React.FC<{
  value: number;
  format: (n: number) => string;
  className?: string;
  /** First count-up duration, ms. */
  duration?: number;
}> = ({ value, format, className, duration = 1000 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const shown = useRef(0); // what's on screen right now
  const started = useRef(false); // has the first count-up happened?
  const [visible, setVisible] = useState(false);

  // Start only once the number is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = shown.current;
    const to = value;
    if (reduced || from === to) {
      shown.current = to;
      setDisplay(to);
      started.current = true;
      return;
    }
    const ms = started.current ? 600 : duration;
    started.current = true;
    let raf = 0;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 4); // fast start, gentle landing
      const v = from + (to - from) * eased;
      shown.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, visible, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ''}`}>
      {format(display)}
    </span>
  );
};
