'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FOCUS_SWITCH, FocusTimer, openFocus } from '@/components/organiza/FocusTimer';
import { iso, refOf, toMinutes, weekdayOf, type Item } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';
import { notify } from '@/components/organiza/notify';

/**
 * Autofocus (Emanuel, 2026-11-03): con Organiza abierta, el modo focus de una acción con «Abrirse solo»
 * se abre a su hora — la hora local del dispositivo, o sea la del país donde estás. Manda el horario
 * publicado (con los cambios del día); si aún no publicas, el que estás armando. Una vez por día, y no
 * si ya la marcaste hecha. Si la pestaña o el equipo despiertan tarde, se abre igual mientras la acción siga
 * en su horario. Se cierra como siempre. Si a esa hora hay otro focus abierto, lo reemplaza
 * (el horario manda, aunque el tiempo del otro no haya llegado a cero).
 *
 * Arreglo (Emanuel, 2026-11-12: «no se activó el de la mañana»): antes quedaba marcado «abierto hoy» al ABRIRSE;
 * si la página se recargaba (actualización, Chrome) el focus desaparecía y no volvía. Ahora solo deja de
 * abrirse si la persona lo CIERRA o lo TERMINA (o el horario pasa a la siguiente acción). Mientras esté
 * abierto, la pestaña que lo muestra deja un «latido» para que otra pestaña no lo abra encima.
 */
const CLOSED = (key: string) => `organiza-autofocus-closed:${key}`;
const BEAT = (key: string) => `organiza-autofocus-open:${key}`;
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado */
  }
};
export const AutoFocus: React.FC = () => {
  const { published, itemsOn, activeItems } = useHorario();
  const c = useChecks();
  const [open, setOpen] = useState<{ item: Item; key: string } | null>(null);
  const openRef = useRef<{ item: Item; key: string } | null>(null);
  openRef.current = open;

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      const today = published ? itemsOn(now) : activeItems.filter((i) => i.weekday === weekdayOf(now));
      const doneToday = (i: Item) => c.checks.some((k) => k.ref === refOf(i.title) && k.day === iso(now) && k.done);
      const opensAlone = (i: Item) => !!(i.focus && i.auto_focus) && !doneToday(i);
      // Ponerse al día (2026-11-11): si la pestaña o el equipo despiertan tarde (09:07 para una de las 09:00),
      // vale mientras la acción siga en su horario. Manda la que empezó más tarde (la que toca ahora).
      const now_ = today
        .filter((i) => {
          const start = toMinutes(i.time);
          return min >= start && min < start + Math.max(3, i.minutes || 0);
        })
        .sort((a, b) => toMinutes(b.time) - toMinutes(a.time) || Number(opensAlone(b)) - Number(opensAlone(a)));
      const i = now_[0];
      if (!i) return;
      const key = `${refOf(i.title)}:${iso(now)}`;
      // Ya lo cerraste o terminaste hoy: no insiste.
      if (lsGet(CLOSED(key))) return;
      // Esta pestaña ya lo muestra; u otra pestaña lo tiene abierto (latido de menos de 40 s).
      if (openRef.current?.key === key) return lsSet(BEAT(key), String(Date.now()));
      if (Date.now() - Number(lsGet(BEAT(key)) || 0) < 40_000) return;
      const cur = openFocus;
      if (cur?.id === i.id) return;
      const opens = opensAlone(i);
      // El horario manda (Emanuel, 2026-11-10): si hay un focus abierto de otra acción (ej. Dormir con tiempo
      // de sobra) y llegó la hora de esta (Levantarse), el focus cambia aunque el tiempo no llegó a cero.
      // Cambia si esta se abre sola, o si la abierta era de las que se abren solas (la sigue el horario).
      if (!opens && !cur?.auto_focus) return;
      if (cur) window.dispatchEvent(new CustomEvent(FOCUS_SWITCH, { detail: i.id }));
      if (opens) {
        lsSet(BEAT(key), String(Date.now()));
        setOpen({ item: i, key });
        // Si no estás mirando, o el navegador no dejará sonar la música sin un toque, avisa igual con la
        // notificación del sistema (con su sonido): así despierta aunque la música quede muda.
        const noTouch = !(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
        if (document.visibilityState !== 'visible' || noTouch) void notify(`⏰ ${i.title}`, 'Se abrió tu modo focus. Toca para volver a Organiza y que suene la música.', true);
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    // Al volver a la pestaña o despertar el equipo, revisa al tiro (no espera los 15 s).
    const wake = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [published, itemsOn, activeItems, c.checks]);

  if (!open) return null;
  // Cerrarlo, terminarlo o que el horario pase a la siguiente acción = no vuelve a abrirse hoy.
  const close = () => {
    lsSet(CLOSED(open.key), '1');
    lsSet(BEAT(open.key), '0');
    setOpen(null);
  };
  return <FocusTimer key={open.item.id} item={open.item} checks={c} onClose={close} onDone={close} />;
};
