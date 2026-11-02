'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { toMinutes, weekdayOf, type Item, type Schedule } from '@/components/organiza/model';
import { useHorario } from '@/components/organiza/useHorario';
import { playSound, useAvisos } from '@/components/organiza/useAvisos';

type NativeNotifications = {
  requestPermissions: () => Promise<{ display: string }>;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
  cancel: (o: { notifications: { id: number }[] }) => Promise<void>;
  schedule: (o: { notifications: unknown[] }) => Promise<void>;
};

/** En la app del iPhone los avisos quedan programados en el teléfono: suenan sin internet y con la app cerrada. iOS guarda hasta 64. */
async function scheduleNative(items: Item[], alarms: Schedule['alarms']) {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { LocalNotifications?: NativeNotifications } } }).Capacitor;
  const ln = cap?.Plugins?.LocalNotifications;
  if (!cap?.isNativePlatform?.() || !ln) return;
  if ((await ln.requestPermissions()).display !== 'granted') return;
  const pending = await ln.getPending();
  if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications });
  const list = items.filter((i) => alarms === 'todas' || (alarms === 'elegidas' && i.alarm !== 'no')).slice(0, 64);
  await ln.schedule({
    notifications: list.map((i, n) => {
      const at = (toMinutes(i.time) - i.alarm_before + 1440) % 1440;
      const dayShift = toMinutes(i.time) - i.alarm_before < 0 ? 6 : 0;
      return { id: n + 1, title: `${i.icon} ${i.title}`.trim(), body: i.alarm_before ? `En ${i.alarm_before} minutos` : `Son las ${i.time}`, schedule: { on: { weekday: ((i.weekday + dayShift + 1) % 7) + 1, hour: Math.floor(at / 60), minute: at % 60 } }, sound: 'default' };
    }),
  });
}

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
  const { published, publishedItems, itemsOn } = useHorario();
  const [ringing, setRinging] = useState<Item | null>(null);
  const seen = useRef(new Set<string>());
  const { notices, prefs, reload } = useAvisos();
  const heard = useRef<string | null>(null);
  // Lo nuevo del centro de notificaciones suena y se muestra, según las preferencias.
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    const last = notices.find((n) => !n.read_at);
    if (!last) return;
    if (heard.current === null) {
      heard.current = last.id; // lo que ya estaba antes de abrir no suena
      return;
    }
    if (heard.current === last.id) return;
    heard.current = last.id;
    if (prefs.sounds) playSound(prefs.sound);
    if (prefs.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification(last.title, { body: last.body });
  }, [notices, prefs]);

  useEffect(() => {
    if (published) scheduleNative(publishedItems, 'elegidas').catch(() => {});
  }, [published, publishedItems]);

  useEffect(() => {
    if (!published) return;
    const tick = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      // Hoy manda el plan del día: lo movido suena a su nueva hora y lo cancelado no suena.
      for (const i of itemsOn(now)) {
        const kind = i.alarm;
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
  }, [published, publishedItems, itemsOn]);

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
