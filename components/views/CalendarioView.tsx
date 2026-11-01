'use client';

import React from 'react';
import { APP } from '@/app.config';
import { CalendarView } from '@/components/calendar/CalendarView';

/** Alto disponible bajo la barra superior, dejando espacio para el dock. */
export const CALENDAR_FRAME = 'flex h-[calc(100dvh-14rem)] min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] [:root[data-theme=light]_&]:bg-[#fff]! [&_*::-webkit-scrollbar-track]:bg-transparent! [&_*::-webkit-scrollbar-thumb]:bg-zinc-500/40!';

/** Todas las fechas: el calendario maestro de la nube, solo con lo de esta app. */
export const CalendarioView: React.FC = () => (
  <div className={CALENDAR_FRAME}>
    <CalendarView lockApp={APP.slug} />
  </div>
);
