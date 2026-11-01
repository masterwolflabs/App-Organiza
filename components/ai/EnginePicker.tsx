'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Cpu, Lock, Sparkles } from 'lucide-react';
import { minPlanForEngine } from '@/utils/plans';
import { ENGINE_OPTIONS, engineById } from '@/utils/aiCatalog';

/** ChatGPT-style model menu: Master Finanzas tiers + specific models the server can run. */
export const EnginePicker: React.FC<{ value: string; onChange: (id: string) => void; available: string[] | null; allowed?: string[] | null }> = ({ value, onChange, available, allowed }) => {
  const [open, setOpen] = useState(false);
  const current = engineById(value);
  const options = ENGINE_OPTIONS.filter((e) => !available || available.includes(e.id));
  const tiers = options.filter((e) => !e.provider);
  const models = options.filter((e) => e.provider);

  const row = (e: (typeof ENGINE_OPTIONS)[number]) => {
    // Engines outside the user's plan are shown but locked (Planes → mejorar).
    const locked = allowed ? !allowed.includes(e.id) : false;
    return (
      <button
        key={e.id}
        disabled={locked}
        onClick={() => {
          onChange(e.id);
          setOpen(false);
        }}
        title={locked ? `Disponible desde el plan ${minPlanForEngine(e.id).name.toUpperCase()}` : undefined}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${locked ? 'text-zinc-500' : 'text-white'}`}>{e.label}</span>
          <span className="block text-[11px] text-zinc-500">{e.description}</span>
        </span>
        {locked ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
            <Lock className="h-2.5 w-2.5" /> {minPlanForEngine(e.id).name.toUpperCase()}
          </span>
        ) : (
          e.id === current.id && <Check className="h-4 w-4 shrink-0 text-sky-400" />
        )}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/[0.06]"
        title="Elegir motor"
      >
        <span className="hidden sm:inline">Master Finanzas</span>
        <span className="text-zinc-400 sm:font-normal">{current.label}</span>
        <ChevronDown className="h-4 w-4 text-zinc-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-2xl border border-zinc-800 bg-[#121317] p-1.5 shadow-2xl shadow-black/60">
            <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <Sparkles className="h-3 w-3" /> Master Finanzas
            </p>
            {tiers.map(row)}
            {models.length > 0 && (
              <>
                <div className="mx-3 my-1.5 border-t border-zinc-800" />
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <Cpu className="h-3 w-3" /> Modelos
                </p>
                {models.map(row)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
