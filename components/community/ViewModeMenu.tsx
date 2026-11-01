'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatDisplayMode } from '@/types/community';
import { AppWindow, ChevronDown, Maximize2, PanelRight } from 'lucide-react';

const OPTIONS: { key: ChatDisplayMode; label: string; icon: typeof AppWindow }[] = [
  { key: 'embedded', label: 'Pantalla completa', icon: Maximize2 },
  { key: 'sidebar', label: 'Vista lateral', icon: PanelRight },
  { key: 'floating', label: 'Ventana flotante', icon: AppWindow },
];

interface ViewModeMenuProps {
  mode: ChatDisplayMode;
  onChange: (mode: ChatDisplayMode) => void;
}

export const ViewModeMenu: React.FC<ViewModeMenuProps> = ({ mode, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.key === mode) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Cómo ver este chat"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        <current.icon className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-800 bg-[#18181b] py-1 shadow-2xl">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs ${
                mode === o.key ? 'text-sky-400' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <o.icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
