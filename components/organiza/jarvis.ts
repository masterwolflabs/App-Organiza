'use client';

import { supabase } from '@/lib/supabaseClient';
import type { AIMessage } from '@/lib/aiClient';

/**
 * 🤖 Jarvis (Emanuel, 2026-11-19): UN solo asistente para todo Master Planner. El cerebro vive en la nube
 * (App Master Cloud, /api/ai/chat: instrucciones, memoria, herramientas, proveedor). Aquí, lo que comparten
 * todas sus «caras» (panel al lado del Horario/Calendario y la sección IA):
 *  · la conversación abierta (la misma en el panel y en la sección IA),
 *  · el contexto de pantalla (qué sección, fecha y hora),
 *  · el motor elegido (OpenAI o Claude),
 *  · el RESULTADO REAL de las acciones: la nube solo propone acciones; las aplica la app con la sesión de la
 *    persona y lo que de verdad pasó (✅ / ⚠️) se guarda en el mensaje, así Jarvis nunca da por hecho algo que
 *    no se confirmó y lo sabe en el turno siguiente.
 */

/** Conversación abierta de Jarvis en este dispositivo (se mantiene la clave antigua del panel). */
const CONV_KEY = 'organiza-ai-panel-conv';
export function readJarvisConv(): string | null {
  try {
    return localStorage.getItem(CONV_KEY);
  } catch {
    return null;
  }
}
export function writeJarvisConv(id: string | null) {
  try {
    if (id) localStorage.setItem(CONV_KEY, id);
    else localStorage.removeItem(CONV_KEY);
  } catch {
    /* modo privado */
  }
}

/** Motor elegido (el mismo selector que la sección IA). */
export function readEngine(): string {
  try {
    return localStorage.getItem('mf-ai-engine') || 'auto';
  } catch {
    return 'auto';
  }
}

/** Qué ve la persona: se manda en cada mensaje (texto corto; la nube lo limita a 1.500 caracteres). */
export function jarvisScreen(where: string, extra: string[] = []): string {
  const now = new Date();
  return [
    `Ahora es ${now.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Hoy es ${now.toLocaleDateString('sv-SE')}.`,
    `La persona te habla desde: ${where}.`,
    ...extra,
  ].join('\n');
}

/**
 * Guarda en el mensaje de Jarvis lo que la app aplicó de verdad (líneas ✅ / ⚠️). La nube lo agrega al historial
 * del turno siguiente. RLS: solo los mensajes propios.
 */
export async function saveActionResults(msg: AIMessage, lines: string[]) {
  if (!lines.length) return;
  const metadata = { ...(msg.metadata ?? {}), results: lines, applied_at: new Date().toISOString() };
  msg.metadata = metadata;
  await supabase.from('ai_messages').update({ metadata }).eq('id', msg.id);
}
export const resultsOf = (m: AIMessage): string[] => (Array.isArray(m.metadata?.results) ? (m.metadata.results as string[]) : []);
