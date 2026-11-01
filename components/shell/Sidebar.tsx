'use client';

import React from 'react';
import { Brain, Cloud, LifeBuoy, Settings, X } from 'lucide-react';
import { ALL_SECTIONS, AnySection } from '@/utils/sections';
import { Brand } from '@/components/shell/Brand';

interface SidebarProps {
  activeSection: AnySection;
  onNavigate: (section: AnySection) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenCloud: () => void;
  /** Solo si el usuario tiene rol en esta app (Mente Singular). */
  onOpenMente?: () => void;
  /** Al pasar el mouse por el borde: se cierra cuando el mouse sale (useEdgeReveal). */
  onMouseLeave?: () => void;
}

/** Menú lateral tipo cajón (copiado de Finance): hamburguesa en todas las pantallas. */
export const Sidebar: React.FC<SidebarProps> = ({ activeSection, onNavigate, isOpen, onClose, onOpenSettings, onOpenCloud, onOpenMente, onMouseLeave }) => {
  const extra = 'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200';
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />}
      <aside
        onMouseLeave={onMouseLeave}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-[#0c0c0f] p-4 transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-1 pb-6">
          <Brand />
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-white" title="Cerrar menú">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {ALL_SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'border-sky-500/30 bg-sky-600/15 text-sky-300' : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <button onClick={() => { onClose(); onOpenSettings(); }} className={extra}>
            <Settings className="h-4.5 w-4.5" /> <span>Ajustes</span>
          </button>
          <a href={`mailto:masterwolf.labs@gmail.com?subject=${encodeURIComponent('Ayuda')}`} className={extra}>
            <LifeBuoy className="h-4.5 w-4.5" /> <span>Ayuda y soporte</span>
          </a>
          {onOpenMente && (
            <button onClick={() => { onClose(); onOpenMente(); }} className={extra}>
              <Brain className="h-4.5 w-4.5 text-violet-300" /> <span>Mente Singular</span>
            </button>
          )}
        </nav>

        <button
          onClick={() => { onClose(); onOpenCloud(); }}
          className="mt-4 flex items-center gap-3 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-blue-600/10 p-3 text-left transition-colors hover:border-sky-500/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 text-white">
            <Cloud className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">App Master Cloud</div>
            <div className="text-[10px] text-zinc-400">Todas tus apps en un lugar</div>
          </div>
        </button>
      </aside>
    </>
  );
};
