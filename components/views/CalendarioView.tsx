'use client';

import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { APP } from '@/app.config';
import { CalendarView } from '@/components/calendar/CalendarView';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays } from '@/components/calendar/model';
import { useHorario } from '@/components/organiza/useHorario';
import { AIPanel } from '@/components/organiza/AIPanel';

/** Alto disponible bajo la barra superior, dejando espacio para el dock. */
export const CALENDAR_FRAME = 'flex h-[calc(100dvh-14rem)] min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] [:root[data-theme=light]_&]:bg-[#fff]! [&_*::-webkit-scrollbar-track]:bg-transparent! [&_*::-webkit-scrollbar-thumb]:bg-zinc-500/40!';

/** La IA al lado del calendario: solo se carga al abrirla (lee horario y eventos para trabajar en vivo). */
const CalendarAI: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [from, to] = useMemo(() => [addDays(new Date(), -90), addDays(new Date(), 400)], []);
  const cal = useCalendar(from, to);
  const h = useHorario();
  return <AIPanel h={h} cal={cal} onClose={onClose} />;
};

/** Todas las fechas: el calendario maestro de la nube, solo con lo de esta app. */
export const CalendarioView: React.FC = () => {
  const [ai, setAi] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setAi(true)} data-help="Pídele a la IA que agende, mueva o borre eventos: lo hace en vivo" className="absolute -top-11 right-0 z-10 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-1.5 text-sm font-semibold text-[#fff] shadow-lg shadow-fuchsia-500/20 hover:brightness-110"><Sparkles className="h-4 w-4" /> IA</button>
      <div className={CALENDAR_FRAME}>
        <CalendarView lockApp={APP.slug} />
      </div>
      {ai && <CalendarAI onClose={() => setAi(false)} />}
    </div>
  );
};
