'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AIConversation, AIFolder } from '@/lib/aiClient';
import { APP } from '@/app.config';

/**
 * Plantilla: copia de Finance, solo con las conversaciones de esta app
 * (ai_conversations.app, SQL 11 de la nube). Las carpetas son de la persona.
 *
 * The signed-in user's IA history: conversations (auto-classified by mode:
 * Reportes / Chat abierto / Dato random) and user-created folders. Private per
 * user (RLS on user_id) — partners never see each other's chats, even about
 * Master Wolf data.
 */
export function useAIConversations(userId: string) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [folders, setFolders] = useState<AIFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [{ data: convs }, { data: flds }] = await Promise.all([
      supabase.from('ai_conversations').select('*').eq('user_id', userId).eq('app', APP.slug).order('last_activity_at', { ascending: false }).limit(200),
      supabase.from('ai_folders').select('id, name').eq('user_id', userId).order('created_at'),
    ]);
    setConversations((convs ?? []) as AIConversation[]);
    setFolders((flds ?? []) as AIFolder[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const upsertLocal = (c: AIConversation) =>
    setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at)));

  const rename = async (id: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    const { data } = await supabase.from('ai_conversations').update({ title: clean, title_locked: true }).eq('id', id).select().single();
    if (data) upsertLocal(data as AIConversation);
  };

  const moveToFolder = async (id: string, folderId: string | null) => {
    const { data } = await supabase.from('ai_conversations').update({ folder_id: folderId }).eq('id', id).select().single();
    if (data) upsertLocal(data as AIConversation);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
    if (!error) setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const createFolder = async (name: string) => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return null;
    const { data } = await supabase.from('ai_folders').insert({ user_id: userId, name: clean }).select('id, name').single();
    if (data) setFolders((prev) => [...prev, data as AIFolder]);
    return (data as AIFolder) ?? null;
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase.from('ai_folders').delete().eq('id', id);
    if (!error) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setConversations((prev) => prev.map((c) => (c.folder_id === id ? { ...c, folder_id: null } : c)));
    }
  };

  return { conversations, folders, loading, reload, upsertLocal, rename, moveToFolder, remove, createFolder, deleteFolder };
}

export type AIConversationsStore = ReturnType<typeof useAIConversations>;
