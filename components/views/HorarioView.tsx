'use client';

import React from 'react';
import { APP } from '@/app.config';
import { CalendarView } from '@/components/calendar/CalendarView';
import { CALENDAR_FRAME } from '@/components/views/CalendarioView';

/**
 * La semana tipo: el mismo calendario y los mismos eventos, viendo solo lo que
 * se repite. Lo que se crea aquí aparece en el Calendario, y al revés.
 */
export const HorarioView: React.FC = () => (
  <div className={CALENDAR_FRAME}>
    <CalendarView lockApp={APP.slug} horario />
  </div>
);
