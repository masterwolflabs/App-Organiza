'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FOCUS_SWITCH, FocusTimer, openFocus } from '@/components/organiza/FocusTimer';
import { iso, refOf, toMinutes, weekdayOf, type Item } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

/**
 * Autofocus (Emanuel, 2026-11-03): con Organiza abierta, el modo focus de una acción con «Abrirse solo»
 * se abre a su hora — la hora local del dispositivo, o sea la del país donde estás. Manda el horario
 * publicado (con los cambios del día); si aún no publicas, el que estás armando. Una vez por día, y no
 * si ya la marcaste hecha. Se cierra como siempre. Si a esa hora hay otro focus abierto, lo reemplaza
 * (el horario manda, aunque el tiempo del otro no haya llegado a cero).
 */
export const AutoFocus: React.FC = () => {
  const { published, itemsOn, activeItems } = useHorario();
  const c = useChecks();
  const [open, setOpen] = useState<Item | null>(null);
  const opened = useRef(new Set<string>());

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      const today = published ? itemsOn(now) : activeItems.filter((i) => i.weekday === weekdayOf(now));
      for (const i of today) {
        const start = toMinutes(i.time);
        // A su hora (con 2 minutos de margen por si la pestaña estaba dormida).
        if (min < start || min > start + 2) continue;
        const key = `${refOf(i.title)}:${iso(now)}`;
        if (opened.current.has(key)) continue;
        const cur = openFocus;
        if (cur?.id === i.id) continue;
        const opens = !!(i.focus && i.auto_focus) && !c.checks.some((k) => k.ref === refOf(i.title) && k.day === iso(now) && k.done);
        // El horario manda (Emanuel, 2026-11-10): si hay un focus abierto de otra acción (ej. Dormir con tiempo
        // de sobra) y llegó la hora de esta (Levantarse), el focus cambia aunque el tiempo no llegó a cero.
        // Cambia si esta se abre sola, o si la abierta era de las que se abren solas (la sigue el horario).
        if (!opens && !cur?.auto_focus) continue;
        opened.current.add(key);
        try {
          if (sessionStorage.getItem(`organiza-autofocus:${key}`)) continue;
          sessionStorage.setItem(`organiza-autofocus:${key}`, '1');
        } catch {
          /* modo privado */
        }
        if (cur) window.dispatchEvent(new CustomEvent(FOCUS_SWITCH, { detail: i.id }));
        if (opens) setOpen(i);
        break;
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [published, itemsOn, activeItems, c.checks]);

  if (!open) return null;
  return <FocusTimer key={open.id} item={open} checks={c} onClose={() => setOpen(null)} onDone={() => setOpen(null)} />;
};
