import React from 'react';
import { APP } from '@/app.config';
import { WolfLogo } from '@/components/shell/WolfLogo';

/** Logo + nombre de la app (barra superior y menú lateral). */
export const Brand: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className="flex shrink-0 items-center gap-2.5">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/20">
      <WolfLogo className="h-5 w-5" />
    </div>
    <div className={compact ? 'hidden sm:block' : ''}>
      <div className="text-sm font-bold leading-none tracking-tight text-white">{APP.brandTop}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">{APP.brandBottom}</div>
    </div>
  </div>
);
