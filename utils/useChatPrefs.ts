'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ActiveSession } from '@/types/auth';
import { CommunityMessage } from '@/types/community';

// Per-user chat preferences (schema.sql "2026-10-04, chat completo"):
// favorite conversations (any kind, keyed by conversation id) and starred
// messages, stored with a snapshot so "Destacados" renders without loading
// the whole conversation.
export interface StarredMessage {
  id: string;
  conversation_key: string;
  message_id: string;
  preview: string;
  sender_name: string;
  message_at: string | null;
  created_at: string;
}

export function starPreview(m: CommunityMessage) {
  if (m.attachment) return `📎 ${m.attachment.name}`;
  if (m.audioPath) return '🎤 Mensaje de voz';
  if (m.noteId) return '📝 Nota';
  return m.text.slice(0, 280);
}

export function useChatPrefs(session: ActiveSession | null) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [starred, setStarred] = useState<StarredMessage[]>([]);
  const me = session?.userId ?? null;

  useEffect(() => {
    if (!me) return;
    (async () => {
      const [{ data: f }, { data: s }] = await Promise.all([
        supabase.from('chat_favorites').select('conversation_key'),
        supabase.from('chat_starred').select('*').order('created_at', { ascending: false }),
      ]);
      setFavorites(new Set(((f ?? []) as { conversation_key: string }[]).map((x) => x.conversation_key)));
      setStarred((s ?? []) as StarredMessage[]);
    })();
  }, [me]);

  const toggleFavorite = useCallback(
    async (key: string) => {
      if (!me) return;
      const on = favorites.has(key);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (on) next.delete(key);
        else next.add(key);
        return next;
      });
      if (on) await supabase.from('chat_favorites').delete().eq('conversation_key', key);
      else await supabase.from('chat_favorites').insert({ user_id: me, conversation_key: key });
    },
    [favorites, me]
  );

  const toggleStar = useCallback(
    async (conversationKey: string, m: CommunityMessage) => {
      if (!me) return;
      const existing = starred.find((x) => x.message_id === m.id);
      if (existing) {
        setStarred((prev) => prev.filter((x) => x.message_id !== m.id));
        await supabase.from('chat_starred').delete().eq('message_id', m.id);
        return;
      }
      const row = {
        user_id: me,
        conversation_key: conversationKey,
        message_id: m.id,
        preview: starPreview(m),
        sender_name: m.senderId === 'me' ? 'Tú' : m.senderName,
        message_at: m.createdAt,
      };
      const { data } = await supabase.from('chat_starred').insert(row).select().single();
      setStarred((prev) => [(data as StarredMessage) ?? { ...row, id: m.id, created_at: new Date().toISOString() }, ...prev]);
    },
    [starred, me]
  );

  return { favorites, starred, toggleFavorite, toggleStar };
}
