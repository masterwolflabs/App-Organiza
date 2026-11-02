'use client';

import React, { useState } from 'react';
import { Bell, Brain, Calculator, ChevronDown, Cloud, Compass, LogOut, Menu, Settings, UserRound } from 'lucide-react';
import { APP } from '@/app.config';
import { Brand } from '@/components/shell/Brand';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface TopbarProps {
  displayName: string;
  avatarUrl: string | null;
  /** Lo propio de la app junto a la campana (Persona / Empresa en Organiza). */
  extra?: React.ReactNode;
  /** Buscador global (GlobalSearch). */
  search?: React.ReactNode;
  onOpenSidebar: () => void;
  onOpenUserCenter: (section: 'perfil' | 'configuracion') => void;
  onOpenCloud: () => void;
  /** Solo si el usuario tiene rol en esta app. */
  onOpenMente?: () => void;
  onLogout: () => void;
  /** Notificaciones: cada app decide qué cuenta (chat, avisos…). */
  unreadCount?: number;
  onOpenNotifications?: () => void;
  /** Calculadora flotante (components/calculator, de Finance). */
  onOpenCalculator?: () => void;
  /** Volver a ver el tutorial. */
  onOpenTour?: () => void;
}

/**
 * Barra superior (copiada de Finance): menú, marca, saludo, buscador,
 * campana y menú de perfil. El ojo de "ocultar montos" no viene en la
 * plantilla: cada app lo agrega si muestra datos sensibles.
 */
export const Topbar: React.FC<TopbarProps> = ({ displayName, avatarUrl, extra, search, onOpenSidebar, onOpenUserCenter, onOpenCloud, onOpenMente, onLogout, unreadCount = 0, onOpenNotifications, onOpenCalculator, onOpenTour }) => {
  const [open, setOpen] = useState(false);
  const firstName = displayName.split(' ')[0];
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800';
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <header className="flex items-center gap-4 border-b border-zinc-800/80 bg-[#09090b]/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button onClick={onOpenSidebar} title="Abrir menú" className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-white">
        <Menu className="h-5 w-5" />
      </button>
      <Brand compact />
      <div className="hidden h-8 w-px shrink-0 bg-zinc-800 sm:block" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-white">{APP.greeting.replace(/\{nombre\}/g, firstName)}</h1>
        <p className="hidden text-xs text-zinc-400 sm:block">{APP.subtitle}</p>
      </div>

      {search}
      {extra}

      {onOpenCalculator && (
        <button onClick={onOpenCalculator} title="Calculadora" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-zinc-400 hover:text-white">
          <Calculator className="h-4.5 w-4.5" />
        </button>
      )}

      <button
        onClick={onOpenNotifications}
        disabled={!onOpenNotifications}
        title={unreadCount ? `${unreadCount} sin leer` : 'Sin notificaciones nuevas'}
        className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-zinc-400 hover:text-white disabled:hover:text-zinc-400"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#09090b]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div className="relative">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 py-1.5 pl-1.5 pr-2.5 hover:border-zinc-700">
          <UserAvatar name={displayName} url={avatarUrl} />
          <div className="hidden text-left sm:block">
            <div className="text-xs font-semibold text-white">{displayName}</div>
            <div className="text-[10px] text-zinc-500">{APP.name}</div>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-zinc-800 bg-[#18181b] p-1.5 shadow-2xl">
              <div className="flex items-center gap-3 px-3 pb-3 pt-2.5">
                <UserAvatar name={displayName} url={avatarUrl} className="h-11 w-11 text-sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                  <div className="text-xs text-zinc-500">Cuenta Master Wolf</div>
                </div>
              </div>
              <div className="mb-1 border-t border-zinc-800" />
              <button onClick={act(() => onOpenUserCenter('perfil'))} className={item}>
                <UserRound className="h-4 w-4 text-zinc-400" /> Perfil
              </button>
              <button onClick={act(() => onOpenUserCenter('configuracion'))} className={item}>
                <Settings className="h-4 w-4 text-zinc-400" /> Configuración
              </button>
              {onOpenTour && (
                <button onClick={act(onOpenTour)} className={item}>
                  <Compass className="h-4 w-4 text-zinc-400" /> Tutorial de la app
                </button>
              )}
              <button onClick={act(onOpenCloud)} className={item}>
                <Cloud className="h-4 w-4 text-sky-300" /> Abrir App Master Cloud
              </button>
              {onOpenMente && (
                <button onClick={act(onOpenMente)} className={item}>
                  <Brain className="h-4 w-4 text-violet-300" /> Mente Singular
                </button>
              )}
              <div className="my-1 border-t border-zinc-800" />
              <button onClick={act(onLogout)} className={`${item} text-rose-300 hover:text-rose-200`}>
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
