'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';

/**
 * 🤖 Ajustes de Jarvis (SQL 38 de la nube: `jarvis_settings`, una fila por persona y app; RLS: solo la tuya).
 * APRENDER ≠ PERMISO: lo que Jarvis recuerda está en `ai_memory`; lo que puede hacer por su cuenta solo vive aquí y
 * solo lo cambias tú. Copia instantánea en el equipo para que el saludo no espere a la red.
 */
export type JarvisMode = 'reactivo' | 'proactivo' | 'autonomo';
export type JarvisSettings = { enabled: boolean; greet: boolean; voice_reply: boolean; mode: JarvisMode; permissions: Record<string, boolean> };
export const DEFAULT_JARVIS: JarvisSettings = { enabled: true, greet: true, voice_reply: false, mode: 'reactivo', permissions: {} };

export const MODES: { id: JarvisMode; label: string; help: string }[] = [
  { id: 'reactivo', label: '💬 Reactivo', help: 'Responde cuando le hablas. No hace nada por su cuenta.' },
  { id: 'proactivo', label: '💡 Proactivo', help: 'Además detecta cosas por su cuenta (hoy: choques entre tu Horario y tu Calendario en los próximos 3 días) y te las muestra para que decidas.' },
  { id: 'autonomo', label: '⚡ Autónomo', help: 'Además puede aplicar sin preguntarte SOLO lo que autorices abajo. Borrar siempre pide confirmación.' },
];
/** Permisos explícitos (solo valen en modo Autónomo). */
export const PERMISSIONS: { id: string; label: string }[] = [
  { id: 'resolver_choques', label: 'Reacomodar mi día cuando dos cosas chocan (solo ese día; se deshace con ↶)' },
];

const KEY = (uid: string) => `jarvis-settings:${uid}:${APP.slug}`;
const EVENT = 'jarvis-settings';

export function readLocalJarvis(uid: string | null): JarvisSettings {
  if (!uid) return DEFAULT_JARVIS;
  try {
    return { ...DEFAULT_JARVIS, ...(JSON.parse(localStorage.getItem(KEY(uid)) ?? 'null') ?? {}) };
  } catch {
    return DEFAULT_JARVIS;
  }
}

export function useJarvisSettings() {
  const [uid, setUid] = useState<string | null>(null);
  const [s, setS] = useState<JarvisSettings>(DEFAULT_JARVIS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      if (!on) return;
      setUid(id);
      setS(readLocalJarvis(id));
      if (id) {
        const { data: row } = await supabase.from('jarvis_settings').select('enabled, greet, voice_reply, mode, permissions').eq('owner_id', id).eq('app', APP.slug).maybeSingle();
        if (on && row) {
          const next = { ...DEFAULT_JARVIS, ...(row as Partial<JarvisSettings>) };
          setS(next);
          try {
            localStorage.setItem(KEY(id), JSON.stringify(next));
          } catch {}
        }
      }
      if (on) setReady(true);
    })();
    const sync = (e: Event) => {
      const next = (e as CustomEvent<JarvisSettings>).detail;
      if (next) setS(next);
    };
    window.addEventListener(EVENT, sync);
    return () => {
      on = false;
      window.removeEventListener(EVENT, sync);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (p: Partial<JarvisSettings>) => {
    const next = { ...s, ...p };
    setS(next);
    // Todas las caras de Jarvis abiertas (botón, panel, ajustes) se enteran al tiro.
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
    if (!uid) return;
    try {
      localStorage.setItem(KEY(uid), JSON.stringify(next));
    } catch {}
    await supabase.from('jarvis_settings').upsert({ owner_id: uid, app: APP.slug, ...next, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,app' });
  }, [s, uid]);

  return { settings: s, ready, uid, save };
}

/** «Jarvis, desactívate» / «actívate»: lo resuelve el código, sin gastar IA. */
export function toggleCommand(text: string): boolean | null {
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^(jarvis[,!.\s]*)?(desactivate|apagate|silencio|no me molestes)[.!]*$/.test(t)) return false;
  if (/^(jarvis[,!.\s]*)?(activate|despierta|vuelve)[.!]*$/.test(t)) return true;
  return null;
}
