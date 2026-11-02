'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, UserRound } from 'lucide-react';
import type { Space } from '@/components/organiza/model';

/**
 * Persona o Empresa: dos bases dentro de Organiza, con las mismas pantallas.
 * Cada dato guarda su `space`; se elige en la barra superior.
 */
const KEY = 'organiza-space';
const Ctx = createContext<{ space: Space; userId: string | null; email: string | null; name: string; setSpace: (s: Space) => void }>({ space: 'persona', userId: null, email: null, name: '', setSpace: () => {} });
export const useSpace = () => useContext(Ctx);
/** La cuenta originaria de Master Wolf Labs: su Daily es la del equipo. */
export const LABS_EMAIL = 'masterwolf.labs@gmail.com';

export const SpaceProvider: React.FC<{ userId: string; email: string | null; name: string; children: React.ReactNode }> = ({ userId, email, name, children }) => {
  const [space, set] = useState<Space>('persona');
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'empresa') set('empresa');
    } catch {
      /* modo privado */
    }
  }, []);
  const setSpace = useCallback((s: Space) => {
    set(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* modo privado */
    }
  }, []);
  const value = useMemo(() => ({ space, userId, email, name, setSpace }), [space, userId, email, name, setSpace]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** El interruptor de la barra superior. */
export const SpaceSwitch: React.FC = () => {
  const { space, setSpace } = useSpace();
  const item = (id: Space, label: string, Icon: typeof UserRound) => (
    <button
      type="button"
      onClick={() => setSpace(id)}
      aria-pressed={space === id}
      data-help={id === 'persona' ? 'Tu vida personal' : 'Lo de tu empresa, en una base aparte'}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${space === id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
    >
      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
  return (
    <div data-tour="espacio" className="inline-flex shrink-0 rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10">
      {item('persona', 'Persona', UserRound)}
      {item('empresa', 'Empresa', BriefcaseBusiness)}
    </div>
  );
};
