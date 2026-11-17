'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * 👤 Perfil → «Tu figura» (Workout Pro, 2026-11-17): hombre, mujer o prefiero no decir (figura por defecto).
 * Se guarda en organiza_prefs.body (SQL 44). Es lo único del perfil propio de Master Planner.
 */
export const BodyPref: React.FC<{ userId: string }> = ({ userId }) => {
  const [body, setBody] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('organiza_prefs').select('body').eq('owner_id', userId).maybeSingle().then(({ data }) => setBody((data?.body as string | null) ?? null));
  }, [userId]);
  const pick = async (v: string | null) => {
    setBody(v);
    const { error } = await supabase.from('organiza_prefs').upsert({ owner_id: userId, body: v, updated_at: new Date().toISOString() });
    setMsg(error ? 'No se pudo guardar.' : 'Guardado.');
  };
  if (body === undefined) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">La figura de Workout Pro (los músculos que entrenaste en la semana).</p>
      <div className="flex flex-wrap gap-2">
        {([['hombre', '🧍‍♂️ Hombre'], ['mujer', '🧍‍♀️ Mujer'], [null, 'Prefiero no decir']] as const).map(([v, label]) => (
          <button key={label} type="button" onClick={() => pick(v)} className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${body === v ? 'bg-sky-600 text-white ring-sky-500' : 'text-zinc-300 ring-zinc-700 hover:bg-zinc-800'}`}>{label}</button>
        ))}
        {msg && <span className="self-center text-xs text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
};
