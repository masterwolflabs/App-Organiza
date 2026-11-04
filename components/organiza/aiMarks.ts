'use client';

import { useEffect, useState } from 'react';

/**
 * Lo que la IA marca o propone en el Horario (Emanuel, 2026-11-04). La IA responde en el chat; aquí
 * queda guardado (en este dispositivo) para que el Tablero dibuje los bordes que titilan y la barra
 * con la propuesta. Nunca se aplica nada sin que la persona apriete «Aplicar».
 */
export type AIChange = { id: string; title: string; day: string; patch: { label?: string; icon?: string; time?: string; minutes?: number; flex?: string; alarm?: 'no' | 'notificacion' | 'alarma'; alarm_before?: number; focus?: boolean; description?: string } };
export type AIMarks = { ids: string[]; color: string; reason: string; summary?: string; changes?: AIChange[]; at: number };
type Action = { type: string; ids?: string[]; color?: string; reason?: string; summary?: string; changes?: AIChange[] };

const KEY = 'organiza-ai-marks';
const EVENT = 'organiza-ai-marks';
export const MARK_COLORS: Record<string, string> = { amarillo: '#facc15', rojo: '#f43f5e', azul: '#38bdf8', verde: '#34d399', morado: '#a78bfa', naranjo: '#fb923c' };

export function readMarks(): AIMarks | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function setMarks(m: AIMarks | null) {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Las acciones que vinieron en una respuesta de la IA → marcas del Horario (o null si no trae). */
export function marksFromActions(actions: unknown): AIMarks | null {
  if (!Array.isArray(actions)) return null;
  const list = actions as Action[];
  const hi = list.filter((a) => a.type === 'organiza.highlight');
  const pr = list.filter((a) => a.type === 'organiza.propose');
  if (!hi.length && !pr.length) return null;
  const changes = pr.flatMap((a) => a.changes ?? []);
  return {
    ids: [...new Set([...hi.flatMap((a) => a.ids ?? []), ...changes.map((c) => c.id)])],
    color: hi[0]?.color ?? 'amarillo',
    reason: hi.map((a) => a.reason).filter(Boolean).join(' · ') || pr[0]?.summary || 'Marcadas por la IA',
    summary: pr.map((a) => a.summary).filter(Boolean).join(' · ') || undefined,
    changes: changes.length ? changes : undefined,
    at: Date.now(),
  };
}

export function useAIMarks() {
  const [m, setM] = useState<AIMarks | null>(null);
  useEffect(() => {
    const load = () => setM(readMarks());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);
  return m;
}

/** Ir al Horario desde cualquier pantalla (la app navega por #sección). */
export function goToHorario() {
  history.pushState(history.state, '', `${window.location.pathname}#horario`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
