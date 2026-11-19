'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { supabase } from '@/lib/supabaseClient';
import { fetchAvailableEngines } from '@/lib/aiClient';
import { MODES, PERMISSIONS, useJarvisSettings } from '@/components/organiza/jarvisSettings';

/**
 * ⚙️ Jarvis: activar/desactivar, saludo, modo de autonomía, permisos explícitos y «Lo que Jarvis recuerda»
 * (memoria central `ai_memory`, compartida con las otras apps de Master Wolf; RLS: solo la tuya). Aprender no da
 * permisos: los permisos solo se cambian aquí.
 */
type Mem = { id: string; kind: string; content: string; module?: string | null; created_at: string };
const KIND: Record<string, string> = { goal: '🎯 Objetivo', preference: '⭐ Preferencia', context: '📌 Contexto', interest: '💡 Interés', habit: '🔁 Hábito', decision: '✅ Decisión', pattern: '📈 Patrón', instruction: '📝 Instrucción' };

export const JarvisSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings: s, save } = useJarvisSettings();
  const confirm = useConfirm();
  const [mem, setMem] = useState<Mem[] | null>(null);
  const [credits, setCredits] = useState<{ used: number | null; limit: number } | null>(null);

  useEffect(() => {
    supabase.from('ai_memory').select('*').order('updated_at', { ascending: false }).limit(200).then(({ data }) => setMem((data ?? []) as Mem[]));
    fetchAvailableEngines().then((i) => i && setCredits(i.credits));
  }, []);

  const forget = async (m: Mem) => {
    if (!(await confirm({ title: '¿Jarvis olvida esto?', message: m.content, confirmLabel: 'Olvidar', tone: 'danger' }))) return;
    const { error } = await supabase.from('ai_memory').delete().eq('id', m.id);
    if (!error) setMem((l) => (l ?? []).filter((x) => x.id !== m.id));
  };

  const chip = (on: boolean) => `rounded-xl px-3 py-2 text-left text-sm ring-1 ${on ? 'bg-fuchsia-600/25 text-white ring-fuchsia-400/50' : 'text-zinc-300 ring-white/10 hover:bg-white/[0.05]'}`;
  const pct = credits?.used !== null && credits?.used !== undefined && credits.limit ? Math.round((credits.used / credits.limit) * 100) : null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-label="Ajustes de Jarvis" onClick={(e) => e.stopPropagation()} className="theme-fixed max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-display text-lg font-semibold text-white">🤖 Jarvis</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>

          <section className="space-y-2">
            {([['enabled', 'Jarvis activo', 'Apagado no aparece ni saluda (puedes decirle «Jarvis, desactívate»).'], ['greet', 'Saludarme al abrir Master Planner', 'Un saludo corto, una vez por sesión.'], ['voice_reply', 'Saludo con voz', 'Usa la voz del dispositivo (gratis).']] as const).map(([k, label, help]) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
                <input type="checkbox" checked={s[k]} onChange={(e) => save({ [k]: e.target.checked })} className="mt-1 accent-fuchsia-500" />
                <span><span className="block text-sm font-semibold text-white">{label}</span><span className="text-xs text-zinc-400">{help}</span></span>
              </label>
            ))}
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Modo</p>
            <div className="grid gap-2">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => save({ mode: m.id })} className={chip(s.mode === m.id)}>
                  <span className="font-semibold">{m.label}</span>
                  <span className="block text-xs text-zinc-400">{m.help}</span>
                </button>
              ))}
            </div>
            {s.mode === 'autonomo' && (
              <div className="mt-3 space-y-1.5 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-400/30">
                <p className="text-xs font-semibold text-amber-100">Lo que Jarvis puede hacer sin preguntarte (nada está autorizado hasta que lo marques):</p>
                {PERMISSIONS.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2 text-sm text-amber-50">
                    <input type="checkbox" checked={!!s.permissions[p.id]} onChange={(e) => save({ permissions: { ...s.permissions, [p.id]: e.target.checked } })} className="mt-1 accent-amber-400" />
                    {p.label}
                  </label>
                ))}
              </div>
            )}
          </section>

          {credits && (
            <section>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Consumo de IA este mes</p>
              <span className="block h-2 overflow-hidden rounded-full bg-white/10"><span className={`block h-full rounded-full ${pct !== null && pct >= 80 ? 'bg-amber-400' : 'bg-fuchsia-500'}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></span>
              <p className="mt-1 text-xs text-zinc-400">{credits.used === null ? 'No se pudo leer.' : `${Math.round(credits.used).toLocaleString('es-CL')} de ${credits.limit.toLocaleString('es-CL')} créditos${pct !== null && pct >= 80 ? ' · ⚠️ te queda poco' : ''}. Se renuevan el día 1.`}</p>
            </section>
          )}

          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Lo que Jarvis recuerda</p>
            <p className="mb-2 text-xs text-zinc-500">Lo guarda cuando le cuentas algo duradero. Recordar no le da permiso para actuar solo.</p>
            {mem === null ? (
              <p className="text-xs text-zinc-500">Cargando…</p>
            ) : !mem.length ? (
              <p className="rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">Todavía no recuerda nada de ti.</p>
            ) : (
              <ul className="space-y-1.5">
                {mem.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                    <span className="min-w-0 flex-1 text-sm text-zinc-200">
                      <span className="mr-1.5 text-[11px] text-zinc-500">{KIND[m.kind] ?? m.kind}{m.module && m.module !== 'general' ? ` · ${m.module}` : ''}</span>
                      {m.content}
                    </span>
                    <button type="button" aria-label="Olvidar" onClick={() => forget(m)} className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </BodyPortal>
  );
};
