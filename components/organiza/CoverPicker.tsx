'use client';

import React, { useState } from 'react';
import { Lock, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useSpace } from '@/components/organiza/space';
import { compressImageForNote } from '@/utils/image';
import { COVERS, RANKS } from '@/components/organiza/model';

/** Portadas: colores de la app (algunas se ganan en la Ruta) o una foto propia. */
export const CoverPicker: React.FC<{ value: string | null; rank: number; onPick: (cover: string | null) => void }> = ({ value, rank, onPick }) => {
  const { userId } = useSpace();
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setError('');
    if (!userId) return;
    try {
      const { blob, ext } = await compressImageForNote(file, 1600);
      const path = `${userId}/organiza/${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type });
      if (up) throw up;
      onPick(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch {
      setError('No se pudo subir la foto. Inténtalo otra vez.');
    }
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COVERS.map((c) => {
          const locked = c.rank > rank;
          return (
            <button key={c.id} type="button" disabled={locked} onClick={() => onPick(c.id)} data-help={locked ? `Se gana en rango ${RANKS[c.rank].name}` : undefined} className={`relative flex h-16 items-end rounded-xl p-2 text-left text-xs font-semibold text-[#fff] ${value === c.id ? 'ring-2 ring-white' : ''} ${locked ? 'opacity-40' : ''}`} style={{ background: c.css }}>
              {c.label}
              {locked && <Lock className="absolute right-2 top-2 h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]">
          <Upload className="h-4 w-4" /> Subir foto
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {value && <button type="button" onClick={() => onPick(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-white">Quitar portada</button>}
      </div>
    </div>
  );
};
