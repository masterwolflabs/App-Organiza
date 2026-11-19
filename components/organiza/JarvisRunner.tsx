'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useHorario } from '@/components/organiza/useHorario';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays } from '@/components/calendar/model';
import { useConfirm } from '@/components/ui/confirm';
import { runAIActions } from '@/components/organiza/aiExecutor';

/**
 * 🤖 Jarvis fuera del Horario (sección IA): monta el Horario y el Calendario SOLO cuando hay acciones que aplicar,
 * espera a que carguen y las ejecuta con las mismas funciones de la pantalla (y el mismo ↶). Devuelve lo que pasó
 * de verdad. Antes, la sección IA no aplicaba nada pero la IA respondía «listo» (auditoría 19 nov).
 */
export const JarvisRunner: React.FC<{ actions: unknown; onDone: (lines: string[], undo: () => Promise<unknown>) => void }> = ({ actions, onDone }) => {
  const [from, to] = useMemo(() => [addDays(new Date(), -90), addDays(new Date(), 400)], []);
  const cal = useCalendar(from, to);
  const h = useHorario();
  const confirm = useConfirm();
  const ran = useRef(false);
  const live = useRef({ h, cal });
  live.current = { h, cal };

  useEffect(() => {
    if (ran.current || !h.ready || cal.status === 'loading') return;
    ran.current = true;
    runAIActions(actions, { ...live.current, confirm })
      // ↶: queda montado (el que lo usa decide cuándo cerrarlo) para poder deshacer con el mismo historial.
      .then((lines) => onDone(lines.length ? lines : ['⚠️ No se aplicó ningún cambio.'], () => live.current.h.undo()))
      .catch(() => onDone(['⚠️ No se pudieron aplicar los cambios. Revisa tu conexión y vuelve a pedírmelo.'], async () => {}));
  }, [h.ready, cal.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};
