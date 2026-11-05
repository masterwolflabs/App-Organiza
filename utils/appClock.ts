'use client';

import { useEffect, useState } from 'react';

/**
 * Hora de la aplicación (Emanuel, 2026-11-05) — Configuración → Hora de la aplicación.
 * - Automática: la hora del equipo (se ajusta sola donde estés).
 * - Manual: eliges día y hora para PROBAR cómo se ve todo (fondo, franjas, estados, racha, tema). Corre
 *   desde ahí como un reloj. Es solo para ver: lo que marques como hecho se guarda en el día real.
 * Se guarda en este navegador (`organiza-app-clock`).
 */
export type ClockPref = { mode: 'auto' } | { mode: 'manual'; date: string; time: string; setAt: number };

export const CLOCK_KEY = 'organiza-app-clock';
export const CLOCK_EVENT = 'organiza-clock';

export function loadClock(): ClockPref {
  try {
    const v = JSON.parse(localStorage.getItem(CLOCK_KEY) || 'null');
    if (v?.mode === 'manual' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && /^\d{2}:\d{2}$/.test(v.time)) return v;
  } catch {
    /* modo privado o dato raro */
  }
  return { mode: 'auto' };
}

export function saveClock(p: ClockPref) {
  try {
    if (p.mode === 'auto') localStorage.removeItem(CLOCK_KEY);
    else localStorage.setItem(CLOCK_KEY, JSON.stringify(p));
  } catch {
    /* modo privado: vale solo por esta visita */
  }
  window.dispatchEvent(new Event(CLOCK_EVENT));
}

/** La hora que usa la app para MOSTRAR (manual si la pusiste; si no, la real). */
export function appNow(): Date {
  if (typeof window === 'undefined') return new Date();
  const c = loadClock();
  if (c.mode === 'auto') return new Date();
  const start = new Date(`${c.date}T${c.time}:00`).getTime();
  return Number.isFinite(start) ? new Date(start + (Date.now() - c.setAt)) : new Date();
}

/** Re-dibuja cada `every` ms y al cambiar la hora en Configuración. Devuelve la hora de la app. */
export function useAppNow(every = 30_000): Date {
  const [now, setNow] = useState(() => appNow());
  useEffect(() => {
    const tick = () => setNow(appNow());
    tick();
    const t = setInterval(tick, every);
    const onStorage = (e: StorageEvent) => e.key === CLOCK_KEY && tick();
    window.addEventListener(CLOCK_EVENT, tick);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(t);
      window.removeEventListener(CLOCK_EVENT, tick);
      window.removeEventListener('storage', onStorage);
    };
  }, [every]);
  return now;
}

/** ¿Es de noche según la hora de la app y tus Partes del día? (antes de la mañana o desde la noche). */
export function isNightNow(): boolean {
  let manana = '06:00';
  let noche = '19:00';
  try {
    const p = JSON.parse(localStorage.getItem('organiza-day-parts') || '{}');
    if (typeof p.manana === 'string') manana = p.manana;
    if (typeof p.noche === 'string') noche = p.noche;
  } catch {
    /* por defecto 6 y 19 */
  }
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const d = appNow();
  const now = d.getHours() * 60 + d.getMinutes();
  return now < m(manana) || now >= m(noche);
}
