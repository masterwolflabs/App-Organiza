'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FocusTimer } from '@/components/organiza/FocusTimer';
import { iso, refOf, toMinutes, weekdayOf, type Item } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

/**
 * Autofocus (Emanuel, 2026-11-03): con Organiza abierta, el modo focus de una acción con «Abrirse solo»
 * se abre a su hora — la hora local del dispositivo, o sea la del país donde estás. Manda el horario
 * publicado (con los cambios del día); si aún no publicas, el que estás armando. Una vez por día, y no
 * si ya la marcaste hecha. Se cierra como siempre.
 */
export const AutoFocus: React.FC = () => {
  const { published, itemsOn, activeItems } = useHorario();
  const c = useChecks();
  const [open, setOpen] = useState<Item | null>(null);
  const opened = useRef(new Set<string>());

  useEffect(() => {
    const tick = () => {
      if (open) return;
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      const today = published ? itemsOn(now) : activeItems.filter((i) => i.weekday === weekdayOf(now));
      for (const i of today) {
        if (!i.focus || !i.auto_focus) continue;
        const start = toMinutes(i.time);
        // A su hora (con 2 minutos de margen por si la pestaña estaba dormida).
        if (min < start || min > start + 2) continue;
        const key = `${refOf(i.title)}:${iso(now)}`;
        if (opened.current.has(key)) continue;
        try {
          if (sessionStorage.getItem(`organiza-autofocus:${key}`)) continue;
          sessionStorage.setItem(`organiza-autofocus:${key}`, '1');
        } catch {
          /* modo privado */
        }
        opened.current.add(key);
        if (c.checks.some((k) => k.ref === refOf(i.title) && k.day === iso(now) && k.done)) continue;
        setOpen(i);
        break;
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [open, published, itemsOn, activeItems, c.checks]);

  if (!open) return null;
  return <FocusTimer item={open} checks={c} onClose={() => setOpen(null)} onDone={() => setOpen(null)} />;
};
