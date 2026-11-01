'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { COLORS } from './model';
import type { Area } from './organiza';

/** Crear, renombrar, colorear y quitar áreas. Quitar una no borra sus eventos. */
export function AreaManager({ areas, onSave, onRemove, onClose }: {
  areas: Area[];
  onSave: (patch: Partial<Area>) => Promise<boolean>;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Partial<Area>) => setError((await onSave(patch)) ? null : 'No se pudo guardar. Revisa que no haya dos áreas con el mismo nombre.');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await save({ name: n, color: COLORS[areas.length % COLORS.length], sort_order: areas.length });
    setName('');
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onClose} />
      <div role="dialog" aria-label="Editar áreas" className="fixed left-1/2 top-1/2 z-[91] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-white/10 bg-[#101218] shadow-2xl">
        <div className="flex items-center border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold text-white">Tus áreas</h2>
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-4">
          {areas.map((a) => (
            <div key={a.id}>
              <div className="flex items-center gap-2">
                <input defaultValue={a.emoji} onBlur={(e) => e.target.value !== a.emoji && save({ id: a.id, emoji: e.target.value.trim() })} aria-label="Emoji" className="w-10 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-center text-sm text-white focus:outline-none" />
                <input defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && save({ id: a.id, name: e.target.value.trim() })} aria-label="Nombre" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white focus:border-sky-400/50 focus:outline-none" />
                <button
                  onClick={() => window.confirm(`¿Quitar «${a.name}»? Sus eventos se quedan en el calendario, sin área.`) && onRemove(a.id)}
                  className="rounded-md p-1.5 text-white/40 hover:bg-rose-500/10 hover:text-rose-300"
                  aria-label={`Quitar ${a.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex gap-1.5 pl-12">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => save({ id: a.id, color: c })} aria-label={`Color ${c}`} className={`h-5 w-5 rounded-full ${a.color === c ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#101218]' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </div>
          ))}
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>
        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nueva área" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none" />
          <button onClick={add} disabled={!name.trim()} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-sky-400 disabled:opacity-40"><Plus className="h-4 w-4" /> Agregar</button>
        </div>
      </div>
    </BodyPortal>
  );
}
