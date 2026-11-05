'use client';

import React from 'react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { saveClock, useAppNow, loadClock } from '@/utils/appClock';

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Con la hora manual puesta, un aviso arriba para que nunca se te olvide (y volver a la real de un toque). */
export const ClockBanner: React.FC = () => {
  const now = useAppNow(15_000);
  if (typeof window === 'undefined' || loadClock().mode !== 'manual') return null;
  const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <BodyPortal>
      <div role="status" className="theme-fixed fixed left-1/2 top-2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500 py-1 pl-3 pr-1 text-xs font-semibold text-[#1c1917] shadow-lg">
        <span>🕐 Hora de prueba: {DAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]} · {hh}</span>
        <button type="button" onClick={() => saveClock({ mode: 'auto' })} className="rounded-full bg-[#1c1917] px-2.5 py-1 text-[11px] font-semibold text-[#fff] hover:bg-[#292524]">
          Volver a la real
        </button>
      </div>
    </BodyPortal>
  );
};
