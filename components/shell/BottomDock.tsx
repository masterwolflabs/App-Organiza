'use client';

import React, { useRef, useState } from 'react';
import { Cloud, Settings } from 'lucide-react';
import { ALL_SECTIONS, AnySection } from '@/utils/sections';

interface BottomDockProps {
  activeSection: AnySection;
  onNavigate: (section: AnySection) => void;
  onOpenSettings: () => void;
  onOpenCloud: () => void;
}

interface DockItemDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  run: 'section' | 'settings' | 'cloud';
  isCenter?: boolean;
}

const SLOT_WIDTH = 64;
const GAP = 8;
const PAD_X = 18;

function scaleForDistance(distance: number): number {
  const maxDist = 90;
  const maxScale = 0.12;
  if (distance >= maxDist) return 1;
  return 1 + maxScale * Math.cos((distance / maxDist) * (Math.PI / 2));
}

/**
 * Dock (copiado de Finance): píldora flotante en el celular y dock estilo
 * macOS con efecto lupa en escritorio. Se arma con las secciones `dock: true`
 * de app.config.ts; al centro, el botón brillante de la nube; al final, Ajustes.
 */
export const BottomDock: React.FC<BottomDockProps> = ({ activeSection, onNavigate, onOpenSettings, onOpenCloud }) => {
  const sections: DockItemDef[] = ALL_SECTIONS.filter((s) => s.dock).map((s) => ({ key: s.key, label: s.label.split(' ')[0], icon: s.icon, run: 'section' }));
  const half = Math.ceil(sections.length / 2);
  const items: DockItemDef[] = [
    ...sections.slice(0, half),
    { key: 'nube', label: 'Nube', icon: Cloud, run: 'cloud', isCenter: true },
    ...sections.slice(half),
    { key: 'ajustes', label: 'Ajustes', icon: Settings, run: 'settings' },
  ];
  const [mouseX, setMouseX] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (item: DockItemDef) => {
    if (item.run === 'section') onNavigate(item.key as AnySection);
    else if (item.run === 'settings') onOpenSettings();
    else onOpenCloud();
  };

  const center = (item: DockItemDef) => {
    const Icon = item.icon;
    return (
      <>
        <button onClick={() => handleClick(item)} title="Abrir App Master Cloud" className="absolute -top-10 flex items-center justify-center">
          <span className="absolute inset-0 -m-2 rounded-full bg-sky-400/40 blur-lg" aria-hidden />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 shadow-[0_0_22px_2px_color-mix(in_oklab,var(--color-sky-400)_55%,transparent)] ring-4 ring-[#0c0f1a]">
            <Icon className="h-6 w-6 text-white" />
          </span>
        </button>
        <span className="mt-6 text-[10px] font-medium text-sky-400">{item.label}</span>
      </>
    );
  };

  return (
    <>
      {/* Celular: píldora flotante */}
      <nav className="fixed inset-x-4 bottom-4 z-40 md:hidden">
        <div className="relative mx-auto flex max-w-md items-end justify-between rounded-full border border-sky-500/30 bg-[#0c0f1a]/90 px-3 pb-3 pt-3 shadow-2xl shadow-sky-500/20 backdrop-blur-xl">
          {items.map((item) => {
            const Icon = item.icon;
            if (item.isCenter) return <div key={item.key} className="relative flex w-12 flex-col items-center">{center(item)}</div>;
            return (
              <button
                key={item.key}
                onClick={() => handleClick(item)}
                className={`flex w-12 flex-col items-center gap-1 ${item.key === activeSection ? 'text-sky-400' : 'text-zinc-400'}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Escritorio: dock con efecto lupa */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 hidden justify-center md:flex">
        <div
          ref={containerRef}
          onMouseMove={(e) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) setMouseX(e.clientX - rect.left);
          }}
          onMouseLeave={() => setMouseX(null)}
          className="pointer-events-auto flex items-end rounded-full border border-sky-500/25 bg-[#0c0f1a]/85 px-[18px] pb-3 pt-3 shadow-2xl shadow-black/50 backdrop-blur-xl"
          style={{ gap: GAP }}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const centerX = PAD_X + i * (SLOT_WIDTH + GAP) + SLOT_WIDTH / 2;
            const scale = scaleForDistance(mouseX == null ? Infinity : Math.abs(mouseX - centerX));
            return (
              <div
                key={item.key}
                className="relative flex flex-col items-center"
                style={{ width: SLOT_WIDTH, transform: `scale(${scale}) translateY(${(scale - 1) * -16}px)`, transformOrigin: 'bottom center', transition: 'transform 150ms ease-out' }}
              >
                {item.isCenter ? (
                  center(item)
                ) : (
                  <button onClick={() => handleClick(item)} className={`flex flex-col items-center gap-1 ${item.key === activeSection ? 'text-sky-400' : 'text-zinc-300'}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
