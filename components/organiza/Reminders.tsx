'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { toMinutes, weekdayOf, type Item } from '@/components/organiza/model';
import { useHorario } from '@/components/organiza/useHorario';

const beep = (times: number) => {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i % 2 ? 660 : 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.25);
    }
  } catch {
    /* sin audio */
  }
};

/** Con la app abierta, avisa a la hora: solo tareas del horario publicado. El resto lo cubre el aviso al teléfono. */
export const Reminders: React.FC = () => {
  const { published, publishedItems } = useHorario();
  const [ringing, setRinging] = useState<Item | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!published || published.alarms === 'ninguna') return;
    const tick = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      for (const i of publishedItems) {
        const kind = published.alarms === 'todas' && i.alarm === 'no' ? 'notificacion' : i.alarm;
        if (kind === 'no' || i.weekday !== weekdayOf(now) || toMinutes(i.time) - i.alarm_before !== min) continue;
        const key = `${i.id}:${now.toDateString()}:${min}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        const body = i.alarm_before ? `En ${i.alarm_before} minutos` : `Son las ${i.time}`;
        if ('Notification' in window && Notification.permission === 'granted') new Notification(`${i.icon} ${i.title}`.trim(), { body });
        beep(kind === 'alarma' ? 6 : 2);
        if (kind === 'alarma') setRinging(i);
      }
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [published, publishedItems]);

  if (!ringing) return null;
  return (
    <BodyPortal>
      <div role="alertdialog" aria-label={ringing.title} className="fixed inset-x-4 top-4 z-[95] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#14161b] p-4 shadow-2xl ring-1 ring-amber-400/40">
        <BellRing className="h-5 w-5 shrink-0 text-amber-300" />
        <span className="min-w-0 flex-1"><b className="block truncate font-semibold text-white">{ringing.icon} {ringing.title}</b><span className="text-sm text-zinc-400">Son las {ringing.time}</span></span>
        <button type="button" onClick={() => setRinging(null)} aria-label="Cerrar alarma" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
    </BodyPortal>
  );
};
