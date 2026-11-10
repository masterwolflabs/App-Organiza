'use client';

import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { APP } from '@/app.config';
import { setAppAgents } from '@/utils/aiCatalog';

// Copia de lib/aiClient.ts de Finance. Diferencia: la IA vive en App Master
// Cloud (las llaves de OpenAI / Claude están solo allá). Todo lo que llama a
// un modelo va a `${APP.cloudUrl}/api/ai/*` con la sesión de la persona y el
// `app` de esta app (reglas, agentes y créditos de la app). Conversaciones,
// mensajes y carpetas se leen directo de Supabase (RLS: cada persona ve solo
// las suyas), filtradas por app (utils/useAIConversations.ts).

export type AIMode = 'chat' | 'report' | 'random';
export type AITier = 'auto' | 'rapido' | 'estandar' | 'profundo';
export type ReportKind = 'hoy' | 'semanal' | 'mensual';

export interface AIAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind?: 'image' | 'pdf' | 'text' | 'audio' | 'other';
  extracted?: string;
  transcript?: string;
  seconds?: number;
}

export interface AIConversation {
  id: string;
  title: string;
  title_locked: boolean;
  mode: AIMode;
  folder_id: string | null;
  data_scope: string;
  metadata: Record<string, unknown>;
  /** App donde se creó (null = Finance). SQL 11 de la nube. */
  app?: string | null;
  created_at: string;
  last_activity_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: AIAttachment[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIFolder {
  id: string;
  name: string;
}

/** Dirección de una ruta de IA en la nube. */
export const cloudAI = (path: string) => `${APP.cloudUrl.replace(/\/$/, '')}${path}`;

async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await authFetch(cloudAI(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, app: APP.slug }), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error('No se pudo conectar con la IA de App Master Cloud. Revisa tu conexión.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo conectar con la IA. Intenta de nuevo.');
  return data as T;
}

export interface SendAIParams {
  conversationId: string | null;
  text: string;
  attachments?: AIAttachment[];
  /** Engine picker id (utils/aiCatalog). */
  engine: string;
  /** Agent for a new "Iniciar chat" conversation. */
  agent?: string;
  regenerate?: boolean;
  editMessageId?: string | null;
  /** Lo que la persona ve en pantalla (Organiza: fecha/hora local, horario abierto). */
  screen?: string;
}

export const sendAIMessage = (p: SendAIParams, signal?: AbortSignal) =>
  post<{ conversation: AIConversation; userMessage: AIMessage | null; assistantMessage: AIMessage }>('/api/ai/chat', { ...p }, signal);

export interface AIAppInfo {
  engines: string[];
  allowed: string[];
  plan: string;
  /** false: la nube aún no tiene llaves de OpenAI / Claude. */
  configured: boolean;
  assistant: { name: string; emoji: string };
  agents: { id: string; emoji: string; name: string; tagline: string; suggestions: string[] }[];
  credits: { used: number | null; limit: number };
}

/** Motores que la nube puede usar, los que permite esta app, su asistente y agentes, y los créditos del mes. */
export async function fetchAvailableEngines(): Promise<AIAppInfo | null> {
  try {
    const res = await authFetch(cloudAI(`/api/ai/engines?app=${encodeURIComponent(APP.slug)}`));
    if (!res.ok) return null;
    const info = (await res.json()) as AIAppInfo;
    setAppAgents(info.agents ?? []);
    return info;
  } catch {
    return null;
  }
}

export const transcribeAI = (path: string, conversationId: string | null) => post<{ text: string; seconds: number }>('/api/ai/transcribe', { path, conversationId });

/** Uploads a chat attachment or voice note to the user's own folder in the private documents bucket. */
export async function uploadAIFile(file: Blob, name: string, sub: 'files' | 'audio' = 'files'): Promise<AIAttachment> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sesión no válida.');
  const ext = (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${data.user.id}/ai/${sub}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error('No se pudo subir el archivo.');
  return { path, name, mime: file.type || 'application/octet-stream', size: file.size };
}

export async function loadMessages(conversationId: string): Promise<AIMessage[]> {
  const { data } = await supabase.from('ai_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  return (data ?? []) as AIMessage[];
}

export async function loadConversation(id: string): Promise<AIConversation | null> {
  const { data } = await supabase.from('ai_conversations').select('*').eq('id', id).maybeSingle();
  return (data as AIConversation) ?? null;
}
