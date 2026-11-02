'use client';

import React from 'react';
import { DailyView } from '@/components/daily/DailyView';

export const DailyPage: React.FC = () => (
  <div className="mx-auto max-w-[1640px]">
    <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Daily</h1>
    <p className="mb-6 mt-2 text-zinc-400">Tus pendientes, con su prioridad, su estado y su entrega.</p>
    <DailyView />
  </div>
);
