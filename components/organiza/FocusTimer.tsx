'use client';

import React, { useEffect, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { coverCss, type Item } from '@/components/organiza/model';

/** Modo focus: la tarea a pantalla completa con su tiempo corriendo. Al terminar la marca como hecha. */
export const FocusTimer: React.FC<{ item: Item; onDone: () => void; onClose: () => void }> = ({ item, onDone, onClose }) => {
  const [left, setLeft] = useState(item.minutes * 60);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left]);
  const m = String(Math.floor(left / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  return (
    <BodyPortal>
      <div role="dialog" aria-label={`Focus: ${item.title}`} className="theme-fixed fixed inset-0 z-[96] flex flex-col items-center justify-center bg-[#09090b] p-6 text-center">
        <div className="absolute inset-0 opacity-25" style={coverCss(item.cover_url)} />
        <button type="button" onClick={onClose} aria-label="Salir del modo focus" className="absolute right-4 top-4 rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
        <div className="relative">
          <p className="text-lg text-zinc-300">{item.icon} {item.title}</p>
          <p className="mt-2 font-display text-7xl font-semibold tabular-nums text-[#fff] sm:text-8xl">{m}:{s}</p>
          <div className="mt-8 flex justify-center gap-3">
            {left > 0 && <button type="button" onClick={() => setRunning((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-semibold text-[#fff] hover:bg-white/15">{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Pausar' : 'Seguir'}</button>}
            <button type="button" onClick={onDone} className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-[#09090b] hover:bg-emerald-400">Terminé</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
